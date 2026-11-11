/** Shapes returned by the scan RPCs (supabase/migrations/0034_scan_stock_packing.sql). */
export type ScanVariant = { id: string; pack_label: string | null; sku: string; selling_price: number | null; available_packs: number; selected: boolean };

export type ScanProduct = {
  id: string; name: string; brand_name: string | null; pack_label: string | null; weight_value: number; weight_unit: string; pack_grams: number;
  image_url: string | null; sku: string; barcode: string | null; scan_code: string; is_active: boolean;
  listed: boolean; inventory_id: string | null; selling_price: number | null; mrp: number | null; listing_active: boolean;
  stock_mode: "loose" | "pack"; can_be_loose: boolean; available_packs: number; reserved_packs: number; stock_status: string | null;
  pool: { id: string; name: string; balance_g: number; reserved_g: number } | null;
  variants: ScanVariant[];
};

export type PackLine = { id: string; product_id: string | null; name: string; brand_name: string | null; pack_label: string | null; image_url: string | null; quantity: number; packed_qty: number; sku: string | null; unit_price: number; /** Cake options (0049). */ eggless?: boolean; cake_message?: string | null; bin_location?: string | null; exception?: { id: string; status: string; available_qty: number; kind: string } | null };
export type PackFlag = { result: PackResult; message: string; at: string; by: string | null };
export type PackResult = "ok" | "wrong_product" | "wrong_weight" | "extra" | "unknown" | "undo" | "packed";

export type ScanOrder = {
  id: string; order_number: string; scan_code: string; status: string; created_at: string; total: number; item_count: number;
  payment_method: string; payment_status: string; customer_name: string | null; area: string | null; delivery_instructions: string | null;
  packed_at: string | null; packed_by_name: string | null; lines: PackLine[]; flags: PackFlag[];
  assignment: { id: string; status: string; rider_id: string; rider_name: string | null; rider_phone: string | null } | null;
  cod: { amount: number; at: string; via: string } | null;
};

export type RiderScanOrder = {
  id: string; order_number: string; status: string; item_count: number; packed: boolean; assignment_id: string; assignment_status: string; cod_amount: number;
  items: { name: string; quantity: number; pack_label: string | null }[];
};

export type ScanResolved =
  | { kind: "product"; product: ScanProduct }
  | { kind: "order"; order: ScanOrder }
  | { kind: "rider_order"; order: RiderScanOrder }
  | { kind: "unknown"; code: string };

export type StockActionKind = "receive" | "wastage" | "adjust";
export type StockUnit = "kg" | "g" | "packs";
export type StockInput = { requestKey: string; productId: string; action: StockActionKind; quantity: number; unit: StockUnit; direction?: "add" | "remove"; reason?: string; note?: string };
export type StockResult = { replayed: boolean; balance_after: number; balance_unit: "g" | "packs"; product: ScanProduct };

export type StockHistoryRow = {
  id: string; at: string; reason: string; note: string | null; delta: number; delta_grams: number | null; quantity: number | null; unit: string | null;
  balance_after: number | null; balance_unit: string | null; staff: string | null; pack_label: string | null; order_id: string | null;
};
