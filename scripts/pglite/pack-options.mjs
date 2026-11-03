// Checks migration 0033: sizes of one product (same name + brand) are one listing with `variants`; product_detail lists them.
// Setup once: npm i --no-save @electric-sql/pglite@0.3.6   Run: node scripts/pglite/pack-options.mjs
import { loadDb, as, one } from "./load.mjs";

const { pg, files } = await loadDb();
console.log(`loaded ${files.length} migrations`);
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };
async function insert(table, overrides) {
  const cols = (await pg.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null`, [table])).rows;
  const row = { ...overrides };
  for (const c of cols) { if (c.column_name in row) continue; row[c.column_name] = c.data_type === "text" ? `${table}-${Math.random().toString(36).slice(2, 8)}` : ["numeric","integer","double precision"].includes(c.data_type) ? 1 : c.data_type === "boolean" ? true : c.data_type === "jsonb" ? "{}" : c.data_type === "ARRAY" ? "{}" : null; }
  const keys = Object.keys(row);
  return (await pg.query(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, keys.map((k) => row[k]))).rows[0];
}

const cat = await insert("categories", { name: "Atta", slug: "atta" });
const brand = await insert("brands", { name: "Aashirvaad", slug: "aashirvaad" });
const a5 = await insert("products", { name: "Aashirvaad Shudh Chakki Atta", slug: "atta-5-kg", category_id: cat.id, brand_id: brand.id, weight_value: 5, weight_unit: "kg", pack_label: "5 kg", mrp: 285, popularity_score: 10 });
const a10 = await insert("products", { name: "Aashirvaad Shudh Chakki Atta", slug: "atta-10-kg", category_id: cat.id, brand_id: brand.id, weight_value: 10, weight_unit: "kg", pack_label: "10 kg", mrp: 560, popularity_score: 50 });
const a500 = await insert("products", { name: "Aashirvaad Shudh Chakki Atta", slug: "atta-500-g", category_id: cat.id, brand_id: brand.id, weight_value: 500, weight_unit: "g", pack_label: "500 g", mrp: 40 });
const salt = await insert("products", { name: "Tata Salt", slug: "tata-salt", category_id: cat.id, weight_value: 1, weight_unit: "kg", pack_label: "1 kg", mrp: 28 });
await insert("products", { name: "Aashirvaad Shudh Chakki Atta", slug: "atta-1-kg", category_id: cat.id, brand_id: brand.id, weight_value: 1, weight_unit: "kg", pack_label: "1 kg", mrp: 60 });
await insert("inventory", { product_id: a5.id, selling_price: 248, mrp: 285, stock_qty: 20, max_order_qty: 5 });
await insert("inventory", { product_id: a10.id, selling_price: 499, mrp: 560, stock_qty: 0, max_order_qty: 3, status: "out_of_stock" });
await insert("inventory", { product_id: a500.id, selling_price: 38, mrp: 40, stock_qty: 9, max_order_qty: 5 });
await insert("inventory", { product_id: salt.id, selling_price: 25, mrp: 28, stock_qty: 30, max_order_qty: 5 });

await as(pg, null, "anon");
const r = (await one(pg, `select public.search_products(p_category_slug => 'atta') as r`)).r;
check("family collapsed to one card + salt", r.total === 2 && r.items.length === 2, `total=${r.total} items=${r.items.length}`);
const card = r.items.find((i) => i.name.startsWith("Aashirvaad"));
check("representative is an in-stock size", card && card.slug !== "atta-10-kg", card?.slug);
check("variants: 3 listed sizes, smallest first, unlisted 1 kg excluded", card?.variants?.map((v) => v.pack_label).join(",") === "500 g,5 kg,10 kg", JSON.stringify(card?.variants?.map((v) => v.pack_label)));
check("variant carries price, mrp, stock, limit", card?.variants?.[1]?.selling_price == 248 && card?.variants?.[1]?.max_order_qty === 5 && card?.variants?.[2]?.stock_status === "out_of_stock");
const saltCard = r.items.find((i) => i.name === "Tata Salt");
check("single-size product has no variants", Array.isArray(saltCard?.variants) && saltCard.variants.length === 0);
check("no tags / created_at / family on the wire", !("tags" in card) && !("created_at" in card) && !("family" in card));

const q = (await one(pg, `select public.search_products(p_query => 'atta') as r`)).r;
check("text search also collapses", q.items.filter((i) => i.name.startsWith("Aashirvaad")).length === 1);
const admin = (await one(pg, `select public.search_products(p_category_slug => 'atta', p_include_unlisted => true) as r`)).r;
check("admin picker (unlisted included) sees every row, no variants", admin.total === 5 && admin.items.every((i) => i.variants.length === 0), `total=${admin.total}`);
const page2 = (await one(pg, `select public.search_products(p_category_slug => 'atta', p_page_size => 1, p_page => 2) as r`)).r;
check("paging over collapsed rows", page2.items.length === 1 && page2.has_more === false && page2.total === 2);

const d = (await one(pg, `select public.product_detail('atta-10-kg') as r`)).r;
check("product_detail lists the sizes (itself included)", d.variants.length === 3 && d.variants.some((v) => v.id === a10.id));
const ds = (await one(pg, `select public.product_detail('tata-salt') as r`)).r;
check("product_detail: single size → empty variants", ds.variants.length === 0);

console.log(fails ? `\n${fails} FAILED` : "\nall pack-option checks passed");
process.exit(fails ? 1 : 0);
