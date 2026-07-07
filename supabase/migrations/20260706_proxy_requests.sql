-- Rheo: proxy_requests table
-- Run this in the Supabase SQL Editor (https://tyugmghhrthmidqqbcbk.supabase.co → SQL Editor).
--
-- This logs every settled proxy request so we can show real-time activity
-- on the Rheo dashboard and provide an audit trail of payments.

create table if not exists public.proxy_requests (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),
  target_url     text        not null,
  payer_address  text,                   -- Nullable in pending state (Pass 1)
  amount_usdc    text        not null,   -- Stored as decimal string (e.g. "0.001")
  status         text        not null    default 'pending', -- 'pending' | 'settled' | 'failed'
  risk_score     numeric,                -- Scale of 0.0 to 1.0
  action         text,                   -- 'allow' | 'sanitize' | 'quarantine'
  reasoning      text,
  content        text,                   -- Cached content for Pass 2 retrieval
  content_type   text,                   -- Content-Type header of fetched content
  gateway_tx     text,                   -- Circle settlement transaction hash/id
  network        text                    -- Arc network ID
);

-- Safely add columns if the table already existed from a previous run
alter table public.proxy_requests add column if not exists status text not null default 'pending';
alter table public.proxy_requests add column if not exists risk_score numeric;
alter table public.proxy_requests add column if not exists action text;
alter table public.proxy_requests add column if not exists reasoning text;
alter table public.proxy_requests add column if not exists content text;
alter table public.proxy_requests add column if not exists content_type text;
alter table public.proxy_requests add column if not exists gateway_tx text;
alter table public.proxy_requests add column if not exists network text;
alter table public.proxy_requests alter column payer_address drop not null;

-- Only the server (service-role key) should write to this table.
-- The publishable/anon key gets read-only access for the dashboard.
alter table public.proxy_requests enable row level security;

-- Allow the service-role key (used by the API route) to insert/update rows.
create policy "service_role can insert"
  on public.proxy_requests
  for insert
  to service_role
  with check (true);

create policy "service_role can update"
  on public.proxy_requests
  for update
  to service_role
  using (true)
  with check (true);

-- Allow the anon/publishable key (used by the frontend dashboard) to read rows.
create policy "anon can read"
  on public.proxy_requests
  for select
  to anon
  using (true);
