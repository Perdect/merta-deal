import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/catalogue/product-editor";
import { AdminPageHeader } from "@/components/admin/kit";
import { ProductStatusPill, StockPill } from "@/components/admin/catalogue/bits";
import type { Listing, StockMovement } from "@/lib/data/admin-catalogue";
import type { Product } from "@/types/app";

/**
 * Development only: the admin product editor with fixture data, so its layout can be checked
 * without an admin session. Nothing here is saved — the server actions refuse without a session.
 * `?state=new` renders the create form instead.
 */
const PRODUCT = {
  id: "00000000-0000-4000-8000-000000000001", name: "Cadbury Dairy Milk Silk", slug: "cadbury-dairy-milk-silk-1-pc",
  brand_id: null, category_id: "", description: "Cadbury Dairy Milk Silk Chocolate Bar", ingredients: null, manufacturer: "Mondelez India",
  country_of_origin: "India", bin_location: "A-12", weight_value: 55, weight_unit: "g", pack_label: "1 pc", mrp: 110,
  image_url: null, images: [], tags: ["chocolate"], synonyms: ["silk", "dairy milk"], nutrition: null,
  is_local: false, is_veg: true, is_active: true, popularity_score: 0,
  eggless_option: false, eggless_extra: 0, cake_message: false,
  barcode: null, scan_code: "MD-CHOC-0001", sku: "CHOC-SILK-1PC", stock_pool_id: null,
  rating_avg: 0, rating_count: 0, search_vector: null, seller_address: null, seller_license: null, seller_name: "MertaDeal",
  shelf_life: "6 months", created_at: "2026-11-01T06:00:00Z", updated_at: "2026-11-15T09:30:00Z",
} as unknown as Product;

const LISTING: Listing = {
  id: "00000000-0000-4000-8000-000000000002", product_id: PRODUCT.id, selling_price: 98, mrp: 110, stock_qty: 14,
  low_stock_threshold: 5, max_order_qty: 5, status: "in_stock", is_active: true, sold_count: 23, updated_at: "2026-11-15T09:30:00Z",
};

const MOVEMENTS: StockMovement[] = [
  { id: "m1", inventory_id: LISTING.id, delta: 24, reason: "restock", note: "Invoice 1123", created_at: "2026-11-14T05:00:00Z", actor: { full_name: "Haji Rehan" } },
  { id: "m2", inventory_id: LISTING.id, delta: -10, reason: "order", note: null, created_at: "2026-11-15T09:00:00Z", actor: null },
];

const CATEGORIES = [
  { id: "c1", name: "Grocery & Kitchen", parent_id: null, sort_order: 1, is_active: true },
  { id: "c4", name: "Snacks & Drinks", parent_id: null, sort_order: 2, is_active: true },
  { id: "choco", name: "Chocolates", parent_id: "c4", sort_order: 4, is_active: true },
  { id: "biscuits", name: "Biscuits", parent_id: "c4", sort_order: 5, is_active: false },
];
const BRANDS = [{ id: "b1", name: "Cadbury" }, { id: "b2", name: "Britannia" }];

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  if (state === "new") {
    return (
      <div className="mx-auto max-w-[1400px] p-4 pb-32 sm:p-5 sm:pb-32 lg:p-7 lg:pb-32">
        <AdminPageHeader back="/admin/products" title="New product" description="Adds a product to the catalogue. Give it a selling price and stock here, or later." />
        <ProductEditor product={null} listing={null} categories={CATEGORIES} brands={BRANDS} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[1400px] p-4 pb-32 sm:p-5 sm:pb-32 lg:p-7 lg:pb-32">
      <AdminPageHeader back="/admin/products" title={PRODUCT.name} description="Cadbury · 1 pc · Chocolates"
        meta={<><ProductStatusPill isActive /><StockPill status="in_stock" isActive qty={14} /><span className="text-xs text-ink-4">Updated 2 hours ago</span></>} />
      <ProductEditor product={{ ...PRODUCT, category_id: "choco", brand_id: "b1" }} listing={LISTING} movements={MOVEMENTS} categories={CATEGORIES} brands={BRANDS} />
    </div>
  );
}
