/**
 * Rheo — /api/v1/secure-proxy
 *
 * Thin vertical slice (Phase 1):
 *   Accept POST { url } → x402 payment gate → fetch URL → log → return raw content.
 *
 * What this does NOT do yet (added in Phase 2):
 *   - Groq risk evaluation (evaluator.ts)
 *   - Dynamic fee scaling based on risk_score + token_count (fee.ts)
 *   - Content sanitisation or quarantine based on action
 *
 * Flow:
 *   1. withGateway issues a 402 challenge if no payment header is present.
 *   2. The agent signs an EIP-712 authorization and retries.
 *   3. withGateway verifies + settles the payment via Circle's BatchFacilitatorClient.
 *   4. The handler below receives the request + settlement info (payer, amount).
 *   5. We validate the target URL, fetch its raw content, log to Supabase, and return.
 */

import { NextRequest, NextResponse } from "next/server";
import { withGateway, type Settlement } from "@/lib/x402";
import { logProxyRequest } from "@/lib/supabase";

// Flat placeholder price for Phase 1 — will be replaced with dynamic
// fee formula (base_fee * (1 + risk_score * multiplier) + token_count * rate)
// once the Groq evaluator is wired in Phase 2.
const FLAT_PRICE = "$0.001";
const ENDPOINT   = "/api/v1/secure-proxy";

/**
 * Route handler — called only after a payment is confirmed settled.
 *
 * It uses the pre-fetched and pre-evaluated request metadata cached in the
 * database during Pass 1, ensuring no duplicate fetches or Groq queries.
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

  // Headers for downstream client inspectability
  const responseHeaders = new Headers({
    "X-Rheo-Action": cached.action ?? "allow",
    "X-Rheo-Risk-Score": String(cached.risk_score ?? 0),
    "X-Rheo-Request-ID": cached.id ?? "",
  });

  return NextResponse.json(
    {
      id: cached.id,
      target_url: cached.target_url,
      action: cached.action ?? "allow",
      risk_score: Number(cached.risk_score ?? 0.0),
      reasoning: cached.reasoning ?? "No reasoning provided.",
      content: cached.content ?? "",
      contentType: cached.content_type ?? "text/plain",
      amount_usdc: cached.amount_usdc,
      payer_address: settlement.payer,
      gateway_tx: settlement.gatewayTx,
    },
    {
      status: 200,
      headers: responseHeaders,
    }
  );
}

// Export the POST route handler, wrapped with x402 payment gating.
export const POST = withGateway(handler, FLAT_PRICE, ENDPOINT);
