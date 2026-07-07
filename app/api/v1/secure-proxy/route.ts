/**
 * Rheo — /api/v1/secure-proxy
 *
 * POST { url } → x402 payment gate → fetch + evaluate in Pass 1 → return result in Pass 2.
 *
 * The x402 two-pass handshake is handled entirely by withGateway (lib/x402.ts):
 *   Pass 1: Fetch URL, run Groq evaluator, compute dynamic fee, cache to Supabase, return 402.
 *   Pass 2: Verify + settle payment, read cached result, call this handler.
 *
 * This handler implements the final delivery step — branching on the evaluator's
 * cached `action` to return allow / sanitize / quarantine responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { withGateway, type Settlement } from "@/lib/x402";

// The ENDPOINT string is embedded in the 402 resource URL so Pass 2 can
// extract the request ID from the query param (?id=<uuid>).
const ENDPOINT = "/api/v1/secure-proxy";

// =============================================================================
// Sanitizer — strips dangerous content from HTML for the "sanitize" action.
//
// What we strip and why:
//   <script> blocks      — executable JS that could run in any context
//   javascript: URIs     — same risk in href/src attributes
//   Inline event handlers (on*="...") — onclick, onerror, onload, etc.
//   <iframe> tags        — embeds arbitrary content, including cross-origin scripts
//
// We use simple string replacements rather than a full HTML parser because:
//   1. We're sending this to AI agents, not browsers — structural HTML matters
//      less than removing the actual injection vectors.
//   2. No additional npm dependencies needed.
//   3. Predictable, auditable behaviour — easy to reason about what gets removed.
// =============================================================================
function sanitizeContent(html: string): string {
  return html
    // Remove entire <script>…</script> blocks (case-insensitive, across newlines)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    // Remove <iframe>…</iframe> blocks entirely
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    // Remove inline event handler attributes: onclick="…", onerror="…", onload="…", etc.
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    // Remove javascript: URIs from href and src attributes
    .replace(/\s+(href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "")
    // Remove standalone javascript: protocol references
    .replace(/javascript:/gi, "");
}

/**
 * Route handler — called only after Circle Gateway confirms payment settlement.
 *
 * Receives the pre-fetched, pre-evaluated result from Pass 1 via settlement.cachedRequest.
 * No URL fetching or Groq calls happen here — Pass 1 already did both.
 */
async function handler(
  req: NextRequest,
  settlement: Settlement,
): Promise<NextResponse> {
  const cached = settlement.cachedRequest;

  if (!cached) {
    console.error("[Proxy] Route handler invoked without cached request metadata.");
    return NextResponse.json(
      { error: "Internal server error: cached request metadata missing." },
      { status: 500 },
    );
  }

  const action = cached.action ?? "allow";

  // Standard headers on every response — lets the agent inspect the firewall decision
  // without parsing the JSON body.
  const responseHeaders = new Headers({
    "X-Rheo-Action": action,
    "X-Rheo-Risk-Score": String(cached.risk_score ?? 0),
    "X-Rheo-Request-ID": cached.id ?? "",
  });

  // ============================================================================
  // QUARANTINE — content too dangerous to return.
  //
  // The payment already settled, so we return 200 (the agent paid for a firewall
  // decision, not necessarily for content). No content body — only action +
  // reasoning so the agent knows why it was blocked.
  // ============================================================================
  if (action === "quarantine") {
    console.log(`[Proxy] Quarantine response for request ${cached.id}: ${cached.reasoning}`);
    return NextResponse.json(
      {
        id: cached.id,
        target_url: cached.target_url,
        action: "quarantine",
        risk_score: Number(cached.risk_score ?? 1.0),
        reasoning: cached.reasoning ?? "Content quarantined: security threat detected.",
        content: null,
        amount_usdc: cached.amount_usdc,
        payer_address: settlement.payer,
        gateway_tx: settlement.gatewayTx,
      },
      { status: 200, headers: responseHeaders },
    );
  }

  // ============================================================================
  // SANITIZE — content had risky elements but the page itself was useful.
  //
  // Strip <script> blocks, <iframe> embeds, inline event handlers (onclick, etc.),
  // and javascript: URIs. Return the cleaned content — the agent still gets the
  // page's information value without the execution vectors.
  // ============================================================================
  if (action === "sanitize") {
    const rawContent = cached.content ?? "";
    const cleanContent = sanitizeContent(rawContent);
    console.log(`[Proxy] Sanitized response for request ${cached.id}: ${rawContent.length} → ${cleanContent.length} bytes`);
    return NextResponse.json(
      {
        id: cached.id,
        target_url: cached.target_url,
        action: "sanitize",
        risk_score: Number(cached.risk_score ?? 0),
        reasoning: cached.reasoning ?? "Content sanitized: risky elements removed.",
        content: cleanContent,
        contentType: cached.content_type ?? "text/html",
        amount_usdc: cached.amount_usdc,
        payer_address: settlement.payer,
        gateway_tx: settlement.gatewayTx,
      },
      { status: 200, headers: responseHeaders },
    );
  }

  // ============================================================================
  // ALLOW — content is clean. Return it unmodified.
  // ============================================================================
  console.log(`[Proxy] Allow response for request ${cached.id}`);
  return NextResponse.json(
    {
      id: cached.id,
      target_url: cached.target_url,
      action: "allow",
      risk_score: Number(cached.risk_score ?? 0.0),
      reasoning: cached.reasoning ?? "Content assessed as safe.",
      content: cached.content ?? "",
      contentType: cached.content_type ?? "text/plain",
      amount_usdc: cached.amount_usdc,
      payer_address: settlement.payer,
      gateway_tx: settlement.gatewayTx,
    },
    { status: 200, headers: responseHeaders },
  );
}

// withGateway's second argument (price placeholder) is kept for interface
// compatibility but is ignored — Pass 1 inside withGateway computes the
// dynamic fee from evaluateContent() + calculateFee().
export const POST = withGateway(handler, "$0.001", ENDPOINT);

