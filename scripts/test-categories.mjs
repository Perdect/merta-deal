// Four categories and nothing under them (0054 -> 0055 -> 0056): the tree, where every product landed,
// and that nothing was lost on the way.
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
await exec("0055 (re-applied over the seeded catalogue)", read("supabase/migrations/0055_remove_switched_off_categories.sql"));

// Counted while the shelves are still standing, so 0056 can be checked against what it inherited
// rather than against a number typed into this file.
const climb = `
  with recursive up(id, top) as (
    select id, id from public.categories where parent_id is null
    union all select c.id, u.top from public.categories c join up u on c.parent_id = u.id
  )
  select t.slug, count(p.id)::int n from up u
  join public.categories t on t.id = u.top
  join public.products p on p.category_id = u.id
  group by t.slug order by t.slug`;
const before = Object.fromEntries((await db.query(climb)).rows.map((r) => [r.slug, r.n]));
const beforeTotal = Object.values(before).reduce((a, b) => a + b, 0);

await exec("0056 (re-applied over the seeded catalogue)", read("supabase/migrations/0056_four_categories_only.sql"));
console.log(`loaded ${migrations.length} migrations + seed, then 0054, 0055 and 0056 over the top`);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const one = async (sql, p) => (await rows(sql, p))[0];

console.log("The four lines");
const tops = await rows(`select slug, name, sort_order from public.categories where is_active and parent_id is null order by sort_order`);
ok("exactly four top-level categories are switched on", tops.length === 4, JSON.stringify(tops.map((t) => t.slug)));
ok("they read in the right order", tops.map((t) => t.name).join(" | ") === "Grocery & Kitchen | Snacks & Drinks | Sweets & Bakery | Beauty & Personal Care", JSON.stringify(tops.map((t) => t.name)));
ok("their slugs are unchanged, so old links still land", tops.map((t) => t.slug).join(",") === "grocery,snacks,sweets,personal-care");

console.log("Nothing underneath them (0056)");
const all = await rows(`select slug, parent_id, is_active from public.categories order by slug`);
ok("not one sub-category is left anywhere", all.every((c) => c.parent_id === null), JSON.stringify(all.filter((c) => c.parent_id).map((c) => c.slug)));
ok("the shop a customer sees is four categories and no more", all.filter((c) => c.is_active).length === 4, JSON.stringify(all.filter((c) => c.is_active).map((c) => c.slug)));
// The dev seed keeps a few switched-off lines that still hold goods (Household, Baby Care …); 0055
// would not delete those and neither does this, so they are listed rather than asserted away.
// Production has none of them: there, these four rows are the whole table.
console.log(`  note switched off but still holding goods: ${all.filter((c) => !c.is_active).map((c) => c.slug).join(", ") || "nothing"}`);
for (const slug of ["bakery-cakes", "dry-fruits", "mithai", "chocolates", "masala-spices", "tea", "atta", "dal"]) {
  ok(`${slug} is gone`, !(await one(`select 1 from public.categories where slug = $1`, [slug])));
}

console.log("The goods came up with them");
const orphaned = await rows(`select p.slug from public.products p left join public.categories c on c.id = p.category_id where p.category_id is not null and c.id is null`);
ok("no product points at a category that was deleted", orphaned.length === 0, JSON.stringify(orphaned.map((s) => s.slug)));
const uncategorised = await rows(`select slug from public.products where category_id is null`);
ok("no product was left without a category", uncategorised.length === 0, JSON.stringify(uncategorised.map((s) => s.slug)));
const after = Object.fromEntries((await rows(`
  select c.slug, count(p.id)::int n from public.categories c
  join public.products p on p.category_id = c.id group by c.slug order by c.slug`)).map((r) => [r.slug, r.n]));
const afterTotal = Object.values(after).reduce((a, b) => a + b, 0);
ok("every line holds exactly what its whole branch held before", JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
ok("not one product was gained or lost", beforeTotal === afterTotal, `${beforeTotal} -> ${afterTotal}`);

console.log("Where each kind of product now sits");
const catOf = async (productSlug) => (await one(`select c.slug from public.products p join public.categories c on c.id = p.category_id where p.slug = $1`, [productSlug]))?.slug;
ok("masala powders came up to Grocery & Kitchen", (await catOf("dhaniya-powder-500-g")) === "grocery");
ok("chai is still a kitchen staple, not a cold drink", (await catOf("mateshwari-gold-chai-1")) === "grocery");
ok("chocolate bars sit with Snacks & Drinks", (await catOf("cadbury-dairy-milk-20g")) === "snacks");
ok("bottled water sits with Snacks & Drinks", (await catOf("bisleri-bottle")) === "snacks");
ok("colas sit with Snacks & Drinks", (await catOf("campa-500-ml")) === "snacks");
ok("the mango drink sits with Snacks & Drinks", (await catOf("frooti-mango-drink-600ml")) === "snacks");
ok("halwai sweets sit with Sweets & Bakery", (await catOf("kaju-katli")) === "sweets");
ok("cakes sit with Sweets & Bakery", (await catOf("pineapple-cake-500-g")) === "sweets");

console.log("Browsing and search still reach them");
// Named argument: the signature has grown over the years and only the category slug matters here.
const found = async (slug) => ((await one(`select public.search_products(p_category_slug => $1::text, p_page_size => 60) r`, [slug]))?.r?.items ?? []).map((i) => i.slug);
// Searched by name, not read off page one: Grocery & Kitchen now holds the whole kirana aisle.
const findIn = async (slug, q) => ((await one(`select public.search_products(p_category_slug => $1::text, p_query => $2::text, p_page_size => 60) r`, [slug, q]))?.r?.items ?? []).map((i) => i.slug);
const inGrocery = await found("grocery");
ok("Grocery & Kitchen lists the powders that came up to it", (await findIn("grocery", "Dhaniya")).includes("dhaniya-powder-500-g"));
ok("Grocery & Kitchen lists the chai that came up to it", (await findIn("grocery", "Mateshwari")).includes("mateshwari-gold-chai-1"));
const inSweets = await found("sweets");
ok("Sweets & Bakery lists both mithai and cakes", inSweets.includes("kaju-katli") && inSweets.includes("pineapple-cake-500-g"), JSON.stringify(inSweets));
const inSnacks = await found("snacks");
ok("Snacks & Drinks lists the drinks and chocolates", inSnacks.includes("bisleri-bottle") && inSnacks.includes("campa-500-ml") && inSnacks.includes("cadbury-dairy-milk-20g"), JSON.stringify(inSnacks));
ok("a line lists only its own goods", !inGrocery.includes("pineapple-cake-500-g") && !inGrocery.includes("campa-500-ml") && !inSweets.includes("bisleri-bottle"));
// The shelf pages are gone from the database; next.config.ts redirects /c/<shelf> to its line, so the
// customer never reaches this empty answer.
ok("a retired shelf slug matches nothing rather than everything", (await found("bakery-cakes")).length === 0);
const inCare = await found("personal-care");
ok("Beauty & Personal Care lists only what is filed in it", inCare.every((x) => !["kaju-katli", "campa-500-ml", "dhaniya-powder-500-g"].includes(x)), JSON.stringify(inCare));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
