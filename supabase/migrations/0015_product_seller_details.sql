-- ============================================================================
-- MERTA DEAL — Seller of record + shelf life on the product page.
-- Stored per product (never assumed site-wide). Fresh produce is sourced through
-- Taza Groceries at Muhana Mandi; coriander carries a 3-day shelf life.
-- ============================================================================
alter table public.products
  add column if not exists shelf_life text,
  add column if not exists seller_name text,
  add column if not exists seller_address text,
  add column if not exists seller_license text;
comment on column public.products.seller_name is 'Seller of record shown on the product page; set per product, never assumed.';

update public.products p
set seller_name = 'Taza Groceries', seller_address = 'Muhana Mandi, Jaipur, Rajasthan — 302029', seller_license = '12822999000311'
from public.categories c left join public.categories parent on parent.id = c.parent_id
where p.category_id = c.id and (c.slug in ('fruits','vegetables') or parent.slug in ('fruits','vegetables'));

update public.products set shelf_life = '3 days' where slug = 'coriander-leaves-dhaniya-patta-100-g';
