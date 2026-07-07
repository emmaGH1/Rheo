/**
 * Rheo Dynamic Fee Calculator.
 * Implements the deterministic pricing logic based on risk score and payload size (tokens).
 */

export interface FeeCalculationParams {
  riskScore: number;          // Evaluator risk_score (0.0 to 1.0)
  tokenCount: number;         // Payload size in tokens
  baseFee?: number;           // Default base fee in USDC cents / micro-USDC (defaults to 1000 = 0.001 USDC)
  riskMultiplier?: number;    // Multiplier factor for risk (defaults to 2)
  ratePerToken?: number;      // Cost per token (defaults to 1 = 0.000001 USDC per token)
}

/**
 * Computes the transaction fee deterministically based on risk and token usage.
 * 
 * Formula:
 * fee = base_fee * (1 + risk_score * multiplier) + token_count * rate
 * 
 * Note: All fee calculations should ideally return integer values in micro-units (e.g. millionths of USDC,
 * matching Circle's token decimals) to avoid floating-point inaccuracies.
 */
export function calculateFee({
  riskScore,
  tokenCount,
  baseFee = 1000,          // base fee e.g. 1000 micro-USDC ($0.001)
  riskMultiplier = 2.0,    // risk score scaling multiplier
  ratePerToken = 1,        // rate per token in micro-USDC ($0.000001)
}: FeeCalculationParams): number {
  // Ensure riskScore is bounded between 0 and 1
  const boundedRisk = Math.max(0, Math.min(1, riskScore));
  
  const riskCost = baseFee * (1 + boundedRisk * riskMultiplier);
  const tokenCost = tokenCount * ratePerToken;
  
  // Return total fee rounded to nearest integer
  return Math.round(riskCost + tokenCost);
}
