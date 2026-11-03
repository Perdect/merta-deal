import type { Enums, Tables, Views } from "./database";

/** Row of v_product_cards with real nullability (information_schema reports every view column as nullable). */
export type ProductCard = {
  id: string; name: string; slug: string; pack_label: string | null; weight_value: number; weight_unit: string; image_url: string | null; images: string[]; base_mrp: number;
  category_id: string; category_name: string; category_slug: string; brand_id: string | null; brand_name: string | null; brand_slug: string | null;
  is_local: boolean; is_veg: boolean; popularity_score: number; rating_avg: number; rating_count: number;
  /** Not sent by search_products (listing payloads carry only what a card renders); present on full view rows. */
  tags?: string[]; created_at?: string;
  inventory_id: string | null; selling_price: number | null; mrp: number | null;
  stock_qty: number | null; stock_status: Enums<"inventory_status"> | null; max_order_qty: number | null; discount_pct: number | null;
};
export type ProductCardRow = Views<"v_product_cards">;
export type Category = Tables<"categories">;
export type Address = Tables<"addresses">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type Notification = Tables<"notifications">;
export type Coupon = Tables<"coupons">;
export type Banner = Tables<"banners">;
export type Profile = Tables<"profiles">;
export type Inventory = Tables<"inventory">;
export type Product = Tables<"products">;
export type DeliveryPartner = Tables<"delivery_partners">;
export type DeliveryZone = Tables<"delivery_zones">;
export type Setting = Tables<"settings">;
export type Review = Tables<"reviews">;
export type OrderStatus = Enums<"order_status">;
export type PaymentMethod = Enums<"payment_method">;
export type DeliveryType = Enums<"delivery_type">;
export type UserRole = Enums<"user_role">;

export type HomeFeed = {
  banners: Banner[];
  categories: Pick<Category, "id" | "name" | "slug" | "icon" | "color" | "image_url">[];
  best_sellers: ProductCard[];
  deals: ProductCard[];
  new_arrivals: ProductCard[];
  local_products: ProductCard[];
  popular: ProductCard[];
  buy_again: ProductCard[];
  recommended: ProductCard[];
};

export type SearchResult = { items: ProductCard[]; total: number; page: number; page_size: number; has_more: boolean; /** The query itself failed (shown as an error with Retry, never as "no products"). */ error?: boolean };
export type SearchSuggest = {
  products: { id: string; name: string; slug: string; image_url: string | null; pack_label: string | null; selling_price: number | null; brand_name: string | null }[];
  brands: { id: string; name: string; slug: string }[];
  categories: { id: string; name: string; slug: string; icon: string | null }[];
};

/** The product's single listing: price, stock and per-order limit. */
export type ProductOffer = { inventory_id: string; selling_price: number; mrp: number; stock_qty: number; status: Enums<"inventory_status">; max_order_qty: number; discount_pct: number };
export type ProductReview = { id: string; rating: number; title: string | null; comment: string | null; created_at: string; user_name: string };
export type ProductDetail = ProductCard & {
  tags: string[]; created_at: string;
  description: string | null; ingredients: string | null; nutrition: Record<string, number | string> | null; manufacturer: string | null; country_of_origin: string | null;
  shelf_life: string | null; seller_name: string | null; seller_address: string | null; seller_license: string | null;
  offers: ProductOffer[]; related: ProductCard[]; frequently_bought: ProductCard[]; more_from_brand: ProductCard[]; reviews: ProductReview[]; in_wishlist: boolean;
};

export type CartLine = { id: string; inventory_id: string; product_id: string; name: string; slug: string; image_url: string | null; pack_label: string | null; brand_name: string | null; quantity: number; unit_price: number; unit_mrp: number; line_total: number; stock_qty: number; max_order_qty: number; available: boolean;
  /** Quantity is above the product's per-order limit (limit lowered after adding). */ over_limit?: boolean;
  /** Price when the quantity was last set; `price_changed` once the current price differs. */ price_at_add?: number | null; price_changed?: boolean };
export type CartIssue = { product_id: string; inventory_id?: string; name: string; quantity?: number; available_qty: number; max_order_qty?: number; reason?: "unavailable" | "stock" | "limit" };
/** reorder RPC: lines left out, and lines added with fewer packs than ordered last time. */
export type ReorderResult = { added: number; skipped: { name: string; reason?: string }[]; adjusted?: { name: string; requested: number; added: number; reason: "limit" | "stock" }[] };
export type CartSummary = {
  cart_id?: string; empty: boolean;
  /** False outside business hours or when ordering is switched off (settings). */ business_open?: boolean;
  items: CartLine[]; item_count: number; issues: CartIssue[];
  subtotal: number; mrp_total: number; item_savings: number;
  coupon: { valid: boolean; coupon_id?: string; code?: string; title?: string; discount?: number; reason?: string } | null; coupon_discount: number;
  delivery_fee: number; /** Fee waived because the order is above the free-delivery amount (shown struck through). */ delivery_fee_waived?: number; express_fee: number; platform_fee: number; tax: number; tax_rate: number; total: number;
  free_delivery_threshold: number; free_delivery_gap: number; min_order_amount: number; meets_min_order: boolean;
  address: Address | null; zone: { id: string; name: string; express_supported: boolean } | null;
  serviceable: boolean; service_message: string | null; eta_min_minutes: number; eta_max_minutes: number; distance_km: number; delivery_type: DeliveryType;
};

export type Serviceability = { serviceable: boolean; message?: string; zone_id?: string; zone_name?: string; area?: string; pincode?: string; city?: string; city_slug?: string; delivery_fee?: number; min_order_amount?: number; free_delivery_threshold?: number; eta_min_minutes?: number; eta_max_minutes?: number; express_supported?: boolean };

export type PickupPoint = { name: string; phone: string | null; address_line1: string | null; area: string | null; lat: number | null; lng: number | null };
export type OrderHistoryEntry = { status: OrderStatus; note: string | null; created_at: string; actor_role: UserRole | null };
export type TrackingRider = { name: string | null; phone: string | null; avatar_url: string | null; vehicle_type: string; vehicle_number: string | null; rating_avg: number };
export type TrackingLocation = { lat: number; lng: number; heading: number | null; speed_mps: number | null; accuracy_m: number | null; recorded_at: string };
export type OrderTracking = {
  order: Order;
  items: OrderItem[];
  history: OrderHistoryEntry[];
  /** Where the order is packed and collected from (settings.pickup_point). */ pickup: PickupPoint;
  payment: { provider: string; method: PaymentMethod; status: Enums<"payment_status">; amount: number; provider_order_id: string | null; refund_required: boolean } | null;
  assignment: { id: string; status: Enums<"assignment_status">; accepted_at: string | null; picked_up_at: string | null; delivered_at: string | null; distance_km: number | null; earning: number | null; cod_amount: number; expires_at: string; rider: TrackingRider; last_location: TrackingLocation | null } | null;
  customer: { name: string; phone: string } | null;
  /** Only for the customer, only while out for delivery. */ delivery_otp: string | null;
  /** Too many wrong OTP attempts: the handover must go through support. */ otp_locked?: boolean | null;
  can_review: boolean;
  reviews: { target: Enums<"review_target">; product_id: string | null; rating: number; status: Enums<"review_status"> }[];
  viewer: "admin" | "customer" | "rider";
};

export type RiderAssignment = {
  id: string; status: Enums<"assignment_status">; offered_at: string; expires_at: string; responded_at: string | null; picked_up_at: string | null; delivered_at: string | null;
  distance_km: number | null; earning: number; cod_amount: number; pickup_lat: number; pickup_lng: number; drop_lat: number | null; drop_lng: number | null;
  order: { id: string; order_number: string; status: OrderStatus; total: number; item_count: number; payment_method: PaymentMethod; delivery_instructions: string | null; address: Address; promised_at: string | null; created_at: string };
  pickup: PickupPoint & { lat: number; lng: number };
  items: { name: string; quantity: number; pack_label: string | null }[];
};

export type RiderStats = { rider: DeliveryPartner; today_deliveries: number; today_earnings: number; week_earnings: number; cod_in_hand: number; cash_due?: number; new_requests: number; active: number };
export type AdminStats = { total_orders: number; today_orders: number; gmv: number; today_gmv: number; revenue: number; customers: number; riders: number; online_riders: number; to_pack: number; pending_orders: number; cancelled_orders: number; avg_delivery_minutes: number | null; on_time_pct: number | null; pending_reviews: number; open_tickets: number; refunds_pending: number; low_stock: number; daily: { day: string; orders: number; gmv: number }[]; status_breakdown: Record<string, number> };

export type PublicSettings = Record<string, unknown>;
