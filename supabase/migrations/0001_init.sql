-- Vaultix initial schema (specs/02-backend.md §2).
--
-- Off-chain data only. No column stores an order's status: it is always read
-- from the on-chain `Order` account or derived from `order_events`.
-- RLS is enabled on every table. The only policy for anon/authenticated is
-- reading listed listings (and listing photos in storage). Everything else
-- goes through API routes using the service role.
--
-- Amounts are minimal token units in numeric(20,0) (u64 does not fit bigint).
-- Pubkeys are base58 text.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  privy_user_id text primary key,
  wallet_pubkey text not null unique,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_pubkey text not null,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 1000),
  photo_paths text[] not null
    check (array_ndims(photo_paths) = 1 and cardinality(photo_paths) between 1 and 3),
  amount_units numeric(20, 0) not null
    check (amount_units > 0 and amount_units <= 18446744073709551615),
  order_id numeric(20, 0) not null
    check (order_id >= 0 and order_id <= 18446744073709551615),
  order_pda text unique,
  listing_hash text check (listing_hash ~ '^[0-9a-f]{64}$'),
  -- Lifecycle of the publication, NOT of the order.
  publication text not null default 'draft' check (publication in ('draft', 'listed')),
  created_at timestamptz not null default now()
);

create index listings_seller_pubkey_idx on public.listings (seller_pubkey);

create table public.shipping_info (
  order_pda text not null,
  buyer_pubkey text not null,
  full_name text not null,
  phone text not null,
  street text not null,
  city text not null,
  province text not null,
  postal_code text not null,
  notes text,
  created_at timestamptz not null default now(),
  primary key (order_pda, buyer_pubkey)
);

create table public.shipments (
  order_pda text primary key,
  carrier text not null check (carrier in ('andreani', 'oca', 'correo_argentino', 'otro')),
  tracking_number text not null,
  created_at timestamptz not null default now()
);

-- Append-only copy of on-chain events. `order_pda` holds the config PDA for
-- `ConfigUpdated`. Payload keys are snake_case; u64 amounts are strings.
create table public.order_events (
  signature text not null,
  event_index int not null check (event_index >= 0),
  order_pda text not null,
  event_type text not null check (event_type in (
    'OrderCreated', 'OrderPaid', 'OrderShipped', 'OrderReleased', 'OrderRefunded',
    'DisputeOpened', 'DisputeResolved', 'OrderClosed', 'ConfigUpdated'
  )),
  payload jsonb not null default '{}'::jsonb,
  slot bigint not null,
  block_time timestamptz,
  primary key (signature, event_index)
);

create index order_events_order_pda_type_idx on public.order_events (order_pda, event_type);
create index order_events_event_type_idx on public.order_events (event_type);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  order_pda text not null,
  uploader_pubkey text not null,
  kind text not null check (kind in ('photo', 'video', 'note')),
  storage_path text,
  note text,
  created_at timestamptz not null default now(),
  -- Files carry a storage path; notes carry text and no file.
  check ((kind = 'note') = (storage_path is null)),
  check (kind <> 'note' or note is not null)
);

create index dispute_evidence_order_pda_idx on public.dispute_evidence (order_pda);

-- Fee payer rate limit, one row per user per UTC day.
create table public.sponsor_usage (
  privy_user_id text not null,
  day date not null,
  count int not null default 0 check (count >= 0),
  primary key (privy_user_id, day)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.shipping_info enable row level security;
alter table public.shipments enable row level security;
alter table public.order_events enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.sponsor_usage enable row level security;

-- The only client-facing policy: anyone can read listed publications.
create policy "listed listings are public"
  on public.listings
  for select
  to anon, authenticated
  using (publication = 'listed');

-- ---------------------------------------------------------------------------
-- Atomic sponsor usage increment (service role only)
-- ---------------------------------------------------------------------------

create function public.increment_sponsor_usage(p_user text, p_day date)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.sponsor_usage as su (privy_user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (privy_user_id, day) do update set count = su.count + 1
  returning su.count;
$$;

revoke execute on function public.increment_sponsor_usage(text, date) from public, anon, authenticated;
grant execute on function public.increment_sponsor_usage(text, date) to service_role;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: they respect the caller's RLS)
-- ---------------------------------------------------------------------------

-- Parties of each order, taken from its OrderCreated / OrderPaid events.
create view public.reputation
with (security_invoker = true)
as
with parties as (
  select
    c.order_pda,
    c.payload ->> 'seller' as seller,
    p.payload ->> 'buyer' as buyer
  from public.order_events c
  left join public.order_events p
    on p.order_pda = c.order_pda and p.event_type = 'OrderPaid'
  where c.event_type = 'OrderCreated'
),
contributions as (
  -- Sale completed: released to the seller.
  select pa.seller as pubkey, 1 as sale, 0 as purchase, 0 as dispute_lost
  from public.order_events e
  join parties pa on pa.order_pda = e.order_pda
  where e.event_type = 'OrderReleased'
  union all
  -- Purchase completed: released, seen from the buyer.
  select pa.buyer, 0, 1, 0
  from public.order_events e
  join parties pa on pa.order_pda = e.order_pda
  where e.event_type = 'OrderReleased' and pa.buyer is not null
  union all
  -- Dispute resolved mostly in the seller's favor counts as a sale.
  select pa.seller, 1, 0, 0
  from public.order_events e
  join parties pa on pa.order_pda = e.order_pda
  where e.event_type = 'DisputeResolved'
    and (e.payload ->> 'buyer_share_bps')::int < 5000
  union all
  -- Dispute lost by the buyer: the deposit went to the seller.
  select pa.buyer, 0, 0, 1
  from public.order_events e
  join parties pa on pa.order_pda = e.order_pda
  where e.event_type = 'DisputeResolved'
    and (e.payload ->> 'deposit_to_buyer')::boolean = false
    and pa.buyer is not null
)
select
  pubkey,
  sum(sale)::int as sales_completed,
  sum(purchase)::int as purchases_completed,
  sum(dispute_lost)::int as disputes_lost_as_buyer
from contributions
where pubkey is not null
group by pubkey;

-- Global funnel metrics. Volume is in minimal units (USDC: 6 decimals).
create view public.metrics
with (security_invoker = true)
as
with counts as (
  select
    count(*) filter (where event_type = 'OrderCreated') as links_created,
    count(*) filter (where event_type = 'OrderPaid') as links_paid,
    coalesce(sum((payload ->> 'amount')::numeric) filter (where event_type = 'OrderPaid'), 0)
      as volume_units,
    count(*) filter (where event_type = 'OrderReleased') as orders_released,
    count(*) filter (where event_type = 'DisputeOpened') as disputes_opened,
    count(*) filter (where event_type = 'DisputeResolved') as disputes_resolved
  from public.order_events
)
select
  links_created::int,
  links_paid::int,
  round(links_paid::numeric / nullif(links_created, 0), 4) as conversion_rate,
  volume_units::numeric(30, 0) as volume_units,
  orders_released::int,
  round(orders_released::numeric / nullif(links_paid, 0), 4) as completion_rate,
  disputes_opened::int,
  disputes_resolved::int,
  (disputes_opened - disputes_resolved)::int as disputes_open
from counts;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-photos', 'listing-photos', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('dispute-evidence', 'dispute-evidence', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- Public read for listing photos only. No write policies: uploads go through
-- signed upload URLs issued by the API. dispute-evidence has no policies
-- (signed URLs from the service role only).
create policy "listing photos are public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'listing-photos');
