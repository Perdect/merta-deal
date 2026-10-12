-- ============================================================================
-- MERTA DEAL — More fresh produce for the Fruits & Vegetables rails.
-- Photos: Wikimedia Commons cutouts (licence per file in public/products/manifest.json).
-- Prices are launch placeholders at Merta mandi levels — correct them in Admin → Products.
-- Seller of record for produce: Taza Groceries (as on existing fruit & vegetable rows).
-- ============================================================================
insert into public.products (name, slug, brand_id, category_id, weight_value, weight_unit, pack_label, mrp, synonyms, tags, is_local, is_veg, description, shelf_life, seller_name, seller_address, seller_license, image_url, popularity_score)
select v.name, v.slug, b.id, c.id, v.wv, v.wu, v.pack, v.mrp, v.syn, v.tags, v.local, true, v.descr, v.shelf, 'Taza Groceries', 'Muhana Mandi, Jaipur, Rajasthan — 302029', '12822999000311', v.img, v.pop
from (values
  ('Garlic (Lehsun)',            'garlic-lehsun-250-g',          'vegetables', 250, 'g',  '250 g', 70,  '{lehsun,lahsun,garlic}'::text[],          '{staple,sabzi}'::text[],  true,  'Fresh desi garlic bulbs, loose from the mandi.',          '2 weeks', '/products/garlic-lehsun-250-g.43c16bc2.webp', 60),
  ('Capsicum (Shimla Mirch)',    'capsicum-shimla-mirch-250-g',  'vegetables', 250, 'g',  '250 g', 35,  '{shimla,mirch,capsicum,bell,pepper}'::text[], '{sabzi}'::text[],     true,  'Crisp green capsicum, firm and glossy.',                 '5 days',  '/products/capsicum-shimla-mirch-250-g.553e6f05.webp', 45),
  ('Mint Leaves (Pudina)',       'mint-leaves-pudina-100-g',     'vegetables', 100, 'g',  '100 g', 12,  '{pudina,mint,pudhina}'::text[],          '{herbs,chutney}'::text[], true,  'Fresh pudina bunch for chutney, raita and chai.',        '3 days',  '/products/mint-leaves-pudina-100-g.3f8259c8.webp', 48),
  ('Guava (Amrood)',             'guava-amrood-500-g',           'fruits',     500, 'g',  '500 g', 50,  '{amrood,amrud,guava,jamphal}'::text[],   '{seasonal}'::text[],      true,  'Crunchy green guavas, in season now.',                   '4 days',  '/products/guava-amrood-500-g.b54daf82.webp', 58),
  ('Sweet Lime (Mosambi)',       'sweet-lime-mosambi-1-kg',      'fruits',     1,   'kg', '1 kg',  80,  '{mosambi,mausambi,sweet,lime,musambi}'::text[], '{juice}'::text[], false, 'Juicy mosambi for fresh juice.',                        '7 days',  '/products/sweet-lime-mosambi-1-kg.e342a2af.webp', 50),
  ('Orange (Santra)',            'orange-santra-1-kg',           'fruits',     1,   'kg', '1 kg',  90,  '{santra,narangi,orange,kinnow}'::text[], '{juice,seasonal}'::text[], false, 'Sweet, easy-peel oranges.',                              '7 days',  '/products/orange-santra-1-kg.da8c6d55.webp', 62),
  ('Grapes (Angoor)',            'grapes-angoor-500-g',          'fruits',     500, 'g',  '500 g', 70,  '{angoor,grapes,green,grape}'::text[],    '{snack}'::text[],         false, 'Seedless green grapes, washed and packed.',              '4 days',  '/products/grapes-angoor-500-g.501f4e5c.webp', 52),
  ('Tender Coconut (Nariyal Pani)', 'tender-coconut-1-pc',       'fruits',     1,   'pcs', '1 pc',  55,  '{nariyal,coconut,daab,tender}'::text[],  '{drink,summer}'::text[],  false, 'Green tender coconut, ready to drink.',                  '5 days',  '/products/tender-coconut-1-pc.c8a314af.webp', 44),
  ('Custard Apple (Sitaphal)',   'custard-apple-sitaphal-500-g', 'fruits',     500, 'g',  '500 g', 80,  '{sitaphal,sharifa,custard,apple}'::text[], '{seasonal}'::text[],    true,  'Soft, sweet sitaphal — the October fruit.',              '3 days',  '/products/custard-apple-sitaphal-500-g.72324d8b.webp', 46)
) as v(name, slug, cat, wv, wu, pack, mrp, syn, tags, local, descr, shelf, img, pop)
join public.categories c on c.slug = v.cat
join public.brands b on b.name = 'Fresh Farm'
on conflict (slug) do nothing;

-- Lemon already exists; it just gets its photo.
update public.products set image_url = '/products/lemon-nimbu-4-pcs.0525fc7e.webp' where slug = 'lemon-nimbu-4-pcs';

-- Stock the new produce where fruit & veg are already sold (the stores carrying coriander / banana).
insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty)
select s.store_id, p.id, round(p.mrp * 0.9), p.mrp, 30, 5, 5
from public.products p
join public.categories c on c.id = p.category_id
join (select distinct i.store_id from public.inventory i join public.products x on x.id = i.product_id where x.slug in ('coriander-leaves-dhaniya-patta-100-g','banana-kela-1-dozen') and i.is_active) s on true
where p.slug in ('garlic-lehsun-250-g','capsicum-shimla-mirch-250-g','mint-leaves-pudina-100-g','guava-amrood-500-g','sweet-lime-mosambi-1-kg','orange-santra-1-kg','grapes-angoor-500-g','tender-coconut-1-pc','custard-apple-sitaphal-500-g')
on conflict (store_id, product_id) do nothing;

insert into public.search_synonyms (term, canonical) values
('lehsun','garlic'),('lahsun','garlic'),('pudina','mint'),('amrood','guava'),('amrud','guava'),
('mosambi','sweet lime'),('santra','orange'),('narangi','orange'),('angoor','grapes'),('nariyal','coconut'),('sitaphal','custard apple'),('sharifa','custard apple'),('shimla','capsicum')
on conflict (term) do nothing;
