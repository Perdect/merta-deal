import { seoPages } from "@/config/site";

export type SeoSlug = (typeof seoPages)[number]["slug"];
export type Faq = { q: string; a: string };
export type SeoCopy = { description: string; keywords: string[]; highlights: string[]; body: string[]; faqs: Faq[]; relatedCategories: string[] };

export const AREAS = ["Sadar Bazaar", "Station Road", "Nagaur Road", "Jodhpur Road", "Ajmer Road", "Kalyan Nagar", "Ram Nagar", "Gandhi Chowk"] as const;
export const PINCODES = ["341510", "341511"] as const;

/** Page-specific copy. Everything here is about Merta City; no filler text. */
export const seoCopy: Record<SeoSlug, SeoCopy> = {
  "grocery-merta-city": {
    description: "Order groceries online in Merta City, Rajasthan — atta, dal, rice, oil, sugar and daily essentials from local kirana stores. Delivery in 30–60 minutes to 341510 and 341511.",
    keywords: ["online grocery Merta City", "grocery delivery Merta", "kirana online Merta", "atta dal rice Merta", "Merta Deal"],
    highlights: ["Same prices as the shop counter — no marked-up MRP", "Delivery in 30–60 minutes across Merta City", "Pay by UPI, card or cash on delivery", "Search in Hinglish: “aata”, “chini”, “tel”"],
    body: [
      "Merta Deal brings the kirana stores of Merta City online. Instead of a warehouse hundreds of kilometres away, your order is packed by a shop on Sadar Bazaar, Station Road, Nagaur Road or Jodhpur Road and delivered by a local rider — usually within the hour.",
      "You get the same atta, dal, rice, oil and sugar that the shop already sells, at the shop's own price, with live stock so you never order something that is not on the shelf. Orders above the free-delivery threshold set by the store are delivered free.",
    ],
    faqs: [
      { q: "Which areas of Merta City do you deliver to?", a: "We currently deliver across pincodes 341510 and 341511 — including Sadar Bazaar, Station Road, Nagaur Road, Jodhpur Road, Ajmer Road, Kalyan Nagar and Ram Nagar. Enter your address at checkout to confirm serviceability and the delivery fee." },
      { q: "How fast is grocery delivery in Merta?", a: "Most orders are delivered in 30–60 minutes during store hours. Each store shows its preparation time, and you can track the rider live on the map once the order is picked up." },
      { q: "Can I pay cash on delivery?", a: "Yes. Cash on delivery is available on every order, along with UPI, cards and net banking through Razorpay when online payments are enabled." },
    ],
    relatedCategories: ["grocery", "masala-spices", "dairy", "snacks", "beverages", "household"],
  },
  "kirana-store-merta": {
    description: "Merta City's neighbourhood kirana stores, now online. Order from Jain Kirana Store, Shree Balaji General Store, Agarwal Super Bazaar and more with home delivery in 341510 / 341511.",
    keywords: ["kirana store Merta", "kirana near me Merta City", "general store Merta online", "Merta City shops home delivery"],
    highlights: ["Real shops from Sadar Bazaar, Station Road and Nagaur Road", "Each order is packed by one store you choose", "OTP-verified handover by a local delivery partner", "Support local — commission stays in Merta"],
    body: [
      "A kirana store knows its customers: which atta the family prefers, which brand of ghee, how much mirch is enough. Merta Deal keeps that relationship and adds home delivery, online payment and live tracking on top.",
      "Browse stores by area, see their ratings and opening hours, and order directly from the shop you already trust. New stores across Merta City are onboarded every week — shopkeepers can register in minutes from the Store portal.",
    ],
    faqs: [
      { q: "Can I order from a specific kirana store?", a: "Yes. Open any store page to see only its products and prices. Every order is fulfilled by a single store so the shopkeeper can pack it in one go." },
      { q: "I run a kirana shop in Merta. How do I join?", a: "Register from the Store portal with your shop name, area and a photo of your shop licence or GST certificate. Once approved by the Merta Deal team you can upload products, set stock and start receiving orders." },
      { q: "Are the prices the same as in the shop?", a: "Stores set their own selling price and MRP on Merta Deal, exactly as on the shelf. Discounts shown on a product are set by that store." },
    ],
    relatedCategories: ["grocery", "local-products", "masala-spices", "dairy", "snacks", "personal-care"],
  },
  "grocery-delivery-merta": {
    description: "Fast grocery home delivery in Merta, Rajasthan. Local riders deliver from nearby kirana stores across Sadar Bazaar, Station Road, Nagaur Road and Jodhpur Road — track your rider live.",
    keywords: ["grocery home delivery Merta", "Merta delivery app", "quick grocery delivery Merta City", "rider tracking Merta"],
    highlights: ["Rider GPS tracking from pickup to your door", "Scheduled slots when the store is closed", "Express delivery in supported zones", "OTP handover so the right person receives the order"],
    body: [
      "Every Merta Deal delivery is made by a verified local delivery partner on a two-wheeler. Once the store marks your order packed, the nearest available rider accepts it, and you can follow the bike on the map with a live ETA.",
      "Delivery fees and free-delivery thresholds are set per zone — Sadar Bazaar and Station Road are usually the quickest; Nagaur Road and Jodhpur Road take a few minutes longer. Choose a scheduled slot if you want the order later in the day.",
    ],
    faqs: [
      { q: "What does delivery cost in Merta?", a: "The delivery fee depends on your zone and order value and is shown before you pay. Orders above the store's free-delivery threshold are delivered free." },
      { q: "Can I schedule a delivery for later?", a: "Yes. At checkout choose a delivery slot for later today or the next day. If a store is closed right now, scheduling lets you place the order for its next opening." },
      { q: "How does the rider hand over my order?", a: "The rider asks for the 4-digit OTP shown in your order page. Only after the OTP is verified is the order marked delivered — stores cannot mark orders delivered themselves." },
    ],
    relatedCategories: ["grocery", "fruits-vegetables", "dairy", "beverages", "snacks", "household"],
  },
  "masala-merta": {
    description: "Buy asli Rajasthani masale online in Merta — Mathania mirch, Nagauri methi, MDH, Everest and chakki-fresh spice blends from Sharma Masala Bhandar and other Merta spice shops.",
    keywords: ["masala online Merta", "Mathania mirch buy online", "Nagauri methi", "spices Merta City", "Rajasthani masala"],
    highlights: ["Mathania mirch and Nagauri methi from the region itself", "Chakki-fresh haldi, dhania and garam masala", "MDH, Everest, Catch and local brands", "Whole spices sold by weight"],
    body: [
      "Nagaur district is spice country. Mathania's red chilli, Nagaur's methi and the jeera of the surrounding belt are sold in Merta's masala shops every day — Merta Deal lists them with the pack sizes the shops actually stock.",
      "Alongside branded blends, look for the “LOCAL” tag on chakki-ground masale from Merta spice specialists. They are ground in small batches, so stock is live and can run out — order early on market days.",
    ],
    faqs: [
      { q: "Is Mathania mirch available?", a: "Yes, when the spice shops have it in stock. Search for “Mathania mirch” or open the Masala & Spices category — products carry the LOCAL tag and the store name." },
      { q: "Do you sell loose (khula) masala by weight?", a: "Shops list loose spices in 100 g, 250 g and 500 g packs. Pick the pack size that matches the quantity you need; the assistant also converts “aadha kilo” into the right number of packs." },
      { q: "Which masala brands are available in Merta?", a: "MDH, Everest, Catch, Tata Sampann and Rajasthani local brands, depending on the store. Use the brand filter on the category page." },
    ],
    relatedCategories: ["masala-spices", "grocery", "local-products", "dry-fruits", "snacks", "household"],
  },
  "fresh-grocery-merta": {
    description: "Fresh fruits, vegetables and dairy delivered in Merta City — onions, tomatoes, seasonal fruit from Merta mandi, plus Saras and Amul milk, curd and paneer, same-day.",
    keywords: ["fresh vegetables Merta", "fruits online Merta City", "Saras milk Merta", "sabzi delivery Merta", "dairy Merta"],
    highlights: ["Sabzi and phal from the morning mandi", "Saras, Amul and local dairy — milk, dahi, paneer, ghee", "Same-day delivery, live stock", "Weight-based packs: 250 g, 500 g, 1 kg"],
    body: [
      "Merta's vegetable shops buy from the mandi each morning, so what you see on Merta Deal is what arrived today. Stock is updated by the shop as it sells, and out-of-stock items are hidden rather than substituted.",
      "Dairy is delivered from the same neighbourhood shops — Saras and Amul pouches, fresh dahi and paneer — ideally ordered in the morning or evening slots when the delivery is quickest.",
    ],
    faqs: [
      { q: "How fresh are the vegetables?", a: "Shops on Merta Deal list produce bought from the mandi the same morning. If something sells out during the day the shop marks it out of stock, so you only order what is actually available." },
      { q: "Can I get milk delivered every day?", a: "You can reorder in one tap from your order history or the Buy Again row on the home page. A daily subscription is on the roadmap." },
      { q: "What if a fruit or vegetable arrives damaged?", a: "Raise a support ticket from the order page within 24 hours with a photo. The store or Merta Deal support will replace or refund the item." },
    ],
    relatedCategories: ["fruits-vegetables", "dairy", "grocery", "beverages", "snacks", "local-products"],
  },
};
