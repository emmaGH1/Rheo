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

async function main() {
  console.log("=== Rheo x402 End-to-End Secure Proxy Test ===");

  // 1. Setup Ephemeral wallet to represent the paying agent
  const ephemeralKey = generatePrivateKey();
  const ephemeralAccount = privateKeyToAccount(ephemeralKey);
  console.log(`\nGenerated Ephemeral Agent Wallet: ${ephemeralAccount.address}`);

  // 2. Fund the ephemeral wallet
  const funderAccount = privateKeyToAccount(funderKey as `0x${string}`);
  console.log(`Funding ephemeral wallet from Buyer wallet: ${funderAccount.address}...`);

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
  console.log("Sending Gas...");
  const gasTx = await funderWallet.sendTransaction({
    to: ephemeralAccount.address,
    value: parseEther("0.01"),
  });
  await publicClient.waitForTransactionReceipt({ hash: gasTx });
  console.log(`Gas funded! Tx: ${gasTx}`);

  // Fund USDC (0.1 USDC to deposit into Gateway)
  console.log("Sending USDC...");
  const usdcTx = await funderWallet.writeContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: "transfer",
    args: [ephemeralAccount.address, parseUnits("0.1", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: usdcTx });
  console.log(`USDC funded! Tx: ${usdcTx}`);

  // 3. Initialize GatewayClient and Deposit
  console.log("\nInitializing GatewayClient and depositing 0.1 USDC...");
  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: ephemeralKey,
  });

  const depositRes = await gateway.deposit("0.1");
  console.log(`Deposit successful! Tx: ${depositRes.depositTxHash}`);

  const balances = await gateway.getBalances();
  console.log(`Gateway Available Balance: ${balances.gateway.formattedAvailable} USDC`);

  // 4. Test target URL request (Pass 1: challenge)
  console.log(`\nSending request to secure proxy: ${PROXY_URL}`);
  console.log("Target URL: https://example.com");

  const targetBody = { url: "https://example.com" };

  // Use the SDK's pay method to handle the two-pass payment handshake automatically
  console.log("Executing Gateway client pay() request...");
  try {
    const payRes = await gateway.pay(PROXY_URL, {
      method: "POST",
      body: targetBody,
    });

    console.log("\n=== Success! Proxy Response Received ===");
    console.log(`Payer: ${ephemeralAccount.address}`);
    console.log(`USDC Amount Paid: ${payRes.formattedAmount} USDC`);
    console.log(`Settlement Transaction: ${payRes.transaction}`);
    console.log(`Response Content Preview:\n`);
    // Print the first 400 chars of response content
    const content = (payRes.data as any)?.content || JSON.stringify(payRes.data);
    console.log(content.substring(0, 400) + "...\n");
    console.log("=== Check Supabase dashboard 'payment_events' for logged row! ===");
  } catch (error: any) {
    console.error("Handshake / Payment request failed:", error.message || error);
  }
}

main().catch((err) => {
  console.error("Test failed with error:", err);
});
