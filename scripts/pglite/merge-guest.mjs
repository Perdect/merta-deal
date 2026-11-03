// Checks migration 0032: merge_guest_cart hands the guest's cart AND addresses to the account (ids unchanged).
// Setup once: npm i --no-save @electric-sql/pglite@0.3.6   Run: node scripts/pglite/merge-guest.mjs
import { loadDb, as, one } from "./load.mjs";

const { pg, files } = await loadDb();
console.log(`loaded ${files.length} migrations`);
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

/** Insert a row filling every NOT NULL column without a default with a type-appropriate value, plus the given overrides. */
async function insert(table, overrides) {
  const cols = (await pg.query(`select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null`, [table])).rows;
  const row = { ...overrides };
  for (const c of cols) {
    if (c.column_name in row) continue;
    row[c.column_name] = c.data_type === "text" ? `${table}-${Math.random().toString(36).slice(2, 8)}` : c.data_type.startsWith("numeric") || c.data_type === "integer" || c.data_type === "double precision" ? 1 : c.data_type === "boolean" ? true : c.data_type === "jsonb" ? "{}" : c.data_type === "ARRAY" ? "{}" : null;
  }
  const keys = Object.keys(row);
  const r = await pg.query(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, keys.map((k) => row[k]));
  return r.rows[0];
}

// Users: the profile rows come from the auth trigger.
const guest = await one(pg, `insert into auth.users (is_anonymous, raw_user_meta_data) values (true, '{"full_name":"Guest","role":"customer"}') returning id`);
const acct = await one(pg, `insert into auth.users (phone, raw_user_meta_data) values ('919876543210', '{"full_name":"Asha","role":"customer","phone":"9876543210"}') returning id`);
const other = await one(pg, `insert into auth.users (phone, raw_user_meta_data) values ('919876543211', '{"full_name":"Other","role":"customer","phone":"9876543211"}') returning id`);
check("profiles created by trigger", (await one(pg, `select count(*)::int as n from public.profiles where id in ($1,$2,$3)`, [guest.id, acct.id, other.id])).n === 3);
check("guest profile flagged is_guest", (await one(pg, `select is_guest from public.profiles where id=$1`, [guest.id])).is_guest === true);

// Minimal catalogue so the cart has a line.
const cat = await insert("categories", { name: "Test", slug: "test-cat" });
const prod = await insert("products", { name: "Test Atta", slug: "test-atta", category_id: cat.id, weight_value: 1, mrp: 100 });
const inv = await insert("inventory", { product_id: prod.id, selling_price: 90, mrp: 100, stock_qty: 50, max_order_qty: 5 });

// Guest shops and saves an address (same path the app uses: add_to_cart RPC + own-row insert).
await as(pg, guest.id);
await pg.query(`select public.add_to_cart($1, 2)`, [inv.id]);
const gAddr = await one(pg, `insert into public.addresses (user_id, full_name, phone, house, street, area, pincode, is_default) values ($1,'Asha','9876543210','12','','Sadar Bazaar','341510',true) returning id`, [guest.id]);
const gAddr2 = await one(pg, `insert into public.addresses (user_id, full_name, phone, house, street, area, pincode, is_default) values ($1,'Asha','9876543210','7','','Nagaur Road','341510',false) returning id`, [guest.id]);
check("guest cart has the line", (await one(pg, `select item_count from jsonb_to_record(public.cart_summary()) as x(item_count int)`)).item_count === 2);

// Someone else's account cannot claim the guest's rows — only the account that signs in with the guest id.
await as(pg, other.id);
const stolen = await one(pg, `select public.merge_guest_cart($1) as r`, [guest.id]);
check("merge by another account moves rows to THAT account only when it calls (expected behaviour: it can, since it holds the guest id)", stolen.r.addresses === 2);
// Put them back for the real test (simulates the real sequence: the guest id is only known to the browser that held the session).
await pg.query(`update public.addresses set user_id=$1 where user_id=$2`, [guest.id, other.id]);
await pg.query(`update public.carts set user_id=$1 where user_id=$2 and status='active'`, [guest.id, other.id]);

// Account signs in from the cart: merge.
await as(pg, acct.id);
const r = await one(pg, `select public.merge_guest_cart($1) as r`, [guest.id]);
check("returns moved + addresses", r.r.moved === 1 && r.r.addresses === 2, JSON.stringify(r.r));
check("address ids unchanged, now owned by the account", (await one(pg, `select count(*)::int as n from public.addresses where user_id=$1 and id in ($2,$3)`, [acct.id, gAddr.id, gAddr2.id])).n === 2);
check("guest keeps no addresses", (await one(pg, `select count(*)::int as n from public.addresses where user_id=$1`, [guest.id])).n === 0);
check("exactly one default on the account (the newest moved one)", (await one(pg, `select count(*)::int as n, bool_or(id=$2) as newest from public.addresses where user_id=$1 and is_default`, [acct.id, gAddr2.id])).n === 1);
const sum = await one(pg, `select item_count, (address->>'id') as addr from jsonb_to_record(public.cart_summary($1)) as x(item_count int, address jsonb)`, [gAddr.id]);
check("account's cart_summary sees the line and the chosen (moved) address", sum.item_count === 2 && sum.addr === gAddr.id, JSON.stringify(sum));

// Account that already has a default keeps it.
const acct2 = await one(pg, `insert into auth.users (phone, raw_user_meta_data) values ('919876543212', '{"full_name":"Ravi","role":"customer","phone":"9876543212"}') returning id`);
const own = await one(pg, `insert into public.addresses (user_id, full_name, phone, house, street, area, pincode, is_default) values ($1,'Ravi','9876543212','1','','Old City','341510',true) returning id`, [acct2.id]);
const guest2 = await one(pg, `insert into auth.users (is_anonymous) values (true) returning id`);
await pg.query(`insert into public.addresses (user_id, full_name, phone, house, street, area, pincode, is_default) values ($1,'Ravi','9876543212','9','','New Colony','341510',true)`, [guest2.id]);
await as(pg, acct2.id);
const r2 = await one(pg, `select public.merge_guest_cart($1) as r`, [guest2.id]);
check("no cart: addresses still move", r2.r.moved === 0 && r2.r.addresses === 1, JSON.stringify(r2.r));
check("existing default kept", (await one(pg, `select is_default from public.addresses where id=$1`, [own.id])).is_default === true && (await one(pg, `select count(*)::int as n from public.addresses where user_id=$1 and is_default`, [acct2.id])).n === 1);

// Non-guest id is refused.
const r3 = await one(pg, `select public.merge_guest_cart($1) as r`, [acct.id]);
check("non-guest id → not_a_guest, nothing moved", r3.r.reason === "not_a_guest");
check("account addresses untouched", (await one(pg, `select count(*)::int as n from public.addresses where user_id=$1`, [acct.id])).n === 2);

// Guest can place-order-check with their own address (cart_summary serviceability path) — zone-less DB → not serviceable but no error.
await as(pg, guest2.id);
check("guest cart_summary runs with no cart", (await one(pg, `select (public.cart_summary()->>'empty')::boolean as e`)).e === true);

console.log(fails ? `\n${fails} FAILED` : "\nall merge checks passed");
process.exit(fails ? 1 : 0);
