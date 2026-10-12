-- ============================================================================
-- MERTA DEAL — Dry fruits at launch.
-- "Dry Fruits" was a Snacks subcategory (out of launch scope). It moves under
-- Grocery, like Masala, so it shows without a fourth home card. Five staples are
-- added and stocked at three stores so they are sellable, not just listed.
-- MRPs are launch placeholders — correct them in Admin → Products.
-- ============================================================================

update public.categories
set parent_id = (select id from public.categories where slug = 'grocery'),
    is_active = true, sort_order = 9, icon = 'nut', color = '#F3EDE0',
    description = 'Badam, kaju, kishmish, khajoor and more'
where slug = 'dry-fruits';

insert into public.products (name, slug, brand_id, category_id, weight_value, weight_unit, pack_label, mrp, synonyms, tags, is_local, is_veg, description, manufacturer, popularity_score)
select v.name, public.slugify(v.name || ' ' || v.pack), b.id, c.id, v.wv, v.wu, v.pack, v.mrp, v.syn, v.tags, v.local, true, v.descr, v.manu, v.pop
from (values
  ('Happilo Premium Pistachios (Roasted & Salted)', 'Happilo', 250, 'g', '250 g', 395, '{pista,pistachio,pistachios,dryfruit}'::text[], '{healthy,gift}'::text[], false, 'Roasted and lightly salted California pistachios.', 'Happilo', 34),
  ('Happilo Walnut Kernels (Akhrot)', 'Happilo', 250, 'g', '250 g', 345, '{akhrot,walnut,walnuts,dryfruit}'::text[], '{healthy}'::text[], false, 'Premium Chilean walnut halves.', 'Happilo', 30),
  ('Happilo Dried Figs (Anjeer)', 'Happilo', 250, 'g', '250 g', 325, '{anjeer,fig,figs,dryfruit}'::text[], '{healthy}'::text[], false, 'Soft, naturally sweet Afghan figs.', 'Happilo', 26),
  ('Dates (Khajoor)', 'Merta Local', 500, 'g', '500 g', 180, '{khajoor,khajur,dates,dryfruit}'::text[], '{healthy,fasting}'::text[], true, 'Soft seeded dates, sold loose at the counter.', 'Local, Merta', 44),
  ('Makhana (Fox Nuts)', 'Merta Local', 100, 'g', '100 g', 110, '{makhana,foxnut,lotus,seeds}'::text[], '{healthy,fasting,snack}'::text[], true, 'Light, crunchy fox nuts for roasting or kheer.', 'Local, Merta', 38)
) as v(name, brand, wv, wu, pack, mrp, syn, tags, local, descr, manu, pop)
join public.brands b on b.name = v.brand
join public.categories c on c.slug = 'dry-fruits'
on conflict (slug) do nothing;

-- Stock every dry-fruit product (old and new) at the three stores that carry such lines.
insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty)
select s.id, p.id, p.mrp, p.mrp, 20, 5, 5
from public.products p
join public.categories c on c.id = p.category_id and c.slug = 'dry-fruits'
cross join public.stores s
where s.slug in ('agarwal-super-bazaar', 'jain-kirana-store', 'mahalaxmi-departmental-store') and s.status = 'active'
on conflict (store_id, product_id) do nothing;

insert into public.search_synonyms (term, canonical) values
('khajoor','dates'),('khajur','dates'),('dates','dates'),
('anjeer','figs'),('figs','figs'),
('pista','pistachio'),('pistachio','pistachio'),
('akhrot','walnut'),('walnut','walnut'),
('makhana','makhana'),('foxnut','makhana'),
('dryfruit','dryfruit'),('dryfruits','dryfruit'),('mewa','dryfruit')
on conflict (term) do nothing;
