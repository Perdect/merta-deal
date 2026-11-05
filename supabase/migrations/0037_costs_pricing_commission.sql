-- ============================================================================
-- MERTA DEAL — Buying prices, selling prices, rider commission, settlements and profit.
--
-- Costing: moving weighted average. Every posted goods receipt (GRN) blends its landed unit cost
-- (line cost after discount + its share of freight and other costs, split by line value) into
-- inventory.avg_cost (per pack) or stock_pools.avg_cost_per_kg (loose produce). Batches and their
-- costs stay on the GRN lines, so history survives supplier price changes. A 500 g variant of loose
-- produce costs pack_grams / 1000 × cost per kg; its selling price is set on its own.
-- Every order line snapshots unit_cost at placement, so COGS and margins never drift when costs change.
--
-- Prices: inventory.selling_price / mrp stay the single truth. A trigger writes price_history for any
-- change, admin_set_price / admin_price_apply refuse a price below cost unless the admin confirms
-- (and the confirmation is recorded), and scheduled changes apply themselves when due.
--
-- Rider pay: a versioned rate card (one active). The quote is computed and frozen on the assignment
-- when the rider accepts; the earning row is written once, at verified delivery, from that frozen
-- quote. Failed attempts and cancellations after pickup earn the card's compensation. Adjustments are
-- separate rows with a reason. COD cash stays separate from earnings; a payout may offset cash due
-- only through an explicit reconciliation that records both amounts.
--
-- Distance basis for rider pay: store→customer straight-line km (what cart_summary and the assignment
-- already hold). Road distance is not available yet; the card records the basis it was quoted on.
-- Idempotent. Delivered still comes only from the OTP / audited support path.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
('packaging_cost_per_order', '3', 'finance', 'Packaging cost per order (₹)', 'Average bags, tape and labels per delivered order, used in the profit report.', false),
('online_payment_fee_percent', '2', 'finance', 'Online payment fee (%)', 'Gateway fee on prepaid orders, used in the profit report (Razorpay standard is about 2%).', false),
('cost_visibility_roles', '"admin"', 'finance', 'Who sees purchase costs', 'admin = every admin; super_admin = super admins only. Costs and margins never reach customers or riders.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Cost state and snapshots
-- ---------------------------------------------------------------------------
alter table public.inventory add column if not exists avg_cost numeric(12,4);
alter table public.stock_pools add column if not exists avg_cost_per_kg numeric(12,4);
alter table public.products add column if not exists last_purchase_price numeric(12,4);
alter table public.products add column if not exists last_purchase_unit text;
alter table public.products add column if not exists last_purchase_at timestamptz;
alter table public.order_items add column if not exists unit_cost numeric(12,4);

create or replace function public.can_see_costs()
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce(public.get_setting('cost_visibility_roles') #>> '{}', 'admin') when 'super_admin' then public.is_super_admin() else public.is_admin() end;
$$;

-- Cost of one sellable unit of a product (a pack, or a weighed pack of loose produce). Null when unknown.
create or replace function public.product_cost(p_product_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when p.stock_pool_id is not null then (select round(sp.avg_cost_per_kg * public.pack_grams(p.weight_value, p.weight_unit) / 1000.0, 4) from public.stock_pools sp where sp.id = p.stock_pool_id)
    else (select i.avg_cost from public.inventory i where i.product_id = p.id)
  end
  from public.products p where p.id = p_product_id;
$$;
revoke all on function public.product_cost(uuid) from public, anon, authenticated;

-- Each order line keeps the cost it was sold at.
create or replace function public.order_items_cost_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unit_cost is null then new.unit_cost := public.product_cost(new.product_id); end if;
  return new;
end $$;
drop trigger if exists order_items_cost_trg on public.order_items;
create trigger order_items_cost_trg before insert on public.order_items for each row execute function public.order_items_cost_snapshot();

-- Costs for the admin catalogue (never through public product RPCs).
create or replace function public.admin_product_costs(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.can_see_costs() then coalesce((select jsonb_object_agg(p.id, jsonb_build_object(
      'cost', public.product_cost(p.id), 'last_purchase_price', p.last_purchase_price, 'last_purchase_unit', p.last_purchase_unit, 'last_purchase_at', p.last_purchase_at,
      'selling_price', i.selling_price, 'margin', case when public.product_cost(p.id) is not null and i.selling_price > 0 then round((i.selling_price - public.product_cost(p.id)) / i.selling_price * 100, 1) end))
    from public.products p left join public.inventory i on i.product_id = p.id where p.id = any(p_ids)), '{}'::jsonb) else '{}'::jsonb end;
$$;
grant execute on function public.admin_product_costs(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suppliers, purchase orders, goods receipts
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, email text, gstin text, address text, notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create sequence if not exists public.purchase_doc_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique default ('PO-' || lpad(nextval('public.purchase_doc_seq')::text, 5, '0')),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  expected_at date,
  discount numeric(12,2) not null default 0 check (discount >= 0),
  freight numeric(12,2) not null default 0 check (freight >= 0),
  other_costs numeric(12,2) not null default 0 check (other_costs >= 0),
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  qty numeric(12,3) not null check (qty > 0),
  unit text not null check (unit in ('pack', 'carton', 'kg', 'g')),
  units_per_carton int check (units_per_carton is null or units_per_carton > 0),
  unit_price numeric(12,4) not null check (unit_price >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  line_total numeric(12,2) not null default 0,
  received_base_qty numeric(14,3) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (po_id);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_number text not null unique default ('GRN-' || lpad(nextval('public.purchase_doc_seq')::text, 5, '0')),
  po_id uuid references public.purchase_orders(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  received_at timestamptz not null default now(),
  invoice_no text,
  discount numeric(12,2) not null default 0 check (discount >= 0),
  freight numeric(12,2) not null default 0 check (freight >= 0),
  other_costs numeric(12,2) not null default 0 check (other_costs >= 0),
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  paid_amount numeric(12,2) not null default 0,
  notes text,
  received_by uuid references public.profiles(id) on delete set null,
  received_by_name text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.goods_receipts(id) on delete cascade,
  po_line_id uuid references public.purchase_order_lines(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  qty numeric(12,3) not null check (qty > 0),
  unit text not null check (unit in ('pack', 'carton', 'kg', 'g')),
  units_per_carton int check (units_per_carton is null or units_per_carton > 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  batch_no text,
  expiry_date date,
  line_total numeric(12,2) not null default 0,
  base_qty numeric(14,3),            -- packs, or grams for loose produce
  base_unit text,                    -- 'pack' | 'g'
  landed_unit_cost numeric(12,4),    -- per pack, or per kg for loose produce
  created_at timestamptz not null default now()
);
create index if not exists goods_receipt_lines_grn_idx on public.goods_receipt_lines (grn_id);
create index if not exists goods_receipt_lines_product_idx on public.goods_receipt_lines (product_id, created_at desc);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.goods_receipts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reference text, note text,
  paid_by uuid references public.profiles(id) on delete set null,
  paid_by_name text,
  paid_at timestamptz not null default now()
);

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;
alter table public.supplier_payments enable row level security;
do $$ declare t text; begin
  foreach t in array array['suppliers','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','supplier_payments'] loop
    execute format('drop policy if exists %I_admin_all on public.%I', t, t);
    execute format('create policy %I_admin_all on public.%I for all using (public.can_see_costs()) with check (public.can_see_costs())', t, t);
  end loop;
end $$;

-- Totals: each line fixes its own total before it is written; the header is re-summed after any line or
-- header-cost change. (A line trigger must never rewrite the lines table, or it fires itself forever.)
create or replace function public.purchase_line_total() returns trigger language plpgsql as $$
begin new.line_total := round(new.qty * new.unit_price - new.discount, 2); return new; end $$;
drop trigger if exists po_lines_total_trg on public.purchase_order_lines;
create trigger po_lines_total_trg before insert or update on public.purchase_order_lines for each row execute function public.purchase_line_total();
create or replace function public.grn_line_total() returns trigger language plpgsql as $$
begin new.line_total := round(new.qty * new.unit_cost - new.discount, 2); return new; end $$;
drop trigger if exists grn_lines_total_trg on public.goods_receipt_lines;
create trigger grn_lines_total_trg before insert or update on public.goods_receipt_lines for each row execute function public.grn_line_total();

create or replace function public._recalc_po(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.purchase_orders o set subtotal = coalesce((select sum(line_total) from public.purchase_order_lines where po_id = p_id), 0),
    total = coalesce((select sum(line_total) from public.purchase_order_lines where po_id = p_id), 0) - o.discount + o.freight + o.other_costs, updated_at = now()
  where id = p_id;
$$;
create or replace function public._recalc_grn(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.goods_receipts g set subtotal = coalesce((select sum(line_total) from public.goods_receipt_lines where grn_id = p_id), 0),
    total = coalesce((select sum(line_total) from public.goods_receipt_lines where grn_id = p_id), 0) - g.discount + g.freight + g.other_costs, updated_at = now()
  where id = p_id;
$$;
revoke all on function public._recalc_po(uuid) from public, anon, authenticated;
revoke all on function public._recalc_grn(uuid) from public, anon, authenticated;

create or replace function public.po_lines_recalc() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public._recalc_po(coalesce(new.po_id, old.po_id)); return null; end $$;
drop trigger if exists po_lines_recalc_trg on public.purchase_order_lines;
create trigger po_lines_recalc_trg after insert or update or delete on public.purchase_order_lines for each row execute function public.po_lines_recalc();
create or replace function public.po_head_recalc() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.discount is distinct from old.discount or new.freight is distinct from old.freight or new.other_costs is distinct from old.other_costs then perform public._recalc_po(new.id); end if; return null; end $$;
drop trigger if exists po_head_recalc_trg on public.purchase_orders;
create trigger po_head_recalc_trg after update on public.purchase_orders for each row execute function public.po_head_recalc();
create or replace function public.grn_lines_recalc() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public._recalc_grn(coalesce(new.grn_id, old.grn_id)); return null; end $$;
drop trigger if exists grn_lines_recalc_trg on public.goods_receipt_lines;
create trigger grn_lines_recalc_trg after insert or update or delete on public.goods_receipt_lines for each row execute function public.grn_lines_recalc();
create or replace function public.grn_head_recalc() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.discount is distinct from old.discount or new.freight is distinct from old.freight or new.other_costs is distinct from old.other_costs then perform public._recalc_grn(new.id); end if; return null; end $$;
drop trigger if exists grn_head_recalc_trg on public.goods_receipts;
create trigger grn_head_recalc_trg after update on public.goods_receipts for each row execute function public.grn_head_recalc();

-- A posted GRN is history: its lines cannot change.
create or replace function public.grn_lines_lock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.goods_receipts where id = coalesce(new.grn_id, old.grn_id) and status = 'posted') then raise exception 'GRN_POSTED: A posted receipt cannot be changed.'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists grn_lines_lock_trg on public.goods_receipt_lines;
create trigger grn_lines_lock_trg before insert or update or delete on public.goods_receipt_lines for each row execute function public.grn_lines_lock();

-- Posting a receipt: stock in, landed costs, moving average, PO progress. Once.
create or replace function public.post_goods_receipt(p_grn_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.goods_receipts; l record; p public.products; i public.inventory; v_sum numeric; v_extra numeric; v_share numeric; v_landed numeric; v_base numeric; v_grams bigint; v_packs int;
  v_old_qty numeric; v_old_cost numeric; v_pack numeric; n int := 0; v_po_total numeric;
begin
  if not public.can_see_costs() then raise exception 'FORBIDDEN'; end if;
  select * into g from public.goods_receipts where id = p_grn_id for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if g.status = 'posted' then return jsonb_build_object('ok', true, 'already', true); end if;
  if g.status = 'cancelled' then raise exception 'GRN_CANCELLED'; end if;
  if not exists (select 1 from public.goods_receipt_lines where grn_id = g.id) then raise exception 'NO_LINES: Add at least one line before posting.'; end if;
  perform public._recalc_grn(g.id);
  select * into g from public.goods_receipts where id = g.id;
  v_sum := greatest(g.subtotal, 0.01);
  v_extra := g.freight + g.other_costs - g.discount;   -- spread over lines by value
  perform pg_advisory_xact_lock(7710340);

  for l in select * from public.goods_receipt_lines where grn_id = g.id order by created_at loop
    select * into p from public.products where id = l.product_id;
    select * into i from public.inventory where product_id = p.id for update;
    if i.id is null then raise exception 'NOT_LISTED: % has no stock record yet. List it in the catalogue first.', p.name; end if;
    v_share := case when l.line_total > 0 then v_extra * l.line_total / v_sum else 0 end;
    if p.stock_pool_id is not null then
      if l.unit not in ('kg', 'g') then raise exception 'UNIT_NOT_ALLOWED: % is loose produce; receive it in kg or g.', p.name; end if;
      v_grams := case l.unit when 'kg' then round(l.qty * 1000) else round(l.qty) end;
      v_base := v_grams; v_landed := round((l.line_total + v_share) / (v_grams / 1000.0), 4);   -- per kg
      select balance_g, coalesce(avg_cost_per_kg, v_landed) into v_old_qty, v_old_cost from public.stock_pools where id = p.stock_pool_id for update;
      update public.stock_pools set balance_g = balance_g + v_grams, updated_at = now(),
        avg_cost_per_kg = round((v_old_qty * v_old_cost + v_grams * v_landed) / greatest(v_old_qty + v_grams, 1), 4) where id = p.stock_pool_id;
      perform public._pool_sync(p.stock_pool_id);
      v_pack := public.pack_grams(p.weight_value, p.weight_unit);
      insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id, note, stock_pool_id, delta_grams, quantity_entered, unit_entered)
      values (i.id, case when v_pack > 0 then trunc(v_grams / v_pack)::int else 0 end, 'grn', g.id, auth.uid(), format('%s · %s', g.grn_number, coalesce(l.batch_no, 'no batch')), p.stock_pool_id, v_grams, l.qty, l.unit);
      update public.goods_receipt_lines set base_qty = v_grams, base_unit = 'g', landed_unit_cost = v_landed where id = l.id;
    else
      if l.unit not in ('pack', 'carton') then raise exception 'UNIT_NOT_ALLOWED: % is prepacked; receive it in packs or cartons.', p.name; end if;
      if l.unit = 'carton' and l.units_per_carton is null then raise exception 'CARTON_SIZE_REQUIRED: Enter packs per carton for %.', p.name; end if;
      v_packs := round(l.qty * case l.unit when 'carton' then l.units_per_carton else 1 end)::int;
      if v_packs <= 0 then raise exception 'QUANTITY_REQUIRED'; end if;
      v_base := v_packs; v_landed := round((l.line_total + v_share) / v_packs, 4);   -- per pack
      v_old_qty := i.stock_qty; v_old_cost := coalesce(i.avg_cost, v_landed);
      update public.inventory set stock_qty = stock_qty + v_packs,
        avg_cost = round((greatest(v_old_qty, 0) * v_old_cost + v_packs * v_landed) / greatest(greatest(v_old_qty, 0) + v_packs, 1), 4) where id = i.id;
      insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id, note, quantity_entered, unit_entered)
      values (i.id, v_packs, 'grn', g.id, auth.uid(), format('%s · %s', g.grn_number, coalesce(l.batch_no, 'no batch')), l.qty, l.unit);
      update public.goods_receipt_lines set base_qty = v_packs, base_unit = 'pack', landed_unit_cost = v_landed where id = l.id;
    end if;
    update public.products set last_purchase_price = l.unit_cost, last_purchase_unit = l.unit, last_purchase_at = g.received_at where id = p.id;
    if l.po_line_id is not null then update public.purchase_order_lines set received_base_qty = received_base_qty + v_base where id = l.po_line_id; end if;
    n := n + 1;
  end loop;

  update public.goods_receipts set status = 'posted', posted_at = now(), received_by = coalesce(received_by, auth.uid()), received_by_name = coalesce(received_by_name, public._actor_name()) where id = g.id;
  if g.po_id is not null then
    select count(*) filter (where received_base_qty + 0.001 < qty * case unit when 'carton' then coalesce(units_per_carton, 1) when 'kg' then 1000 else 1 end) into v_po_total from public.purchase_order_lines where po_id = g.po_id;
    update public.purchase_orders set status = case when v_po_total = 0 then 'received' else 'partially_received' end, updated_at = now() where id = g.po_id and status <> 'cancelled';
  end if;
  perform public.audit('purchase.grn_posted', 'goods_receipts', g.id::text, null, jsonb_build_object('grn', g.grn_number, 'lines', n, 'total', g.total));
  return jsonb_build_object('ok', true, 'already', false, 'lines', n, 'total', g.total);
end $$;
revoke all on function public.post_goods_receipt(uuid) from public, anon;
grant execute on function public.post_goods_receipt(uuid) to authenticated;

-- Supplier money is tracked apart from goods: a receipt can be posted and still unpaid.
create or replace function public.record_supplier_payment(p_grn_id uuid, p_amount numeric, p_reference text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.goods_receipts; v_paid numeric;
begin
  if not public.can_see_costs() then raise exception 'FORBIDDEN'; end if;
  select * into g from public.goods_receipts where id = p_grn_id for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if g.paid_amount + p_amount > g.total + 0.005 then raise exception 'AMOUNT_ABOVE_DUE: %', g.total - g.paid_amount; end if;
  insert into public.supplier_payments (grn_id, amount, reference, note, paid_by, paid_by_name)
  values (g.id, round(p_amount, 2), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid(), public._actor_name());
  v_paid := g.paid_amount + round(p_amount, 2);
  update public.goods_receipts set paid_amount = v_paid, payment_status = case when v_paid + 0.005 >= total then 'paid' else 'partial' end, updated_at = now() where id = g.id;
  perform public.audit('purchase.payment', 'goods_receipts', g.id::text, jsonb_build_object('paid', g.paid_amount), jsonb_build_object('paid', v_paid, 'amount', p_amount, 'reference', p_reference));
  return jsonb_build_object('ok', true, 'paid_amount', v_paid, 'due', greatest(g.total - v_paid, 0));
end $$;
revoke all on function public.record_supplier_payment(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_supplier_payment(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Selling prices: history, guard, scheduled and bulk changes
-- ---------------------------------------------------------------------------
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  inventory_id uuid references public.inventory(id) on delete set null,
  old_price numeric(10,2), old_mrp numeric(10,2),
  new_price numeric(10,2) not null, new_mrp numeric(10,2),
  cost_at_change numeric(12,4),
  below_cost boolean not null default false,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists price_history_product_idx on public.price_history (product_id, created_at desc);
alter table public.price_history enable row level security;
drop policy if exists price_history_admin_read on public.price_history;
create policy price_history_admin_read on public.price_history for select using (public.is_admin());

-- Any path that changes a price leaves history (the reason is taken from a transaction setting when admin_set_price set one).
create or replace function public.inventory_price_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  if new.selling_price is distinct from old.selling_price or new.mrp is distinct from old.mrp then
    v_cost := public.product_cost(new.product_id);
    insert into public.price_history (product_id, inventory_id, old_price, old_mrp, new_price, new_mrp, cost_at_change, below_cost, reason, changed_by, changed_by_name)
    values (new.product_id, new.id, old.selling_price, old.mrp, new.selling_price, new.mrp, v_cost, v_cost is not null and new.selling_price < v_cost,
            nullif(current_setting('md.price_reason', true), ''), auth.uid(), public._actor_name());
  end if;
  return new;
end $$;
drop trigger if exists inventory_price_history_trg on public.inventory;
create trigger inventory_price_history_trg after update on public.inventory for each row execute function public.inventory_price_history();

-- One guarded path for a single price change. Below cost needs an explicit confirmation, which is audited.
create or replace function public.admin_set_price(p_product_id uuid, p_price numeric, p_mrp numeric default null, p_reason text default null, p_confirm_below_cost boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.inventory; v_cost numeric; v_mrp numeric;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_price is null or p_price <= 0 then raise exception 'INVALID_PRICE: Enter a selling price above ₹0.'; end if;
  select * into i from public.inventory where product_id = p_product_id for update;
  if i.id is null then raise exception 'NOT_LISTED'; end if;
  v_mrp := coalesce(p_mrp, i.mrp);
  if v_mrp is not null and v_mrp < p_price then raise exception 'PRICE_ABOVE_MRP'; end if;
  v_cost := public.product_cost(p_product_id);
  if v_cost is not null and p_price < v_cost and not coalesce(p_confirm_below_cost, false) then
    raise exception 'BELOW_COST: %', to_char(v_cost, 'FM9999990.00');
  end if;
  perform set_config('md.price_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), case when v_cost is not null and p_price < v_cost then 'Below cost, confirmed by admin' end, ''), true);
  update public.inventory set selling_price = round(p_price, 2), mrp = round(v_mrp, 2) where id = i.id;
  if v_cost is not null and p_price < v_cost then
    perform public.audit('price.below_cost_confirmed', 'inventory', i.id::text, jsonb_build_object('price', i.selling_price), jsonb_build_object('price', p_price, 'cost', v_cost, 'reason', p_reason));
  end if;
  return jsonb_build_object('ok', true, 'price', round(p_price, 2), 'mrp', round(v_mrp, 2), 'cost', v_cost, 'below_cost', v_cost is not null and p_price < v_cost);
end $$;
revoke all on function public.admin_set_price(uuid, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.admin_set_price(uuid, numeric, numeric, text, boolean) to authenticated;

create table if not exists public.scheduled_price_changes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  new_price numeric(10,2) not null check (new_price > 0),
  new_mrp numeric(10,2),
  effective_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'applied', 'cancelled', 'failed')),
  reason text, error text,
  batch_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_price_changes_due_idx on public.scheduled_price_changes (effective_at) where status = 'scheduled';
alter table public.scheduled_price_changes enable row level security;
drop policy if exists scheduled_price_changes_admin on public.scheduled_price_changes;
create policy scheduled_price_changes_admin on public.scheduled_price_changes for all using (public.is_admin()) with check (public.is_admin());

-- Applies what is due. A change that would go below the current cost is not applied blind: it fails with the reason, for an admin to confirm by hand.
create or replace function public.apply_due_price_changes()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  for r in select * from public.scheduled_price_changes where status = 'scheduled' and effective_at <= now() order by effective_at for update skip locked loop
    begin
      perform set_config('md.price_reason', coalesce(r.reason, 'Scheduled change'), true);
      update public.inventory set selling_price = r.new_price, mrp = coalesce(r.new_mrp, greatest(mrp, r.new_price)) where product_id = r.product_id;
      update public.scheduled_price_changes set status = 'applied', applied_at = now() where id = r.id;
      n := n + 1;
    exception when others then
      update public.scheduled_price_changes set status = 'failed', error = sqlerrm where id = r.id;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.apply_due_price_changes() from public, anon;
grant execute on function public.apply_due_price_changes() to authenticated, service_role;

-- Bulk: the same filter and rule produce a preview (nothing changes) and an apply (now, or scheduled).
-- p_mode: 'percent' (+/- % of current price), 'amount' (+/- ₹), 'set' (new price), 'margin' (cost × (1 + value %)), 'mrp_discount' (MRP − value %).
create or replace function public._price_rule(p_price numeric, p_mrp numeric, p_cost numeric, p_mode text, p_value numeric)
returns numeric language sql immutable as $$
  select case p_mode
    when 'percent' then round(p_price * (1 + p_value / 100.0), 2)
    when 'amount' then round(p_price + p_value, 2)
    when 'set' then round(p_value, 2)
    when 'margin' then case when p_cost is null then null else round(p_cost * (1 + p_value / 100.0), 2) end
    when 'mrp_discount' then case when p_mrp is null then null else round(p_mrp * (1 - p_value / 100.0), 2) end
    else null end;
$$;

create or replace function public.admin_price_preview(p_filter jsonb, p_mode text, p_value numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('percent', 'amount', 'set', 'margin', 'mrp_discount') then raise exception 'INVALID_MODE'; end if;
  if p_mode = 'margin' and not public.can_see_costs() then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('product_id', p.id, 'inventory_id', i.id, 'name', p.name, 'pack_label', p.pack_label, 'sku', p.sku,
      'price', i.selling_price, 'mrp', i.mrp, 'cost', case when public.can_see_costs() then public.product_cost(p.id) end,
      'new_price', public._price_rule(i.selling_price, i.mrp, public.product_cost(p.id), p_mode, p_value),
      'new_mrp', case when p_mode = 'set' and (p_filter ->> 'mrp') is not null then (p_filter ->> 'mrp')::numeric else greatest(i.mrp, public._price_rule(i.selling_price, i.mrp, public.product_cost(p.id), p_mode, p_value)) end,
      'below_cost', public.product_cost(p.id) is not null and public._price_rule(i.selling_price, i.mrp, public.product_cost(p.id), p_mode, p_value) < public.product_cost(p.id),
      'invalid', public._price_rule(i.selling_price, i.mrp, public.product_cost(p.id), p_mode, p_value) is null or public._price_rule(i.selling_price, i.mrp, public.product_cost(p.id), p_mode, p_value) <= 0
    ) x
    from public.products p join public.inventory i on i.product_id = p.id
    where (p_filter ->> 'category_id' is null or p.category_id = (p_filter ->> 'category_id')::uuid
           or p.category_id in (select id from public.categories where parent_id = (p_filter ->> 'category_id')::uuid))
      and (p_filter ->> 'brand_id' is null or p.brand_id = (p_filter ->> 'brand_id')::uuid)
      and (p_filter ->> 'q' is null or p.name ilike '%' || (p_filter ->> 'q') || '%')
      and (p_filter -> 'ids' is null or p.id in (select (jsonb_array_elements_text(p_filter -> 'ids'))::uuid))
    limit 500) t;
  return v_rows;
end $$;
revoke all on function public.admin_price_preview(jsonb, text, numeric) from public, anon;
grant execute on function public.admin_price_preview(jsonb, text, numeric) to authenticated;

create or replace function public.admin_price_apply(p_filter jsonb, p_mode text, p_value numeric, p_reason text default null, p_effective_at timestamptz default null, p_confirm_below_cost boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb; r jsonb; n int := 0; v_batch uuid := gen_random_uuid(); v_below int := 0; v_skipped int := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  v_rows := public.admin_price_preview(p_filter, p_mode, p_value);
  select count(*) into v_below from jsonb_array_elements(v_rows) e where (e ->> 'below_cost')::boolean;
  if v_below > 0 and not coalesce(p_confirm_below_cost, false) then raise exception 'BELOW_COST: % products would be priced below cost. Confirm to proceed.', v_below; end if;
  for r in select * from jsonb_array_elements(v_rows) loop
    if (r ->> 'invalid')::boolean then v_skipped := v_skipped + 1; continue; end if;
    if p_effective_at is not null and p_effective_at > now() then
      insert into public.scheduled_price_changes (product_id, new_price, new_mrp, effective_at, reason, batch_id, created_by, created_by_name)
      values ((r ->> 'product_id')::uuid, (r ->> 'new_price')::numeric, (r ->> 'new_mrp')::numeric, p_effective_at, p_reason, v_batch, auth.uid(), public._actor_name());
    else
      perform set_config('md.price_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Bulk update'), true);
      update public.inventory set selling_price = (r ->> 'new_price')::numeric, mrp = (r ->> 'new_mrp')::numeric where id = (r ->> 'inventory_id')::uuid;
    end if;
    n := n + 1;
  end loop;
  perform public.audit('price.bulk', 'inventory', v_batch::text, null, jsonb_build_object('mode', p_mode, 'value', p_value, 'filter', p_filter, 'count', n, 'skipped', v_skipped, 'below_cost', v_below, 'effective_at', p_effective_at, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'count', n, 'skipped', v_skipped, 'below_cost', v_below, 'scheduled', p_effective_at is not null and p_effective_at > now(), 'batch_id', v_batch);
end $$;
revoke all on function public.admin_price_apply(jsonb, text, numeric, text, timestamptz, boolean) from public, anon;
grant execute on function public.admin_price_apply(jsonb, text, numeric, text, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rider rate cards, quotes, earnings kinds, adjustments
-- ---------------------------------------------------------------------------
create table if not exists public.rider_rate_cards (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  name text not null,
  rules jsonb not null,
  is_active boolean not null default false,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create unique index if not exists rider_rate_cards_active_idx on public.rider_rate_cards (is_active) where is_active;
alter table public.rider_rate_cards enable row level security;
drop policy if exists rider_rate_cards_admin on public.rider_rate_cards;
create policy rider_rate_cards_admin on public.rider_rate_cards for select using (public.is_admin());

-- First card = the settings the app already used (base + per km from 0 km), so pay does not change by itself.
insert into public.rider_rate_cards (version, name, rules, is_active, note)
select 1, 'Base + per km (from settings)', jsonb_build_object(
  'distance_basis', 'straight_line', 'base', public.get_setting_num('rider_base_earning', 20), 'included_km', 0, 'per_km', public.get_setting_num('rider_per_km_earning', 5),
  'zone_rates', '[]'::jsonb, 'weight_supplement', jsonb_build_object('min_kg', 0, 'amount', 0), 'peak', '[]'::jsonb,
  'failed_attempt', 0, 'cancelled_after_pickup', 0, 'return_trip', 0, 'incentives', '[]'::jsonb), true, 'Created automatically from the earlier settings.'
where not exists (select 1 from public.rider_rate_cards);

alter table public.delivery_assignments add column if not exists rate_card_id uuid references public.rider_rate_cards(id) on delete set null;
alter table public.delivery_assignments add column if not exists quoted_breakdown jsonb;
alter table public.delivery_assignments add column if not exists quoted_at timestamptz;

alter table public.rider_earnings alter column assignment_id drop not null;
alter table public.rider_earnings alter column order_id drop not null;
alter table public.rider_earnings drop constraint if exists rider_earnings_assignment_id_key;
alter table public.rider_earnings add column if not exists kind text not null default 'delivery';
alter table public.rider_earnings drop constraint if exists rider_earnings_kind_check;
alter table public.rider_earnings add constraint rider_earnings_kind_check check (kind in ('delivery', 'failed_attempt', 'cancelled_after_pickup', 'return_trip', 'incentive', 'adjustment'));
alter table public.rider_earnings add column if not exists breakdown jsonb;
alter table public.rider_earnings add column if not exists rate_card_id uuid references public.rider_rate_cards(id) on delete set null;
alter table public.rider_earnings add column if not exists note text;
alter table public.rider_earnings add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.rider_earnings add column if not exists created_by_name text;
alter table public.rider_earnings drop constraint if exists rider_earnings_confirmed_via_check;
alter table public.rider_earnings add constraint rider_earnings_confirmed_via_check check (confirmed_via in ('otp', 'support', 'system', 'admin'));
alter table public.rider_earnings drop constraint if exists rider_earnings_amount_check;   -- adjustments may be negative
drop index if exists rider_earnings_assignment_kind_key;
create unique index if not exists rider_earnings_assignment_kind_key on public.rider_earnings (assignment_id, kind) where assignment_id is not null;

-- The pure calculator (what the admin screen previews and what quotes use).
create or replace function public.rider_pay_calc(p_rules jsonb, p_distance_km numeric, p_weight_kg numeric default 0, p_zone_id uuid default null, p_at timestamptz default now())
returns jsonb language plpgsql stable as $$
declare v_base numeric := coalesce((p_rules ->> 'base')::numeric, 0); v_inc numeric := coalesce((p_rules ->> 'included_km')::numeric, 0); v_per numeric := coalesce((p_rules ->> 'per_km')::numeric, 0);
  v_lines jsonb := '[]'::jsonb; v_total numeric := 0; v_dist numeric; v_zone jsonb; v_w jsonb := p_rules -> 'weight_supplement'; v_peak jsonb; v_time time; v_extra numeric;
begin
  -- Zone rate replaces the base (never added on top).
  if p_zone_id is not null then
    select z into v_zone from jsonb_array_elements(coalesce(p_rules -> 'zone_rates', '[]'::jsonb)) z where (z ->> 'zone_id')::uuid = p_zone_id limit 1;
    if v_zone is not null then v_base := coalesce((v_zone ->> 'base')::numeric, v_base); end if;
  end if;
  v_lines := v_lines || jsonb_build_object('label', case when v_zone is not null then 'Zone rate' else 'Base per delivery' end, 'amount', v_base); v_total := v_base;
  -- Distance beyond the included km, whole km up.
  if p_distance_km is not null and v_per > 0 then
    v_dist := greatest(0, ceil(p_distance_km - v_inc));
    if v_dist > 0 then v_lines := v_lines || jsonb_build_object('label', format('%s km beyond %s km × ₹%s', v_dist, v_inc, v_per), 'amount', v_dist * v_per); v_total := v_total + v_dist * v_per; end if;
  elsif p_distance_km is null and v_per > 0 then
    v_lines := v_lines || jsonb_build_object('label', 'Distance unknown (no map pin): no distance pay', 'amount', 0);
  end if;
  -- Weight supplement once, when the order is at or over the threshold.
  if v_w is not null and coalesce((v_w ->> 'amount')::numeric, 0) > 0 and coalesce(p_weight_kg, 0) >= coalesce((v_w ->> 'min_kg')::numeric, 0) and coalesce((v_w ->> 'min_kg')::numeric, 0) > 0 then
    v_lines := v_lines || jsonb_build_object('label', format('Heavy order (%s kg+)', v_w ->> 'min_kg'), 'amount', (v_w ->> 'amount')::numeric); v_total := v_total + (v_w ->> 'amount')::numeric;
  end if;
  -- Peak hour: the first matching window only.
  v_time := (p_at at time zone 'Asia/Kolkata')::time;
  for v_peak in select * from jsonb_array_elements(coalesce(p_rules -> 'peak', '[]'::jsonb)) loop
    if v_time >= (v_peak ->> 'start')::time and v_time < (v_peak ->> 'end')::time and coalesce((v_peak ->> 'amount')::numeric, 0) > 0 then
      v_extra := (v_peak ->> 'amount')::numeric;
      v_lines := v_lines || jsonb_build_object('label', format('Peak hours %s–%s', v_peak ->> 'start', v_peak ->> 'end'), 'amount', v_extra); v_total := v_total + v_extra;
      exit;
    end if;
  end loop;
  return jsonb_build_object('amount', round(v_total, 2), 'lines', v_lines, 'distance_km', p_distance_km, 'basis', coalesce(p_rules ->> 'distance_basis', 'straight_line'));
end $$;
grant execute on function public.rider_pay_calc(jsonb, numeric, numeric, uuid, timestamptz) to authenticated;

-- Quote for a real order from the active card (or a draft card for previews).
create or replace function public.rider_pay_quote(p_order_id uuid, p_rules jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; c public.rider_rate_cards; v_rules jsonb; v_dist numeric; v_weight numeric; v_q jsonb;
begin
  -- Admins, and the rider this order is offered to or assigned to.
  if not (public.is_admin() or exists (select 1 from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
                                        where a.order_id = p_order_id and dp.user_id = auth.uid() and a.status in ('offered', 'accepted', 'picked_up'))) then
    raise exception 'FORBIDDEN';
  end if;
  select * into o from public.orders where id = p_order_id;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into c from public.rider_rate_cards where is_active limit 1;
  v_rules := coalesce(p_rules, c.rules);
  v_dist := public.haversine_km((public.pickup_point() ->> 'lat')::double precision, (public.pickup_point() ->> 'lng')::double precision, o.delivery_lat, o.delivery_lng);
  select coalesce(sum(public.pack_grams(p.weight_value, p.weight_unit) * oi.quantity), 0) / 1000.0 into v_weight
  from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = o.id and p.weight_unit in ('g', 'kg');
  v_q := public.rider_pay_calc(v_rules, v_dist, v_weight, o.zone_id, now());
  return v_q || jsonb_build_object('rate_card_id', case when p_rules is null then c.id end, 'rate_card_version', case when p_rules is null then c.version end, 'weight_kg', round(v_weight, 2));
end $$;
revoke all on function public.rider_pay_quote(uuid, jsonb) from public, anon;
grant execute on function public.rider_pay_quote(uuid, jsonb) to authenticated;

-- Save a new card version. Only one is active; earlier quotes keep pointing at their own version.
create or replace function public.admin_save_rate_card(p_name text, p_rules jsonb, p_note text default null, p_activate boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ver int;
begin
  if not public.is_super_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if coalesce((p_rules ->> 'base')::numeric, -1) < 0 or coalesce((p_rules ->> 'per_km')::numeric, 0) < 0 or coalesce((p_rules ->> 'included_km')::numeric, 0) < 0 then raise exception 'INVALID_RULES: amounts cannot be negative'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.rider_rate_cards;
  if p_activate then update public.rider_rate_cards set is_active = false where is_active; end if;
  insert into public.rider_rate_cards (version, name, rules, is_active, note, created_by, created_by_name)
  values (v_ver, coalesce(nullif(trim(p_name), ''), 'Rate card v' || v_ver), p_rules || jsonb_build_object('distance_basis', 'straight_line'), p_activate, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), public._actor_name())
  returning id into v_id;
  perform public.audit('rider_rates.save', 'rider_rate_cards', v_id::text, (select rules from public.rider_rate_cards where is_active = false order by version desc limit 1), p_rules || jsonb_build_object('version', v_ver, 'active', p_activate));
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
end $$;
revoke all on function public.admin_save_rate_card(text, jsonb, text, boolean) from public, anon;
grant execute on function public.admin_save_rate_card(text, jsonb, text, boolean) to authenticated;

-- Accept: the quote is frozen on the assignment (0035 body + quote).
create or replace function public.rider_respond_assignment(p_assignment_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; v_next uuid; v_q jsonb;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or dp.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status <> 'offered' then raise exception 'INVALID_STATE: %', a.status; end if;
  if a.expires_at < now() then
    update public.delivery_assignments set status = 'expired', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(a.order_id);
    return jsonb_build_object('ok', false, 'status', 'expired', 'error', 'OFFER_EXPIRED', 'reassigned_to', v_next);
  end if;
  select * into o from public.orders where id = a.order_id for update;
  if p_accept then
    if exists (select 1 from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up')) then raise exception 'ALREADY_ON_DELIVERY'; end if;
    v_q := public.rider_pay_quote(o.id);
    update public.delivery_assignments set status = 'accepted', responded_at = now(),
      earning = (v_q ->> 'amount')::numeric, quoted_breakdown = v_q, quoted_at = now(), rate_card_id = (v_q ->> 'rate_card_id')::uuid where id = a.id;
    perform public._set_order_status(o.id, 'rider_assigned', null);
    perform public.notify_admins('rider_assigned', 'Rider assigned for ' || o.order_number, 'A delivery partner is on the way to pick it up.', jsonb_build_object('order_id', o.id));
    return jsonb_build_object('ok', true, 'status', 'accepted', 'earning', (v_q ->> 'amount')::numeric);
  else
    update public.delivery_assignments set status = 'rejected', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(o.id);
    return jsonb_build_object('ok', true, 'status', 'rejected', 'reassigned_to', v_next);
  end if;
end $$;

-- Delivery earning written once, from the frozen quote (0034 body + breakdown/card).
create or replace function public._complete_delivery(p_assignment_id uuid, p_via text)
returns int language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; o public.orders; v_points int := 0; v_new uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select * into o from public.orders where id = a.order_id;
  update public.delivery_assignments set status = 'delivered', delivered_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'delivered', case when p_via = 'support' then 'Confirmed by support without OTP' end);

  if o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected', collected_by = (select user_id from public.delivery_partners where id = a.rider_id), collected_at = now() where order_id = o.id;
    update public.orders set payment_status = 'cod_collected' where id = o.id;
    insert into public.cod_collections (order_id, assignment_id, rider_id, amount, confirmed_via, collected_by)
    values (o.id, a.id, a.rider_id, o.total, p_via, (select user_id from public.delivery_partners where id = a.rider_id))
    on conflict (order_id) do nothing;
  end if;

  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via, kind, breakdown, rate_card_id)
  values (a.rider_id, a.id, o.id, a.earning, p_via, 'delivery', a.quoted_breakdown, a.rate_card_id)
  on conflict (assignment_id, kind) where assignment_id is not null do nothing
  returning id into v_new;
  if v_new is not null then
    update public.delivery_partners set total_deliveries = total_deliveries + 1, total_earnings = total_earnings + a.earning where id = a.rider_id;
    v_points := floor(o.subtotal / 100) * public.get_setting_num('reward_points_per_100', 1)::int;
    if v_points > 0 then
      update public.profiles set reward_points = reward_points + v_points where id = o.user_id;
      insert into public.reward_transactions (user_id, points, reason, order_id) values (o.user_id, v_points, 'Order ' || o.order_number, o.id);
    end if;
    perform public.notify_admins('order_delivered', 'Order ' || o.order_number || ' delivered', 'Delivered successfully by the rider.', jsonb_build_object('order_id', o.id));
  end if;
  return v_points;
end $$;

-- Compensation for a failed attempt / a cancellation after pickup: from the card the delivery was quoted on.
create or replace function public._rider_compensation(p_assignment_id uuid, p_kind text)
returns numeric language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; v_rules jsonb; v_amt numeric; v_new uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select rules into v_rules from public.rider_rate_cards where id = a.rate_card_id;
  if v_rules is null then select rules into v_rules from public.rider_rate_cards where is_active limit 1; end if;
  v_amt := coalesce((v_rules ->> p_kind)::numeric, 0);
  if v_amt <= 0 then return 0; end if;
  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via, kind, breakdown, rate_card_id)
  values (a.rider_id, a.id, a.order_id, v_amt, 'system', p_kind, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('label', case p_kind when 'failed_attempt' then 'Failed delivery attempt' when 'cancelled_after_pickup' then 'Cancelled after pickup' when 'return_trip' then 'Return trip' else p_kind end, 'amount', v_amt))), a.rate_card_id)
  on conflict (assignment_id, kind) where assignment_id is not null do nothing
  returning id into v_new;
  return case when v_new is null then 0 else v_amt end;
end $$;
revoke all on function public._rider_compensation(uuid, text) from public, anon, authenticated;

create or replace function public.rider_report_failed_delivery(p_assignment_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments; o public.orders; v_label text; v_note text := nullif(trim(coalesce(p_note, '')), ''); v_comp numeric;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('accepted', 'picked_up') then raise exception 'INVALID_STATE: %', a.status; end if;
  v_label := case p_reason
    when 'customer_unreachable' then 'Customer not reachable'
    when 'address_problem' then 'Address wrong or not found'
    when 'customer_refused' then 'Customer refused the order'
    when 'other' then 'Other'
    else null end;
  if v_label is null then raise exception 'INVALID_REASON'; end if;
  if p_reason = 'other' and (v_note is null or length(v_note) < 5) then raise exception 'REASON_REQUIRED'; end if;
  if v_note is not null and length(v_note) > 300 then v_note := left(v_note, 300); end if;

  select * into o from public.orders where id = a.order_id for update;
  update public.delivery_assignments set status = 'cancelled', failure_reason = v_label || coalesce(': ' || v_note, ''), failed_at = now() where id = a.id;
  if o.status in ('rider_assigned', 'out_for_delivery') then
    perform public._set_order_status(o.id, 'ready_for_pickup', 'Delivery attempt failed — ' || v_label || coalesce(': ' || v_note, '') || '. Returned to the pickup point.');
  end if;
  perform public._set_exception(o.id, 'delivery_failed');
  v_comp := case when a.status = 'picked_up' then public._rider_compensation(a.id, 'failed_attempt') else 0 end;
  perform public.notify_user(o.user_id, 'delivery_failed', 'We couldn''t deliver order ' || o.order_number,
    format('Our delivery partner couldn''t complete the handover (%s). We''ll contact you to arrange delivery again.', lower(v_label)), jsonb_build_object('order_id', o.id));
  perform public.notify_admins('delivery_failed', 'Delivery failed: ' || o.order_number,
    format('%s%s. The rider is bringing it back: re-dispatch a rider or cancel the order.', v_label, coalesce(' — ' || v_note, '')), jsonb_build_object('order_id', o.id));
  perform public.audit('delivery.failed', 'orders', o.id::text, null, jsonb_build_object('assignment_id', a.id, 'rider_id', dp.id, 'reason', p_reason, 'note', v_note, 'compensation', v_comp));
  return jsonb_build_object('ok', true, 'order_status', (select status from public.orders where id = o.id), 'compensation', v_comp);
end $$;

-- Cancellation after pickup compensates the rider (0036 body + compensation).
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_is_admin boolean := public.is_admin(); r record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (v_is_admin or o.user_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if o.status in ('delivered','completed','cancelled','rejected') then raise exception 'CANNOT_CANCEL: %', o.status; end if;
  if not v_is_admin and o.status not in ('placed','confirmed')
     and not exists (select 1 from public.order_exceptions x where x.order_id = o.id and x.status = 'declined' and x.resolved_at > now() - interval '5 minutes') then
    raise exception 'CANNOT_CANCEL: order is already being packed. Please contact support.';
  end if;

  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'cancel_restock', o.id, auth.uid());
  end loop;
  for r in select a.id, a.status as a_status, dp.user_id from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
           where a.order_id = o.id and a.status in ('accepted','picked_up') loop
    perform public.notify_user(r.user_id, 'delivery_cancelled', 'Delivery cancelled: ' || o.order_number,
      case when r.a_status = 'picked_up' then 'The order was cancelled. Please bring it back to the pickup point.' else 'The order was cancelled before pickup. No need to collect it.' end,
      jsonb_build_object('order_id', o.id, 'assignment_id', r.id));
    if r.a_status = 'picked_up' then perform public._rider_compensation(r.id, 'cancelled_after_pickup'); end if;
  end loop;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status in ('offered','accepted','picked_up');
  update public.order_exceptions set status = 'withdrawn', resolved_at = now() where order_id = o.id and status = 'pending';
  update public.orders set cancelled_by = auth.uid(), cancel_reason = p_reason, exception = null, exception_at = null where id = o.id;
  perform public._handle_refund_on_cancel(o.id);
  perform public._set_order_status(o.id, 'cancelled', p_reason);
  if not v_is_admin then
    perform public.notify_admins('order_cancelled', 'Order ' || o.order_number || ' cancelled', coalesce(p_reason, 'Cancelled by customer.'), jsonb_build_object('order_id', o.id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Manual adjustment: its own row, with a reason, never touching the delivery row.
create or replace function public.admin_rider_adjustment(p_rider_id uuid, p_amount numeric, p_reason text, p_assignment_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_order uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000 then raise exception 'INVALID_AMOUNT'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if p_assignment_id is not null then select order_id into v_order from public.delivery_assignments where id = p_assignment_id and rider_id = p_rider_id; end if;
  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via, kind, note, created_by, created_by_name, breakdown)
  values (p_rider_id, null, v_order, round(p_amount, 2), 'admin', 'adjustment', trim(p_reason), auth.uid(), public._actor_name(), jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('label', trim(p_reason), 'amount', round(p_amount, 2)))))
  returning id into v_id;
  perform public.audit('rider_earning.adjustment', 'rider_earnings', v_id::text, null, jsonb_build_object('rider_id', p_rider_id, 'amount', p_amount, 'reason', p_reason, 'assignment_id', p_assignment_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.admin_rider_adjustment(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.admin_rider_adjustment(uuid, numeric, text, uuid) to authenticated;

-- Payout with an optional, explicit COD offset: both amounts are recorded and the cash side gets its own remittance row.
alter table public.rider_payouts add column if not exists cod_offset numeric(12,2) not null default 0;
alter table public.rider_payouts add column if not exists gross_amount numeric(12,2);
alter table public.rider_payouts drop constraint if exists rider_payouts_amount_check;
alter table public.rider_payouts add constraint rider_payouts_amount_check check (amount >= 0);

drop function if exists public.admin_create_rider_payout(uuid, text);
create or replace function public.admin_create_rider_payout(p_rider_id uuid, p_note text default null, p_cod_offset numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_count int; v_id uuid; v_due numeric; v_offset numeric := round(coalesce(p_cod_offset, 0), 2); v_user uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select user_id into v_user from public.delivery_partners where id = p_rider_id for update;
  if v_user is null then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(amount), 0), count(*) into v_amount, v_count
  from public.rider_earnings where rider_id = p_rider_id and status in ('pending','failed') and payout_id is null;
  if v_count = 0 or v_amount <= 0 then raise exception 'NOTHING_TO_PAY: This rider has no payable earnings.'; end if;
  if v_offset < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_offset > 0 then
    v_due := (public._rider_cash(p_rider_id) ->> 'due')::numeric;
    if v_offset > v_due then raise exception 'AMOUNT_ABOVE_DUE: %', v_due; end if;
    if v_offset > v_amount then raise exception 'OFFSET_ABOVE_EARNINGS: at most % can be offset', v_amount; end if;
  end if;
  insert into public.rider_payouts (rider_id, amount, gross_amount, cod_offset, earning_count, note, created_by)
  values (p_rider_id, v_amount - v_offset, v_amount, v_offset, v_count, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into v_id;
  update public.rider_earnings set status = 'processing', payout_id = v_id, updated_at = now()
  where rider_id = p_rider_id and status in ('pending','failed') and payout_id is null;
  if v_offset > 0 then
    insert into public.rider_cash_remittances (rider_id, amount, reference, note, received_by)
    values (p_rider_id, v_offset, 'Offset in payout ' || v_id::text, format('₹%s of COD cash due was set off against earnings of ₹%s', to_char(v_offset, 'FM999999990.00'), to_char(v_amount, 'FM999999990.00')), auth.uid());
    perform public.notify_user(v_user, 'cash_received', 'Cash set off against your earnings', format('₹%s of cash you held was settled against earnings of ₹%s. ₹%s is being paid to you.', to_char(v_offset, 'FM999999990.00'), to_char(v_amount, 'FM999999990.00'), to_char(v_amount - v_offset, 'FM999999990.00')), jsonb_build_object('payout_id', v_id));
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, after_data)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'rider_payout.create', 'rider_payout', v_id::text, jsonb_build_object('rider_id', p_rider_id, 'gross', v_amount, 'cod_offset', v_offset, 'amount', v_amount - v_offset, 'earnings', v_count));
  return jsonb_build_object('ok', true, 'payout_id', v_id, 'amount', v_amount - v_offset, 'gross', v_amount, 'cod_offset', v_offset, 'earnings', v_count);
end $$;

-- Rider's own view: every earning line with its breakdown, and settlements.
create or replace function public.rider_earnings_history(p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare dp public.delivery_partners;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  return jsonb_build_object(
    'earnings', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', e.amount, 'status', e.status, 'order_number', o.order_number, 'breakdown', e.breakdown, 'note', e.note, 'created_at', e.created_at) order by e.created_at desc), '[]'::jsonb)
                  from (select * from public.rider_earnings where rider_id = dp.id order by created_at desc limit greatest(1, least(p_limit, 200))) e left join public.orders o on o.id = e.order_id),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'gross_amount', p.gross_amount, 'cod_offset', p.cod_offset, 'status', p.status, 'reference_no', p.reference_no, 'created_at', p.created_at, 'settled_at', p.settled_at) order by p.created_at desc), '[]'::jsonb)
                 from (select * from public.rider_payouts where rider_id = dp.id order by created_at desc limit 30) p),
    'totals', jsonb_build_object(
      'payable', (select coalesce(sum(amount), 0) from public.rider_earnings where rider_id = dp.id and status in ('pending', 'failed')),
      'processing', (select coalesce(sum(amount), 0) from public.rider_earnings where rider_id = dp.id and status = 'processing'),
      'paid', (select coalesce(sum(amount), 0) from public.rider_earnings where rider_id = dp.id and status = 'paid'),
      'cash_due', (public._rider_cash(dp.id) ->> 'due')::numeric));
end $$;
revoke all on function public.rider_earnings_history(int) from public, anon;
grant execute on function public.rider_earnings_history(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Profit report
-- ---------------------------------------------------------------------------
create or replace function public.admin_profit_report(p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz; v_to timestamptz; v_sales numeric; v_cogs numeric; v_cogs_missing int; v_pack numeric; v_rider numeric; v_fees numeric; v_refunds numeric; v_wastage numeric; v_delivered int;
begin
  if not public.can_see_costs() then raise exception 'FORBIDDEN'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'INVALID_RANGE'; end if;
  v_from := (p_start::timestamp at time zone 'Asia/Kolkata'); v_to := ((p_end + 1)::timestamp at time zone 'Asia/Kolkata');
  -- Delivered orders only; a cancelled order sells nothing and its stock went back.
  select count(*), coalesce(sum(subtotal - coalesce(coupon_discount, 0)), 0) into v_delivered, v_sales
  from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered', 'completed');
  select coalesce(sum(oi.quantity * oi.unit_cost), 0), count(*) filter (where oi.unit_cost is null) into v_cogs, v_cogs_missing
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.created_at >= v_from and o.created_at < v_to and o.status in ('delivered', 'completed');
  v_pack := v_delivered * public.get_setting_num('packaging_cost_per_order', 0);
  select coalesce(sum(e.amount), 0) into v_rider from public.rider_earnings e where e.created_at >= v_from and e.created_at < v_to;
  select coalesce(sum(o.total), 0) * public.get_setting_num('online_payment_fee_percent', 0) / 100.0 into v_fees
  from public.orders o where o.created_at >= v_from and o.created_at < v_to and o.status in ('delivered', 'completed') and o.payment_method <> 'cod';
  select coalesce(sum(coalesce(p.refund_amount, 0)), 0) into v_refunds from public.payments p join public.orders o on o.id = p.order_id where o.created_at >= v_from and o.created_at < v_to;
  select coalesce(sum(abs(m.delta) * coalesce(i.avg_cost, 0)), 0) into v_wastage
  from public.inventory_movements m join public.inventory i on i.id = m.inventory_id
  where m.reason = 'wastage' and m.created_at >= v_from and m.created_at < v_to;
  return jsonb_build_object(
    'range', jsonb_build_object('start', p_start, 'end', p_end), 'delivered_orders', v_delivered,
    'sales', round(v_sales, 2), 'cogs', round(v_cogs, 2), 'cogs_missing_lines', v_cogs_missing,
    'gross_profit', round(v_sales - v_cogs, 2), 'gross_margin_pct', case when v_sales > 0 then round((v_sales - v_cogs) / v_sales * 100, 1) end,
    'delivery_fees_charged', (select coalesce(sum(delivery_fee), 0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered', 'completed')),
    'platform_fees_charged', (select coalesce(sum(platform_fee), 0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered', 'completed')),
    'packaging', round(v_pack, 2), 'rider_costs', round(v_rider, 2), 'payment_fees', round(v_fees, 2), 'refunds', round(v_refunds, 2), 'wastage', round(v_wastage, 2),
    'contribution', round(v_sales - v_cogs + (select coalesce(sum(delivery_fee + platform_fee), 0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered', 'completed')) - v_pack - v_rider - v_fees - v_refunds - v_wastage, 2),
    'supplier_balance', (select coalesce(sum(total - paid_amount), 0) from public.goods_receipts where status = 'posted'),
    'rider_payable', (select coalesce(sum(amount), 0) from public.rider_earnings where status in ('pending', 'failed')),
    'rider_cash_due', (select coalesce(sum((public._rider_cash(dp.id) ->> 'due')::numeric), 0) from public.delivery_partners dp),
    'costing_method', 'moving_average', 'distance_basis', 'straight_line',
    'notes', jsonb_build_array('Contribution excludes rent, salaries, marketing and other fixed costs; it is not net profit.', 'COGS uses the cost snapshot on each order line; lines placed before costs were recorded count as zero cost.', 'Payment fees are an estimate from the configured percentage, not gateway statements.'));
end $$;
revoke all on function public.admin_profit_report(date, date) from public, anon;
grant execute on function public.admin_profit_report(date, date) to authenticated;

-- The alert sweep also applies due price changes, so schedules work without the cron.
create or replace function public.admin_order_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.dispatch_pending();
  perform public.expire_item_exceptions();
  perform public.apply_due_price_changes();
  return jsonb_build_object(
    'now', now(),
    'ring_seconds', public.get_setting_num('order_alert_ring_seconds', 120),
    'reminder_seconds', public.get_setting_num('order_alert_reminder_seconds', 300),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'item_count', o.item_count, 'total', o.total,
        'payment_method', o.payment_method, 'payment_status', o.payment_status, 'delivery_type', o.delivery_type,
        'area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city',
        'created_at', o.created_at, 'promised_at', o.promised_at
      ) order by o.created_at), '[]'::jsonb)
      from public.orders o
      where o.status in ('placed', 'confirmed', 'preparing')
        and o.accepted_at is null
        and o.created_at > now() - make_interval(mins => v_recover)
        and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized'))));
end $$;
