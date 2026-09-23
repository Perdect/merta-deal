# Barcode scanner for Merta Deal

Four scanning jobs, one shared engine. All of it runs in the browser (PWA) — no app install, no hardware scanner needed, and a ₹1,500 USB/Bluetooth scanner can be plugged in later without changing any code (it types digits into the focused input, which the same screen already accepts).

## Why this is cheap to build here
The catalog already carries **real EAN-13 barcodes for 55 products** (collected from Open Food Facts while sourcing photos), and every packaged Indian grocery product has a barcode printed on it. Adding `products.barcode` turns that into a lookup key that all four scanners share.

---

## 1. Counter sale — the "sell scanner" (highest value)
**Route:** `/store/scan` · **Who:** the kirana owner or staff on their own phone

The shopkeeper serves a walk-in customer:

1. Open `/store/scan` → camera opens, viewfinder with a scan line.
2. Point at the pack → beep + haptic → item lands in the bill with its selling price from `inventory`.
3. Scan again for each item; same barcode scanned twice = quantity 2. Loose goods (atta, dal, sabzi) have no barcode, so a "quick tiles" grid of that store's top 20 non-barcoded items sits under the viewfinder, plus a manual search box.
4. Bill total shows live. Choose **Cash** or **UPI**: UPI shows a dynamic QR (`upi://pay?pa=<store upi>&am=<amount>&tn=<bill no>`) that the customer scans with any UPI app.
5. **Complete sale** → stock decrements, the sale is recorded, receipt can be sent by WhatsApp/SMS to the customer's number (optional).

Why it matters: the shopkeeper's counter sales and Merta Deal online orders both draw down **one** stock number, so online listings stop showing items that were sold over the counter an hour ago. That single benefit is what makes stores keep the app open.

**Data model:** add `channel` to `orders` (`online` | `counter`), plus `counter_payment` (`cash` | `upi`). A counter sale is an order with no delivery, no rider, status `completed` straight away, `payment_status` `paid`. Reuses every existing report, payout and inventory path — no parallel system.

## 2. Customer scan-to-add
**Route:** `/scan` (also the camera button in the search bar) · **Who:** shoppers

Scan the empty pack in your kitchen → the product opens with ADD, or goes straight into the cart from a "scan several" mode. This is the fastest way to reorder monthly ration. If the barcode is unknown, show "Not listed yet — request it" which files a product request to the admin queue.

## 3. Rider handover scan
**Route:** inside `/rider` delivery flow

Today the rider types a 4-digit OTP. Add: the customer's order page shows a QR; the rider scans it to confirm delivery. OTP stays as the fallback (works with no camera permission, no battery, or a dark doorway). Same at pickup: the store's screen shows an order QR the rider scans instead of hunting for the order number.

## 4. Inventory receive scan
**Route:** `/store/inventory` → "Receive stock"

Scan cartons as they arrive from the distributor, type quantity, and stock goes up with an `inventory_movements` row reason `restock`. Scanning an unknown barcode opens the add-product form pre-filled from the barcode lookup.

---

## Technical design

**Engine:** `BarcodeDetector` (native, in Chrome on Android — the phone most Merta shopkeepers use) with a WASM fallback (`zxing-wasm`, ~300 KB, lazy-loaded only when the native API is missing, which covers iOS Safari and desktop). One hook, `useBarcodeScanner()`, exposes `{ start, stop, lastCode, error, engine }`.

**Formats:** EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, Code-128 (for shop-printed labels) and QR (for the handover/pickup flows).

**Scan quality rules that decide whether people keep using it:**
- Continuous scanning, not shutter — decode every frame at ~10 fps from a `<video>` element.
- **Debounce identical codes for 1.5 s** so one pack doesn't add five times; a different code is accepted instantly.
- Confirm a code only after it decodes in **2 consecutive frames** (kills misreads on curved wrappers).
- Feedback within 100 ms: short beep (Web Audio, no asset), `navigator.vibrate(40)`, and the item row flashing in — a shopkeeper is not looking at the screen.
- Torch toggle via `MediaStreamTrack.applyConstraints({ torch: true })` for dark shops; zoom slider where supported.
- Ask for `facingMode: "environment"` at `1280x720`; keep the camera warm while the scanner screen is open, release it on unmount and on `visibilitychange`.
- A **hardware scanner** (USB OTG or Bluetooth) is a keyboard: a hidden always-focused input with a 50 ms inter-keystroke timer and Enter terminator feeds the same `onCode()` handler. No separate mode.

**Offline:** counter billing must work when the shop's connection drops. The scan screen keeps an IndexedDB copy of that store's `{barcode, name, price, stock}` (a few hundred rows, refreshed on open) so lookups are instant and local; completed sales queue in IndexedDB and sync when the network returns, with the service worker's Background Sync. The UI shows "3 sales waiting to sync" rather than pretending.

**Permissions and HTTPS:** camera needs a secure origin — works on `localhost` and on the deployed HTTPS domain. First use shows a plain-language explainer before the browser prompt, and a "camera blocked" state with the exact steps to re-enable, because a denied permission is otherwise a dead end.

**Barcode → product lookup order:**
1. `products.barcode` exact match, restricted to that store's `inventory`.
2. Global catalog match (product exists but this store doesn't stock it) → offer "add to my store" with price and stock.
3. Unknown → optional Open Food Facts lookup by barcode to pre-fill name, brand, pack size and photo, then admin approval.

**Schema additions (one migration):**
```sql
alter table products add column barcode text unique;     -- EAN/UPC, indexed
alter table orders   add column channel text not null default 'online'
  check (channel in ('online','counter'));
create table barcode_aliases (                            -- one product, several packs/prints
  barcode text primary key, product_id uuid references products(id) on delete cascade,
  added_by uuid references profiles(id), created_at timestamptz default now()
);
```
Plus a `record_counter_sale(p_store_id, p_items jsonb, p_payment text, p_customer_phone text)` SECURITY DEFINER function so a counter sale decrements stock, writes the order and its items, and logs the payment atomically — same rule as every other mutation in this codebase.

## Rollout order
1. `products.barcode` + the 55 known barcodes + barcode lookup API.
2. `/store/scan` counter billing with cash + UPI QR (the money-maker).
3. Offline queue for counter sales.
4. `/scan` customer scan-to-add.
5. Rider QR handover, inventory receive scan.

Steps 1–2 are the ones worth doing first: they make a shopkeeper open the app every day even when no online order has come in.
