import { NextRequest, NextResponse } from "next/server";
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

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";

export async function POST(req: NextRequest) {
  const steps: string[] = [];
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "Missing parameter: 'url'." }, { status: 400 });
    }

    const funderKey = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
    if (!funderKey) {
      return NextResponse.json(
        { error: "Server misconfiguration: BUYER_PRIVATE_KEY not set." },
        { status: 500 }
      );
    }

    const host = req.headers.get("host") ?? "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") ?? "http";
    const proxyUrl = `${protocol}://${host}/api/v1/secure-proxy`;

    steps.push(`[1/6] Created ephemeral agent wallet to pay for request.`);
    const ephemeralKey = generatePrivateKey();
    const ephemeralAccount = privateKeyToAccount(ephemeralKey);
    steps.push(`  ↳ Address: ${ephemeralAccount.address}`);

    steps.push(`[2/6] Funding ephemeral wallet from buyer master wallet.`);
    const funderAccount = privateKeyToAccount(funderKey);
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(ARC_TESTNET_RPC),
    });

    const funderWallet = createWalletClient({
      account: funderAccount,
      chain: arcTestnet,
      transport: http(ARC_TESTNET_RPC),
    });

    // Send Gas
    const gasTx = await funderWallet.sendTransaction({
      to: ephemeralAccount.address,
      value: parseEther("0.015"),
    });
    steps.push(`  ↳ Gas Tx: ${gasTx.substring(0, 10)}...${gasTx.substring(gasTx.length - 8)} (0.015 USDC as gas)`);
    await publicClient.waitForTransactionReceipt({ hash: gasTx });

    // Send USDC
    const usdcTx = await funderWallet.writeContract({
      address: ARC_TESTNET_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [ephemeralAccount.address, parseUnits("0.15", 6)],
    });
    steps.push(`  ↳ USDC Tx: ${usdcTx.substring(0, 10)}...${usdcTx.substring(usdcTx.length - 8)} (0.15 USDC transferred)`);
    await publicClient.waitForTransactionReceipt({ hash: usdcTx });

    steps.push(`[3/6] Initializing Circle Gateway client and depositing 0.15 USDC.`);
    const gateway = new GatewayClient({
      chain: "arcTestnet",
      privateKey: ephemeralKey,
    });

    const depositRes = await gateway.deposit("0.15");
    steps.push(`  ↳ Gateway Deposit Tx: ${depositRes.depositTxHash.substring(0, 10)}...`);

    const balances = await gateway.getBalances();
    steps.push(`  ↳ Available Gateway Balance: ${balances.gateway.formattedAvailable} USDC`);

    steps.push(`[4/6] Sending Pass 1 HTTP request to secure-proxy. Intercepting 402 challenge.`);
    steps.push(`[5/6] Decoding PAYMENT-REQUIRED header, calculating dynamic fee, and signing EIP-3009 auth payload.`);
    steps.push(`[6/6] Sending Pass 2 HTTP request with signature. Circle Gateway settled payment.`);

    const payRes = await gateway.pay(proxyUrl, {
      method: "POST",
      body: { url },
    });

    steps.push(`[Success] Payment settled! Spent: ${payRes.formattedAmount} USDC. Tx: ${payRes.transaction.substring(0, 12)}...`);

    return NextResponse.json({
      success: true,
      steps,
      data: payRes.data,
      amount: payRes.formattedAmount,
      transaction: payRes.transaction,
      payer: ephemeralAccount.address,
    });

  } catch (err: any) {
    console.error("[SimulateRequest] Failed:", err);
    steps.push(`[Error] Simulation failed: ${err.message || err}`);
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      steps,
    }, { status: 500 });
  }
}
