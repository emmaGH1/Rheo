import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  parseUnits,
  parseEther,
} from "viem";
import { arcTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Helper: Load .env.local manually
// =============================================================================
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local. Please create it first.");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitIndex = trimmed.indexOf("=");
    if (splitIndex === -1) continue;
    const key = trimmed.substring(0, splitIndex).trim();
    let val = trimmed.substring(splitIndex + 1).trim();
    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    process.env[key] = val;
  }
}

loadEnv();

const funderKey = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!funderKey) {
  console.error("BUYER_PRIVATE_KEY not set in .env.local");
  process.exit(1);
}

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const PROXY_URL = "http://localhost:3000/api/v1/secure-proxy";

// Test target URLs reflecting the three security behaviors (Clean, Injected, Script)
const TEST_TARGETS = [
  { url: "https://rheo-test-clean.com/home", type: "Clean" },
  { url: "https://rheo-test-clean.com/about", type: "Clean" },
  { url: "https://rheo-test-clean.com/docs", type: "Clean" },
  { url: "https://rheo-test-injected.com/attacker-prompt", type: "Injected" },
  { url: "https://rheo-test-injected.com/override-rules", type: "Injected" },
  { url: "https://rheo-test-script.com/embed-js", type: "XSS/Script" },
  { url: "https://rheo-test-script.com/event-handlers", type: "XSS/Script" },
];

async function main() {
  console.log("==================================================");
  console.log("      RHEO METERED FIREWALL LOAD SIMULATOR        ");
  console.log("==================================================");

  // 1. Setup Ephemeral wallet to represent the paying agent
  const ephemeralKey = generatePrivateKey();
  const ephemeralAccount = privateKeyToAccount(ephemeralKey);
  console.log(`\n[Agent Setup] Generated Ephemeral Wallet: ${ephemeralAccount.address}`);

  // 2. Fund the ephemeral wallet
  if (!funderKey) {
    throw new Error("missing funder private key environment variable");
  }
  const funderAccount = privateKeyToAccount(funderKey);
  console.log(`[Agent Setup] Funding ephemeral wallet from Buyer: ${funderAccount.address}...`);

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC),
  });

  const funderWallet = createWalletClient({
    account: funderAccount,
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC),
  });

  // Fund Gas (0.01 USDC as native Gas)
  console.log("[Agent Setup] Sending Gas...");
  const gasTx = await funderWallet.sendTransaction({
    to: ephemeralAccount.address,
    value: parseEther("0.02"), // Extra gas buffer
  });
  await publicClient.waitForTransactionReceipt({ hash: gasTx });
  console.log(`[Agent Setup] Gas funded! Tx: ${gasTx}`);

  // Fund USDC (0.3 USDC to cover multiple calls)
  console.log("[Agent Setup] Sending USDC...");
  const usdcTx = await funderWallet.writeContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: "transfer",
    args: [ephemeralAccount.address, parseUnits("0.3", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: usdcTx });
  console.log(`[Agent Setup] USDC funded! Tx: ${usdcTx}`);

  // 3. Initialize GatewayClient and Deposit into the Gateway contract
  console.log("\n[Agent Setup] Initializing GatewayClient and depositing 0.3 USDC...");
  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: ephemeralKey,
  });

  const depositRes = await gateway.deposit("0.3");
  console.log(`[Agent Setup] Deposit successful! Tx: ${depositRes.depositTxHash}`);

  let balances = await gateway.getBalances();
  console.log(`[Agent Setup] Gateway Available Balance: ${balances.gateway.formattedAvailable} USDC`);

  // 4. Run load simulation
  const numRequests = 15;
  console.log(`\nStarting load simulation of ${numRequests} requests...\n`);

  const summary = {
    total: 0,
    successfulPayments: 0,
    allowCount: 0,
    sanitizeCount: 0,
    quarantineCount: 0,
    totalUsdcPaid: 0,
    riskScores: [] as number[],
  };

  for (let i = 1; i <= numRequests; i++) {
    // Pick a test case cyclically or randomly
    const testCase = TEST_TARGETS[(i - 1) % TEST_TARGETS.length];
    console.log(`--------------------------------------------------`);
    console.log(`[Request ${i}/${numRequests}] Target: ${testCase.url} (${testCase.type})`);

    try {
      // Execute the double-pass handshake via gateway.pay()
      const payRes = await gateway.pay(PROXY_URL, {
        method: "POST",
        body: { url: testCase.url },
      });

      summary.total++;
      summary.successfulPayments++;

      const amountPaid = parseFloat(payRes.formattedAmount);
      summary.totalUsdcPaid += amountPaid;

      const responseBody = payRes.data as any;
      const riskScore = responseBody?.risk_score ?? 0.0;
      const action = responseBody?.action ?? "allow";
      const reasoning = responseBody?.reasoning ?? "";

      summary.riskScores.push(riskScore);
      if (action === "allow") summary.allowCount++;
      else if (action === "sanitize") summary.sanitizeCount++;
      else if (action === "quarantine") summary.quarantineCount++;

      console.log(`Result: SUCCESS`);
      console.log(`  Payer Address: ${ephemeralAccount.address}`);
      console.log(`  USDC Paid:     ${amountPaid} USDC`);
      console.log(`  Risk Score:    ${riskScore}`);
      console.log(`  Action Taken:  ${action.toUpperCase()}`);
      console.log(`  Reasoning:     ${reasoning}`);
      console.log(`  Tx Hash:       ${payRes.transaction}`);

    } catch (error: any) {
      console.error(`Result: FAILED`);
      console.error(`  Error message: ${error.message || error}`);
    }

    // Small delay between requests to not overwhelm the RPC and facilitator
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // 5. Output beautiful final summary
  const avgRisk = summary.riskScores.length > 0
    ? (summary.riskScores.reduce((a, b) => a + b, 0) / summary.riskScores.length).toFixed(2)
    : "0.00";

  console.log(`\n==================================================`);
  console.log(`              SIMULATION COMPLETE                 `);
  console.log(`==================================================`);
  console.log(`Total Requests Sent:        ${summary.total}`);
  console.log(`Successful Payments Settled: ${summary.successfulPayments}`);
  console.log(`Total USDC Spent:           ${summary.totalUsdcPaid.toFixed(6)} USDC`);
  console.log(`Average Risk Score:         ${avgRisk}`);
  console.log(`Actions Taken:`);
  console.log(`  ALLOW:                    ${summary.allowCount}`);
  console.log(`  SANITIZE:                 ${summary.sanitizeCount}`);
  console.log(`  QUARANTINE:               ${summary.quarantineCount}`);
  console.log(`==================================================`);
}

main().catch((err) => {
  console.error("Simulation script failed:", err);
});
