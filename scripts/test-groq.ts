import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local");
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    process.env[key] = val;
  }
}

loadEnv();

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log("No GROQ_API_KEY found in .env.local. Local heuristic checks will be used.");
    return;
  }

  console.log(`Connecting to Groq using key: ${apiKey.substring(0, 10)}...`);
  
  const start = Date.now();
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "ping" }],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(10000), // 10s
    });

    const duration = Date.now() - start;
    if (response.ok) {
      const data = await response.json();
      console.log(`Success! Ping completed in ${duration}ms.`);
      console.log("Response text:", data.choices?.[0]?.message?.content);
    } else {
      const text = await response.text();
      console.error(`Groq returned error code ${response.status} in ${duration}ms:`, text);
    }
  } catch (err: any) {
    console.error(`Connection error to Groq: ${err.message}`);
  }
}

testGroq();
