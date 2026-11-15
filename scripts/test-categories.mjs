// Four top-level categories (0054): the tree, where every product landed, and that nothing was lost.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-categories.mjs "$PWD"
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";

const root = process.argv[2];
const db = await PGlite.create({ extensions: { pg_trgm } });
const read = (p) => fs.readFileSync(`${root}/${p}`, "utf8");
async function exec(label, sql) { try { await db.exec(sql); } catch (e) { console.error(`SETUP FAIL ${label}: ${e.message}`); process.exit(1); } }
await exec("shim", read("supabase/local/00_supabase_shim.sql"));
await exec("stubs", `
  create or replace function extensions.unaccent(text) returns text language sql immutable as $$ select $1 $$;
  create or replace function extensions.crypt(text, text) returns text language sql as $$ select md5($1) $$;
  create or replace function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create or replace function extensions.gen_random_bytes(int) returns bytea language sql as $$ select substring(decode(repeat(md5(random()::text), 8), 'hex') from 1 for $1) $$;`);
await exec("auth", read("supabase/local/00b_auth_tables_fallback.sql"));
const migrations = fs.readdirSync(`${root}/supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
for (const f of migrations) await exec(f, read(`supabase/migrations/${f}`).replace(/create extension if not exists "(pgcrypto|unaccent)"[^;]*;/g, ""));
await exec("seed", read("supabase/seed.sql"));
// The seed writes the full catalogue after the migrations have run, so it puts back the categories
// 0054 files away. Applying 0054 again here is what production does: run it against a stocked shop.
//
// The live shop's catalogue is not the dev seed's: it has a Sweets line, a Bakery line and a handful
// of products the seed has never heard of, each sitting where it sits today. They go in first, in
// their pre-migration homes, so the moves in 0054 are actually exercised rather than skipped.
await exec("live-shaped fixture", `
  insert into public.categories (name, slug, icon, sort_order, is_active, is_featured) values
    ('Sweets', 'sweets', 'candy', 3, true, true),
    ('Bakery', 'bakery-cakes', 'cake', 4, true, true);
  insert into public.products (name, slug, category_id, weight_value, weight_unit, pack_label, mrp)
  select v.name, v.slug, c.id, v.grams, 'g', v.pack, v.mrp
  from (values
    ('Dhaniya Powder', 'dhaniya-powder-500-g', 'grocery', 500, '500 g', 90),
    ('Haldi Powder', 'haldi-powder-500-g', 'grocery', 500, '500 g', 120),
    ('Lal Mirch Powder', 'lal-mirch-powder-500-g', 'grocery', 500, '500 g', 150),
    ('Mateshwari Gold Chai', 'mateshwari-gold-chai-1', 'grocery', 250, '250 g', 140),
    ('Cadbury Dairy Milk', 'cadbury-dairy-milk-20g', 'milk', 20, '20 g', 20),
    ('Bisleri Bottle', 'bisleri-bottle', 'beverages', 1000, '1 L', 20),
    ('Campa', 'campa-500-ml', 'juice', 500, '500 ml', 20),
    ('Frooti Mango Drink', 'frooti-mango-drink-600ml', 'juice', 600, '600 ml', 40),
    ('Kaju Katli', 'kaju-katli', 'sweets', 250, '250 g', 300),
    ('Rasgullah', 'rasgullah', 'sweets', 500, '500 g', 180),
    ('Yummy & Testy Pineapple Cake', 'pineapple-cake-500-g', 'bakery-cakes', 500, '500 g', 450)
  ) as v(name, slug, cat, grams, pack, mrp)
  join public.categories c on c.slug = v.cat;
  -- A product only reaches a shopper through a listing, so give each fixture one in the first open shop.
  insert into public.inventory (product_id, selling_price, mrp, stock_qty)
  select p.id, p.mrp, p.mrp, 10
  from public.products p where p.slug in (
    'dhaniya-powder-500-g','haldi-powder-500-g','lal-mirch-powder-500-g','mateshwari-gold-chai-1',
    'cadbury-dairy-milk-20g','bisleri-bottle','campa-500-ml','frooti-mango-drink-600ml',
    'kaju-katli','rasgullah','pineapple-cake-500-g');`);
await exec("0054 (re-applied over the seeded catalogue)", read("supabase/migrations/0054_four_top_categories.sql"));
console.log(`loaded ${migrations.length} migrations + seed, then 0054 over the top`);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const one = async (sql, p) => (await rows(sql, p))[0];

console.log("The four lines");
const tops = await rows(`select slug, name, sort_order from public.categories where is_active and parent_id is null order by sort_order`);
ok("exactly four top-level categories are switched on", tops.length === 4, JSON.stringify(tops.map((t) => t.slug)));
ok("they read in the right order", tops.map((t) => t.name).join(" | ") === "Grocery & Kitchen | Snacks & Drinks | Sweets & Bakery | Beauty & Personal Care", JSON.stringify(tops.map((t) => t.name)));
ok("their slugs are unchanged, so old links still land", tops.map((t) => t.slug).join(",") === "grocery,snacks,sweets,personal-care");

console.log("Shape the admin panel can edit");
const deep = await rows(`select c.slug from public.categories c join public.categories p on p.id = c.parent_id where c.is_active and p.parent_id is not null`);
ok("no switched-on category is three levels deep", deep.length === 0, JSON.stringify(deep.map((d) => d.slug)));
const withKids = await rows(`select c.slug from public.categories c where c.parent_id is not null and exists (select 1 from public.categories k where k.parent_id = c.id)`);
ok("no sub-category has sub-categories of its own", withKids.length === 0, JSON.stringify(withKids.map((d) => d.slug)));

console.log("Nothing was deleted");
for (const slug of ["fruits", "vegetables", "dairy", "beverages", "milk", "household", "baby-care", "local-products", "bakery-cakes", "dry-fruits"]) {
  ok(`${slug} still exists as a row`, Boolean(await one(`select 1 from public.categories where slug = $1`, [slug])));
}
const strays = await rows(`select slug from public.categories where is_active and parent_id is null and slug not in ('grocery','snacks','sweets','personal-care')`);
ok("every other line is switched off, not removed", strays.length === 0, JSON.stringify(strays.map((s) => s.slug)));

console.log("Where each kind of product now sits");
const catOf = async (productSlug) => (await one(`select c.slug from public.products p join public.categories c on c.id = p.category_id where p.slug = $1`, [productSlug]))?.slug;
const parentOf = async (catSlug) => (await one(`select p.slug from public.categories c join public.categories p on p.id = c.parent_id where c.slug = $1`, [catSlug]))?.slug;
ok("masala powders left the Grocery parent for Masala & Spices", (await catOf("dhaniya-powder-500-g")) === "masala-spices");
ok("chai leaves are a kitchen staple, not a cold drink", (await catOf("mateshwari-gold-chai-1")) === "tea");
ok("Masala & Spices hangs off Grocery & Kitchen", (await parentOf("masala-spices")) === "grocery");
ok("Tea hangs off Grocery & Kitchen", (await parentOf("tea")) === "grocery");
ok("Dry Fruits hangs off Grocery & Kitchen", (await parentOf("dry-fruits")) === "grocery");
ok("chocolate bars left Dairy for Chocolates", (await catOf("cadbury-dairy-milk-20g")) === "chocolates");
ok("Chocolates hangs off Snacks & Drinks", (await parentOf("chocolates")) === "snacks");
ok("bottled water sits under Water", (await catOf("bisleri-bottle")) === "water");
ok("colas sit under Soft Drinks", (await catOf("campa-500-ml")) === "soft-drinks");
ok("the mango drink stays under Juice", (await catOf("frooti-mango-drink-600ml")) === "juice");
ok("halwai sweets moved onto the Mithai shelf", (await catOf("kaju-katli")) === "mithai");
ok("Mithai and Bakery & Cakes both hang off Sweets & Bakery", (await parentOf("mithai")) === "sweets" && (await parentOf("bakery-cakes")) === "sweets");
ok("cakes stayed where they were", (await catOf("pineapple-cake-500-g")) === "bakery-cakes");

console.log("What the four lines leave out");
const hidden = await rows(`select v.slug from public.v_product_cards v join public.categories c on c.id = v.category_id where not c.is_active`);
ok("no product is listed out of a switched-off category", hidden.length === 0, JSON.stringify(hidden.map((h) => h.slug)));
const shelvesOn = await rows(`
  select c.slug, count(pr.id)::int n from public.categories c
  left join public.products pr on pr.category_id = c.id and pr.is_active
  where c.is_active and c.parent_id is not null group by c.slug having count(pr.id) > 0 order by c.slug`);
ok("every shelf that holds goods is switched on", shelvesOn.length > 0, JSON.stringify(shelvesOn.map((r) => `${r.slug}:${r.n}`)));
const emptyOn = await rows(`
  select c.slug from public.categories c
  join public.categories p on p.id = c.parent_id and p.is_active
  where c.is_active and not exists (select 1 from public.products pr where pr.category_id = c.id and pr.is_active)
    and c.slug in ('milk','curd','paneer','butter','cheese','turmeric','red-chilli','coriander','cumin','garam-masala','whole-spices','kitchen-essentials','biscuits','chips','namkeen')`);
ok("a shelf whose goods moved away is not left switched on and empty", emptyOn.length === 0, JSON.stringify(emptyOn.map((r) => r.slug)));
const dark = await rows(`
  select c.slug, count(pr.id)::int n from public.categories c
  join public.products pr on pr.category_id = c.id and pr.is_active
  where not c.is_active group by c.slug order by c.slug`);
// Not a failure: a shop that sells only these four lines puts the rest away. Printed so the owner can
// see exactly which goods stop being listed before this is applied anywhere.
console.log(`  note put away by this change: ${dark.length ? dark.map((d) => `${d.slug} (${d.n})`).join(", ") : "nothing"}`);

console.log("Browsing and search still reach them");
// Named argument: the signature has grown over the years and only the category slug matters here.
const found = async (slug) => ((await one(`select public.search_products(p_category_slug => $1::text, p_page_size => 60) r`, [slug]))?.r?.items ?? []).map((i) => i.slug);
const inGrocery = await found("grocery");
ok("the masala shelf lists the powders that moved onto it", (await found("masala-spices")).includes("dhaniya-powder-500-g"));
ok("the tea shelf lists the chai that moved onto it", (await found("tea")).includes("mateshwari-gold-chai-1"));
// A page holds 60 at most, so count rather than read the page: the parent must cover its whole tree.
const total = async (slug) => (await one(`select (public.search_products(p_category_slug => $1::text)->>'total')::int t`, [slug]))?.t ?? 0;
const [gTotal, masala, tea, dryFruits] = await Promise.all([total("grocery"), total("masala-spices"), total("tea"), total("dry-fruits")]);
ok("Grocery & Kitchen counts every shelf below it", gTotal >= masala + tea + dryFruits && masala > 0 && tea > 0, `${gTotal} vs ${masala}+${tea}+${dryFruits}`);
const inSweets = await found("sweets");
ok("Sweets & Bakery lists both mithai and cakes", inSweets.includes("kaju-katli") && inSweets.includes("pineapple-cake-500-g"), JSON.stringify(inSweets));
const inSnacks = await found("snacks");
ok("Snacks & Drinks lists the drinks and chocolates", inSnacks.includes("bisleri-bottle") && inSnacks.includes("campa-500-ml") && inSnacks.includes("cadbury-dairy-milk-20g"), JSON.stringify(inSnacks));
ok("an old link to /c/bakery-cakes still lists cakes", (await found("bakery-cakes")).includes("pineapple-cake-500-g"));
ok("a line lists only its own goods", !inGrocery.includes("pineapple-cake-500-g") && !inGrocery.includes("campa-500-ml") && !inSweets.includes("bisleri-bottle"));
ok("a switched-off line lists nothing rather than everything", (await found("dairy")).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
