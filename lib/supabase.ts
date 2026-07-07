/**
 * Rheo — Supabase server-side client.
 *
 * Uses the service-role key for privileged writes from API routes.
 * This key bypasses Row Level Security — never expose it to the browser.
 *
 * Table: proxy_requests
 *   id             uuid  (generated)
 *   created_at     timestamptz
 *   target_url     text
 *   payer_address  text
 *   amount_usdc    text   (stored as text to avoid float rounding)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — the client is created on first use, not at import time.
// This prevents next build from crashing when SUPABASE_URL is absent in the
// build environment (env vars are only available at request time in production).
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "[Supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
      );
    }
    // Server-only Supabase client initialized with the service-role key so
    // API route inserts succeed regardless of Row Level Security policies.
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export interface ProxyLogRecord {
  endpoint:    string;
  payer:       string;
  amount_usdc: string;
  network:     string;
  gateway_tx?: string;
  raw:         { target_url: string; [key: string]: any };
}

/**
 * Inserts a single transaction record into the payment_events table.
 *
 * Logging failures are non-fatal — we log the error but do not throw.
 * A settled payment should always return its content even if Supabase is
 * temporarily unavailable; observability should never gate correctness.
 */
export async function logProxyRequest(record: ProxyLogRecord): Promise<void> {
  const { error } = await getSupabase()
    .from("payment_events")
    .insert([record]);

  if (error) {
    console.error("[Supabase] Failed to log payment event:", error.message, error.details);
  } else {
    console.log(`[Supabase] Logged payment event to table: ${record.endpoint} from ${record.payer}`);
  }
}

export interface ProxyRequestRecord {
  id?: string;
  created_at?: string;
  target_url: string;
  payer_address?: string | null;
  amount_usdc: string;
  status: 'pending' | 'settled' | 'failed';
  risk_score?: number | null;
  action?: 'allow' | 'sanitize' | 'quarantine' | null;
  reasoning?: string | null;
  content?: string | null;
  content_type?: string | null;
  gateway_tx?: string | null;
  network?: string | null;
}

/**
 * Creates a new pending proxy request in Supabase in Pass 1.
 */
export async function createPendingRequest(record: Omit<ProxyRequestRecord, 'status'>): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("proxy_requests")
    .insert([{ ...record, status: 'pending' }])
    .select("id")
    .single();

  if (error) {
    console.error("[Supabase] Failed to create pending request:", error.message, error.details);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Retrieves a pending proxy request in Pass 2 to verify fee terms.
 */
export async function getPendingRequest(id: string): Promise<ProxyRequestRecord | null> {
  const { data, error } = await getSupabase()
    .from("proxy_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`[Supabase] Failed to get pending request ${id}:`, error.message);
    return null;
  }
  return data;
}

/**
 * Settles a pending proxy request in Pass 2 after Circle payment settlement confirms.
 */
export async function settleRequest(
  id: string,
  payerAddress: string,
  network: string,
  gatewayTx?: string
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("proxy_requests")
    .update({
      status: 'settled',
      payer_address: payerAddress,
      network: network,
      gateway_tx: gatewayTx ?? null,
    })
    .eq("id", id);

  if (error) {
    console.error(`[Supabase] Failed to settle request ${id}:`, error.message);
    return false;
  }
  return true;
}

