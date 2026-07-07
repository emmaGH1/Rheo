import { createClient } from "@supabase/supabase-js";
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

async function checkDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing credentials");
    process.exit(1);
  }

  console.log(`Connecting to Supabase at: ${url}...`);
  const supabase = createClient(url, key);

  try {
    const start = Date.now();
    const { data, error } = await supabase
      .from("proxy_requests")
      .select("count", { count: "exact", head: true });
    
    if (error) {
      console.error("Error querying table:", error.message, error.details);
    } else {
      console.log(`Successfully connected! Query took ${Date.now() - start}ms. Count:`, data);
    }
  } catch (err: any) {
    console.error("Uncaught connection error:", err.message || err);
  }
}

checkDb();
