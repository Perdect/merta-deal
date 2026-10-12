/**
 * Search copy for the launch categories. Facts only: what the category actually stocks, how ordering
 * works, and where we deliver. No "best/fastest/cheapest" claims, no keyword lists. Delivery numbers
 * (ETA, fees, minimums) are never written here; pages read them from `settings` / `delivery_zones`.
 */
export type CategorySeo = {
  /** <title> (the layout appends "| MertaDeal"). */
  title: string;
  description: string;
  /** Visible page heading. */
  h1: string;
  /** One or two short paragraphs shown above the products. */
  intro: string;
  /** Natural Hindi line for customers who search in Hindi. */
  hindi: string;
};

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  grocery: {
    title: "Online Kirana & Grocery Delivery in Merta City",
    description: "Order atta, rice, dal, oil, ghee, sugar, salt, besan and dry fruits online in Merta City, Rajasthan, with home delivery. Pay by UPI or cash on delivery.",
    h1: "Grocery & kirana delivery in Merta City",
    intro: "Your monthly kirana list in one place — Aashirvaad and Fortune atta, basmati and daily rice, toor, chana and moong dal, sunflower, mustard and groundnut oil, ghee, sugar, salt, besan and dry fruits. Add what you need and we deliver it to your door in Merta City.",
    hindi: "मेड़ता सिटी में ऑनलाइन किराना — आटा, दाल, चावल, तेल और चीनी घर बैठे मंगवाएँ।",
  },
  vegetables: {
    title: "Fresh Vegetable Delivery in Merta City",
    description: "Buy fresh vegetables online in Merta City — potato, onion, tomato, green chilli, coriander, ginger, garlic, lemon and more, delivered to your home.",
    h1: "Fresh vegetable delivery in Merta City",
    intro: "Daily sabzi for your kitchen — aloo, pyaz, tamatar, hari mirch, dhaniya, adrak, lehsun, nimbu, pudina, palak, shimla mirch and gobhi. Prices are per pack shown on each item, and anything out of stock is marked so you only order what we have.",
    hindi: "मेड़ता सिटी में ताज़ी सब्ज़ी की होम डिलीवरी — आलू, प्याज़, टमाटर और हरी सब्ज़ियाँ।",
  },
  fruits: {
    title: "Fresh Fruit Delivery in Merta City",
    description: "Order fruits online in Merta City — banana, apple, pomegranate, orange, mosambi, guava, grapes and seasonal fruit, delivered to your home by MertaDeal.",
    h1: "Fresh fruit delivery in Merta City",
    intro: "Kela, seb, anar, santra, mosambi, amrood, angoor, papaya, sitaphal and nariyal pani. The range changes with the season, and each product shows its pack size and price before you add it.",
    hindi: "मेड़ता सिटी में फलों की होम डिलीवरी — केला, सेब, अनार, संतरा और मौसमी फल।",
  },
};

/** Query keys that create filtered/sorted variants of a listing. Those variants are `noindex, follow`. */
export const LISTING_FILTER_KEYS = ["q", "brand", "minPrice", "maxPrice", "minDiscount", "inStock", "local", "store", "sort", "category", "coupon"] as const;
