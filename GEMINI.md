# GEMINI.md — Rheo (Lepton Hackathon)

**Project name: Rheo** — from the Greek *rheo* ("to flow"), reflecting the flow of content through the pipeline and value through nanopayments. Use this name consistently in all generated copy, UI, package.json, README, and commit messages. Do not let any agent invent an alternate name or wordmark.

Persistent context for all agents/subagents working on this repo. Read this before generating any code.

## Project overview

A metered security firewall for AI agents. Agents send us a target URL; we fetch the page, run it through a risk evaluator, and return cleaned (or quarantined) content. Every use triggers a nanopayment via x402 on Arc testnet.

```
Agent → POST target URL to /api/v1/secure-proxy
     → fetch page content
     → Groq (Llama-3-8b-instant) evaluates injection risk
     → returns { risk_score, action, reasoning, dynamic_fee_multiplier }
     → deterministic TS function computes fee from risk_score + token_count
     → x402 handshake via Circle Gateway settles testnet USDC on Arc
     → log to Supabase
     → return clean/quarantined content to agent
```

## Tech stack

- Frontend + API routes: Next.js, Tailwind
- Payments: `circlefin/arc-nanopayments` template, x402 protocol, Circle Gateway (Arc testnet)
- DB/logging: Supabase (reuse Circle's official transaction-history schema)
- Risk evaluator: Groq API, Llama-3-8b-instant
- No Solidity required — x402/Gateway is an off-chain payment-request layer on top of existing USDC contracts. Confirm this once the template repo is cloned; don't budget Solidity time unless proven otherwise.

## Non-negotiable rules

1. **Fail-closed, never fail-open.** Any Groq timeout, rate limit, or malformed response → auto-quarantine + return 402/500. A security tool that fails open is worse than useless.
2. **The LLM never sets the price.** The evaluator only returns `risk_score` and `action`. A separate, plain TypeScript function computes the actual fee:
   ```
   fee = base_fee * (1 + risk_score * multiplier) + token_count * rate
   ```
   This must be inspectable and testable in isolation — no LLM call in the pricing path.
3. **Evaluator output must match this exact schema:**
   ```json
   {
     "risk_score": 0.0,
     "action": "allow" | "sanitize" | "quarantine",
     "reasoning": "string",
     "dynamic_fee_multiplier": 1.0
   }
   ```
   Validate before use. Small/fast models drift from strict JSON under load — one retry, then fail-closed to quarantine if still invalid. Never crash or pass through unvalidated output.
4. **Real decisions, not fixed rules.** The evaluator must reason about the actual content it receives, not pattern-match a static blocklist. This is the project's core "agentic" claim — don't let it degrade back into a regex filter for the sake of speed.
5. **Demo honesty.** `scripts/simulate-load.ts` is a synthetic load-test harness (100 URLs, mix of clean/injected content). It is explicitly a test harness in all copy/UI/pitch materials — never described as organic user traction.

## Model routing (Antigravity)

| Task | Model | Why |
|---|---|---|
| Next.js routes, Tailwind UI, dashboard | Gemini 3.5 Flash | fast, low-risk, easy to self-review |
| Supabase wiring, harness script | Gemini 3.5 Flash | straightforward plumbing |
| Circle Gateway / x402 handshake | Claude Sonnet 4.6 | payment/signature logic — highest-stakes, least-familiar code |
| Dynamic fee formula | Claude Sonnet 4.6 | must be deterministic and correct |
| Fail-closed error handling | Claude Sonnet 4.6 | security-critical path |
| Architecture/planning pass | Claude Sonnet 4.6 (override default) | this stack has unfamiliar blockchain plumbing — give planning extra reasoning depth |
| Genuinely stuck moments | Claude Opus 4.6 | reserve only, don't default to it |

## Context note for agents: explain, don't just generate

The developer on this project is a frontend engineer who is rebuilding blockchain fundamentals after time away from the space. For any code touching Circle Gateway, x402, wallet/signature handling, or Arc testnet mechanics:
- Add a short plain-language comment above the relevant block explaining *what it does and why*, not just *what it is*.
- When asked to review or explain a change, walk through the actual flow step by step (what triggers it, what data moves, what could fail) rather than summarizing at a high level.
- Flag anything that's a blockchain-specific gotcha (nonce handling, signature expiry, testnet vs mainnet config, gas/fee assumptions) explicitly — don't assume prior familiarity.
This isn't a tone preference, it's a review-safety measure: the dev cannot self-audit this code as fast as the frontend code, so agent-generated explanations are the primary QA step for this layer.

## Build order

1. Clone `circlefin/arc-nanopayments`, verify its default example runs end-to-end before touching custom logic.
2. `/api/v1/secure-proxy` route skeleton.
3. Groq evaluator + schema validation/retry.
4. Wire evaluator → fee function → x402 payment call.
5. Fail-closed handling around Groq/Gateway failures.
6. Supabase logging.
7. Dashboard (see `brand-guidelines.md` for visual direction) — build once step 6 produces real rows.
8. `scripts/simulate-load.ts` + demo recording.

## Hackathon logistics (Lepton Agents Hackathon · Canteen × Circle)

- **Deadline:** July 6, 11:59 PM ET. Confirm your actual remaining hours against this, not an assumed "24 hours."
- **Register/setup before coding:**
  1. Register on Luma (`luma.com/5xcrazms`).
  2. Join the Canteen Discord and the Arc builder Discord — mention Canteen + Lepton when you join.
  3. Install the ARC CLI and Circle CLI. The ARC CLI bundles Arc repos/docs as agent context, so Antigravity builds against real Arc conventions instead of guessing — do this before writing any payment code, not after.
- **Testnet USDC:** don't hunt for a faucet — TestMint (hackathon partner) offers testnet USDC via x402, listed on the hackathon page.
- **Judging weights: 30 / 30 / 20 / 20**
  - Agentic Sophistication (30%) — does the AI make real decisions, not just automate.
  - Traction (30%) — genuine usage; the submission form explicitly asks how many users you onboarded. Our synthetic harness must stay framed as a load-test/demo tool, never as user traction.
  - Circle tool usage (20%) — Wallets, Gateway/Nanopayments, App Kit, Contracts, x402, USDC. This build covers Gateway/x402/USDC solidly; App Kit and Contracts are untouched by design — known tradeoff, not an oversight.
  - Innovation (20%).
- **RFB fit:** this project sits closer to RFB 02/05 (agent services / nanopayment infra) than RFB 06 (creator/publisher monetization), which this round leans toward. Not disqualifying — the FAQ confirms "something else" is fine as long as it's real and runs on Arc — but expect it to be judged as an off-track entry, so the submission write-up should proactively state the fit rather than assume judges infer it.

## Confirmed payment architecture (do not deviate from this)

Verified directly against `circlefin/arc-nanopayments` and Circle's own docs — supersedes any earlier assumption in this file or elsewhere about needing Circle developer-portal API keys.

- **SDK:** `@circle-fin/x402-batching`, used on both sides — `BatchFacilitatorClient`/`createGatewayMiddleware` on the server (Next.js API routes), `GatewayClient` on the client (the paying agent).
- **No `CIRCLE_API_KEY` / `CIRCLE_ENTITY_SECRET` needed.** Payments are resolved off-chain using plain wallet private keys: `SELLER_PRIVATE_KEY` (ours) and the buyer's private key. Both are generated fresh via the repo's own `npm run generate-wallets` script — never supplied manually, never reused from elsewhere.
- **How it actually works:** the buyer signs an EIP-3009 payment authorization locally (no gas, no broadcast). The seller's middleware verifies that signature instantly off-chain via Circle's hosted facilitator (`facilitatorUrl: "https://gateway-api-testnet.circle.com"` on Arc Testnet), returns `402` if unpaid / `200` if paid, and Circle settles verified payments in batches on-chain later. This is what makes sub-cent payments practical — no per-payment gas cost.
- **`maxTimeoutSeconds`**: set to `432000` (5 days). Circle Gateway hard-enforces a 3-day (`259200`s) minimum — going below this breaks payments entirely, don't set anything lower. The repo default is 4 days (`345600`s); we increased slightly to 5 days for a safer clock-drift buffer while still keeping the leaked-signature exposure window reasonably tight. Do not extend this further (e.g. back to 30 days) without a specific reason — longer windows mean a leaked/compromised signature stays redeemable for longer.
- **Security note:** these are real private keys, even on testnet. Confirm `.env.local` (not `.env.local.example`) is gitignored before generating wallets, and never commit real key values.

If any agent or prompt reverts to assuming Circle API keys are required, that's a regression — correct it back to this architecture.

## See also

`brand-guidelines.md` for visual/UI direction and tone.
