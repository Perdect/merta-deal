import { site } from "@/config/site";
import type { RequestDestination, RequestKind } from "@/lib/service-requests";

export const SERVICE_SLUGS = ["gifts-delivery-merta-city", "sweets-delivery-merta-city", "food-delivery-merta-city", "fast-food-delivery-merta-city", "cake-delivery-merta-city", "bulk-gifts-sweets-merta-city", "urgent-delivery-merta-city", "home-delivery-merta-city", "hotel-delivery-merta-city", "office-delivery-merta-city", "delivery-boy-merta-city"] as const;
export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

/** Short names for links between the pages, the footer and the sitemap. */
export const SERVICE_LINKS: { slug: ServiceSlug; href: string; label: string; blurb: string }[] = [
  { slug: "gifts-delivery-merta-city", href: "/gifts-delivery-merta-city", label: "Gift delivery", blurb: "Birthdays, anniversaries and special occasions" },
  { slug: "sweets-delivery-merta-city", href: "/sweets-delivery-merta-city", label: "Sweets delivery", blurb: "Mithai ordered online and delivered locally" },
  { slug: "food-delivery-merta-city", href: "/food-delivery-merta-city", label: "Food delivery", blurb: "Meals from local kitchens, confirmed before you pay" },
  { slug: "fast-food-delivery-merta-city", href: "/fast-food-delivery-merta-city", label: "Fast food delivery", blurb: "Snacks and quick bites, delivered hot where possible" },
  { slug: "cake-delivery-merta-city", href: "/cake-delivery-merta-city", label: "Cake delivery", blurb: "Ready cakes and custom cakes with confirmed timing" },
  { slug: "bulk-gifts-sweets-merta-city", href: "/bulk-gifts-sweets-merta-city", label: "Bulk gifts & sweets", blurb: "Weddings, festivals and offices, by quotation" },
  { slug: "urgent-delivery-merta-city", href: "/urgent-delivery-merta-city", label: "Urgent delivery", blurb: "Eligible orders, with a delivery time target" },
  { slug: "home-delivery-merta-city", href: "/home-delivery-merta-city", label: "Home delivery", blurb: "To your door, or to family in town" },
  { slug: "hotel-delivery-merta-city", href: "/hotel-delivery-merta-city", label: "Hotel delivery", blurb: "To your room or the hotel reception" },
  { slug: "office-delivery-merta-city", href: "/office-delivery-merta-city", label: "Office delivery", blurb: "To your desk, floor or front desk" },
  { slug: "delivery-boy-merta-city", href: "/delivery-boy-merta-city", label: "Delivery boy", blurb: "Request a local pickup or drop" },
];

/** Live values from `settings` and `delivery_zones`, so no page states a figure of its own. */
export type ServiceContext = {
  /** Delivery time target in minutes (`delivery_eta_min_minutes`). */
  target: number;
  /** "6:00 am – 11:00 pm", or null when hours are not set. */
  hours: string | null;
  /** Zone names and pincodes as a phrase, or null when no zone is active. */
  coverage: string | null;
  pay: string;
  /** Per-product limit in the online cart (`default_max_order_qty`). */
  maxQty: number;
  /** Set only when express delivery is really switched on for a zone. */
  express: { eta: string; fee: string; zones: string } | null;
  /** "from ₹X" for pickup and drop, or null when no figure is published. */
  pickupFrom: string | null;
  /** Slugs of the categories on sale right now; shop links to others are dropped. */
  activeCategories: Set<string>;
};

type Item = { t: string; s: string };
export type ServiceCopy = {
  /** Page title; the site template adds the brand. */
  title: string; description: string; h1: string; crumb: string; serviceType: string; hindi: string; intro: string[];
  /** A plain statement that needs to sit near the top (delivery promises). */
  notice?: string;
  order: { label: string; href: string };
  whatsappText: string;
  offersTitle: string; offers: Item[];
  stepsTitle: string; steps: Item[];
  conditionsTitle: string; conditions: string[];
  faqs: { q: string; a: string }[];
  /** Which request form the page carries, with its heading and Hindi line. */
  form?: { kind: RequestKind; title: string; hindi: string; submit: string; destination?: RequestDestination };
  /** Extra section for pages that explain several destinations. */
  extra?: { title: string; items: Item[] };
  /** Links into the shop and the local directory. */
  shopLinks?: { href: string; label: string }[];
  /** Category shown once it exists with products (Admin → Categories); the order button then opens it. */
  category?: { slug: string; label: string };
  related: ServiceSlug[];
};

const city = site.city;
const coverageLine = (c: ServiceContext) => `${c.coverage ? `We deliver to homes, hotels and offices in ${c.coverage}.` : `We deliver to homes, hotels and offices in ${city}; call us to check your address.`}`;
/** The highlight line, word for word as the business wrote it. */
export const URGENT_HIGHLIGHT = `Need food, sweets, cakes, or gifts urgently? Request fast delivery to your home, hotel, or office in ${city}.`;
const directoryLinks = [
  { href: "/restaurants-merta-city", label: `Restaurants in ${city}` },
  { href: "/bakeries-merta-city", label: `Bakeries in ${city}` },
  { href: "/hotels-merta-city", label: `Hotels in ${city}` },
];
const hoursLine = (c: ServiceContext) => (c.hours ? `Requests are handled during our order hours, ${c.hours}.` : "Call us to check today's timings.");
const targetFactors = "product availability, preparation time, delivery distance and rider availability";

export function serviceCopy(slug: ServiceSlug, c: ServiceContext): ServiceCopy {
  switch (slug) {
    case "gifts-delivery-merta-city":
      return {
        title: `Gift Delivery in ${city}: Birthdays & Anniversaries`,
        description: `Send birthday, anniversary and special-occasion gifts in ${city}, Rajasthan. ${site.seoName} confirms the gift, price and time before delivery.`,
        h1: `Gift delivery in ${city}`, crumb: "Gift delivery", serviceType: "Gift delivery",
        hindi: `${site.cityHindi} में जन्मदिन, सालगिरह और खास मौकों के लिए गिफ्ट डिलीवरी। आप बताइए क्या चाहिए, कीमत और समय हम पहले पक्का करेंगे।`,
        intro: [
          `Forgot to pick something up, or sending a surprise to family across town? ${site.seoName} takes your gift order and our own delivery partners bring it to the door in ${city}.`,
          "Gifts are personal, so we don't guess. You tell us the occasion and your budget, we tell you what is available and the full cost, and nothing is packed until you agree.",
        ],
        order: { label: "Order a gift", href: "#request" },
        whatsappText: `Hi ${site.seoName}, I want to send a gift in ${city}.`,
        offersTitle: "Who it's for",
        offers: [
          { t: "Birthdays", s: "For a child, a parent or a friend. Tell us the age and what they like, and we'll suggest what we have." },
          { t: "Anniversaries", s: "For a couple or a family celebration, delivered on the day you choose." },
          { t: "Special occasions", s: "Housewarmings, new babies, thank-yous and festival visits." },
          { t: "Sending to someone else", s: "Give us their name, address and number. You pay, and they receive it." },
        ],
        stepsTitle: "How to order a gift",
        steps: [
          { t: "Tell us what you need", s: "Fill in the form below, or call or WhatsApp us with the occasion, budget and delivery address." },
          { t: "We confirm the details", s: "We reply with what's available, the total including delivery, and a delivery time." },
          { t: "You approve", s: "Say yes and we pack it. Payment is agreed at this step." },
          { t: "We deliver", s: "A delivery partner brings it to the address you gave us." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [
          coverageLine(c), hoursLine(c),
          "Delivery time depends on the gift being in stock, how long it takes to prepare and how far it's going. We confirm a time before you pay.",
          "If you need wrapping, a message card or a surprise at a set time, tell us when you order and we'll say whether we can do it.",
        ],
        faqs: [
          { q: `Can I send a gift to someone else in ${city}?`, a: "Yes. Give us their name, full address and phone number, and tell us if it's a surprise so we can plan the call before delivery." },
          { q: "Can a gift be delivered today?", a: `Yes, if it's in stock and the address is in our delivery area.${c.hours ? ` We take orders from ${c.hours}.` : ""} Call us if it must arrive today.` },
          { q: `Do you deliver gifts in ${c.target} minutes?`, a: `${c.target} minutes is our target for eligible orders, not a guarantee. It depends on ${targetFactors}. Gifts that need preparing take longer.` },
          { q: "How much does gift delivery cost?", a: "The gift price and delivery charge depend on what you choose and where it's going. We tell you the total before you confirm." },
          { q: "Do you gift wrap?", a: "Ask when you order. We'll tell you if it's possible for that item." },
        ],
        form: { kind: "gift_order", title: "Tell us about your gift", hindi: "गिफ्ट की जानकारी भरें, हम कॉल करके पक्का करेंगे।", submit: "Send gift request" },
        category: { slug: "gifts", label: "Browse gifts" },
        related: ["sweets-delivery-merta-city", "bulk-gifts-sweets-merta-city", "urgent-delivery-merta-city"],
      };
    case "sweets-delivery-merta-city":
      return {
        title: `Sweets Delivery in ${city}: Order Mithai Online`,
        description: `Order sweets online for home delivery in ${city}, Rajasthan. Ask ${site.seoName} what's available today and get the price and delivery time before you confirm.`,
        h1: `Sweets delivery in ${city}`, crumb: "Sweets delivery", serviceType: "Sweets delivery",
        hindi: `${site.cityHindi} में मिठाई का ऑनलाइन ऑर्डर और होम डिलीवरी। आज क्या उपलब्ध है, पूछकर ऑर्डर करें।`,
        intro: [
          `Guests on the way, a good result in the family, or a small festival box to send? Ask ${site.seoName} for sweets delivery in ${city} and skip the trip to the market.`,
          "What we can send changes from day to day, so we confirm the sweets, weight, price and delivery time with you before you pay.",
        ],
        order: { label: "Order sweets", href: "#request" },
        whatsappText: `Hi ${site.seoName}, which sweets can you deliver in ${city} today?`,
        offersTitle: "When people order sweets",
        offers: [
          { t: "Guests and family visits", s: "A box for the table, or to take along when you visit someone." },
          { t: "Festivals", s: "Order ahead for festival days, when demand is highest." },
          { t: "Good news", s: "Results, new jobs and engagements. Tell us where to send it." },
          { t: "Larger quantities", s: "For many boxes, use a bulk quotation so we can prepare in time." },
        ],
        stepsTitle: "How to order sweets",
        steps: [
          { t: "Ask what's available", s: "Tell us what you'd like and how much, using the form below, a call or WhatsApp." },
          { t: "We confirm the order", s: "You get the sweets available, the price, the delivery charge and a delivery time." },
          { t: "You approve", s: "Say yes and we prepare the order. Payment is agreed at this step." },
          { t: "We deliver", s: "A delivery partner brings it to your door." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [
          coverageLine(c), hoursLine(c),
          "Sweets are perishable. Please make sure someone can receive them, and ask us how long they keep.",
          "If anyone has an allergy, ask about ingredients such as nuts and milk before you order.",
          "Festival days are busy, so order early. We confirm a time before you pay.",
        ],
        faqs: [
          { q: `Which sweets can I order in ${city}?`, a: "It varies with what's available that day. Ask us by form, call or WhatsApp and we'll tell you what we can send." },
          { q: "Can I order sweets for today?", a: "Yes, if they're available and your address is in our delivery area. We confirm the time before you pay." },
          { q: `Will sweets arrive in ${c.target} minutes?`, a: `${c.target} minutes is a target for eligible orders, not a guarantee. It depends on ${targetFactors}.` },
          { q: "Can I order for a wedding or an office?", a: "Yes. Larger orders go through a quotation so we can plan preparation and confirm a delivery time." },
          { q: "How do I pay?", a: `${c.pay ? `${c.pay} ` : ""}We confirm the payment method with your order.` },
        ],
        form: { kind: "sweets_order", title: "Tell us what you'd like", hindi: "कौन सी मिठाई और कितनी चाहिए, यहाँ लिखें।", submit: "Send sweets request" },
        category: { slug: "sweets", label: "Browse sweets" },
        related: ["gifts-delivery-merta-city", "bulk-gifts-sweets-merta-city", "urgent-delivery-merta-city"],
      };
    case "bulk-gifts-sweets-merta-city":
      return {
        title: `Bulk Sweets & Gifts Order in ${city}: Get a Quote`,
        description: `Bulk sweets and gift orders in ${city} for weddings, festivals, offices and birthdays. Send your quantity and date to ${site.seoName} for a quotation.`,
        h1: `Bulk gifts and sweets orders in ${city}`, crumb: "Bulk gifts & sweets", serviceType: "Bulk gift and sweets orders",
        hindi: `${site.cityHindi} में शादी, त्योहार, ऑफिस और जन्मदिन के लिए थोक मिठाई और गिफ्ट ऑर्डर। संख्या और तारीख बताइए, हम कोटेशन भेजेंगे।`,
        intro: [
          `A wedding needs a box for every guest. A festival means a gift for every employee. ${site.seoName} handles bulk sweets and gift orders in ${city} by quotation, so you know the price and delivery time before you commit.`,
          `The online cart is limited to ${c.maxQty} of each item, so larger quantities come through this page. Send us the numbers and the date, and we'll work it out with you.`,
        ],
        notice: "Bulk orders need advance preparation. The delivery time is fixed only when we confirm it in your quotation.",
        order: { label: "Request a quotation", href: "#request" },
        whatsappText: `Hi ${site.seoName}, I need a quotation for a bulk order in ${city}.`,
        offersTitle: "Occasions we quote for",
        offers: [
          { t: "Weddings", s: "Sweet boxes and gifts for guests and family functions." },
          { t: "Festivals", s: "Boxes for relatives, customers and staff. Book early, as festival weeks fill up." },
          { t: "Offices and shops", s: "Staff gifts, client gifts and event orders." },
          { t: "Birthdays and functions", s: "Return gifts and sweets for parties and community events." },
        ],
        stepsTitle: "How a bulk order works",
        steps: [
          { t: "Send your requirement", s: "Tell us what you need, roughly how many, your budget per box if you have one, the date and the place." },
          { t: "Get a quotation", s: "We reply with what we can supply, the price, the delivery charge and the payment terms." },
          { t: "Confirm the booking", s: "Your order is booked once you accept the quotation and we confirm the date." },
          { t: "Delivery on the agreed date", s: "We prepare the order and deliver it at the confirmed time." },
        ],
        conditionsTitle: "Booking conditions",
        conditions: [
          "Send your request as early as you can. How much notice we need depends on the quantity and what you choose.",
          "Prices, advance payment and cancellation terms are stated in your quotation.",
          coverageLine(c),
          "If you need delivery to several addresses, list them in your request and we'll include it in the quotation.",
        ],
        faqs: [
          { q: `How do I place a bulk sweets order in ${city}?`, a: "Send the request form on this page, or call or WhatsApp us with the items, quantity, date and delivery place. We reply with a quotation." },
          { q: "How early should I book?", a: "As early as you can, especially for weddings and festival weeks. We confirm whether we can meet your date when we send the quotation." },
          { q: "Is there a minimum quantity?", a: "Tell us the quantity you need and we'll tell you what we can do. Any minimum is stated in the quotation." },
          { q: "Do I have to pay in advance?", a: "Payment terms depend on the order and are stated in your quotation before you confirm." },
          { q: "Can you mix gifts and sweets in one order?", a: "Ask us. List what you'd like in your request and the quotation will show what we can supply." },
        ],
        form: { kind: "bulk_quote", title: "Request a quotation", hindi: "संख्या, तारीख और जगह बताइए, हम कोटेशन भेजेंगे।", submit: "Request quotation" },
        related: ["sweets-delivery-merta-city", "gifts-delivery-merta-city", "delivery-boy-merta-city"],
      };
    case "urgent-delivery-merta-city":
      return {
        title: `Urgent Delivery in ${city}: ${c.target}-Minute Target`,
        description: `Urgent food, sweets, cake and gift delivery in ${city} to homes, hotels and offices, with a ${c.target}-minute target on eligible orders. Timing is never guaranteed.`,
        h1: `Urgent delivery in ${city}`, crumb: "Urgent delivery", serviceType: "Urgent local delivery",
        hindi: `${site.cityHindi} में घर, होटल और ऑफिस पर जल्दी डिलीवरी। योग्य ऑर्डर के लिए ${c.target} मिनट का लक्ष्य है, यह गारंटी नहीं है। हर ऑर्डर का समय पहले बताया जाएगा।`,
        intro: [
          URGENT_HIGHLIGHT,
          `${site.seoName} handles urgent food delivery in ${city}, as well as sweets and gift delivery, and aims to reach eligible orders within ${c.target} minutes. Tell us what you need and where it's going, and we'll give you a realistic estimate before you confirm.`,
        ],
        notice: `${c.target} minutes is a target for eligible orders, not a guarantee. It depends on preparation time, stock, distance and delivery partner availability.`,
        order: { label: "Request fast delivery", href: "#request" },
        whatsappText: `Hi ${site.seoName}, I need something delivered urgently in ${city}. Can you do it now?`,
        extra: {
          title: "Where we deliver",
          items: [
            { t: "Home and office delivery", s: `Home and office delivery in ${city} works the same way: give us the full address, a landmark, and the name and number of whoever receives it.` },
            { t: "Food delivery to hotels", s: `For food delivery to hotels in ${city}, give the hotel name and your room number if you have one. Where the hotel asks for it, we hand over at reception.` },
            { t: "Sending to someone else", s: "Add the receiver's name and number, and a gift message if you'd like one." },
          ],
        },
        offersTitle: "What makes an order eligible",
        offers: [
          { t: "It's in stock and ready", s: "Items that need no preparation are the quickest." },
          { t: "It's close by", s: "Addresses nearer our pickup point are quicker to reach." },
          { t: "A delivery partner is free", s: "At busy times, your order waits for the next free rider." },
          { t: "We're open", s: c.hours ? `Orders are accepted from ${c.hours}.` : "Orders are accepted during our order hours." },
        ],
        stepsTitle: "How to get something quickly",
        steps: [
          { t: "Tell us what and where", s: "Use the form below, call or WhatsApp us. For shop items, order in the cart." },
          { t: "Get an estimate", s: "You see availability, the charge and an estimated arrival time before you confirm." },
          { t: "Confirm", s: "Choose as soon as possible, or a scheduled time." },
          { t: "Receive it", s: "Give the delivery OTP to the rider on shop orders." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [
          coverageLine(c),
          ...(c.express ? [`Express delivery (${c.express.eta}, +${c.express.fee}) is offered in ${c.express.zones}.`] : []),
          "Custom cakes and bulk orders are not part of the target. They get a separately confirmed time.",
          "Hotel deliveries go through reception where the hotel requires it.",
          "We only take items we can handle. If we can't deliver something, we'll tell you before you pay.",
          "Rain, festivals and busy hours can add time.",
        ],
        faqs: [
          { q: `Do you guarantee delivery in ${c.target} minutes?`, a: `No. ${c.target} minutes is our target for eligible orders. It depends on preparation time, stock, distance and delivery partner availability.` },
          { q: "Is urgent delivery available all day and night?", a: c.hours ? `No. Orders are accepted from ${c.hours}.` : "No. Please call us to check today's timings." },
          { q: "Can you deliver to my hotel room?", a: "Give us the hotel name and room number. Some hotels ask us to hand over at reception, and we follow their rules." },
          { q: "Which orders are eligible for the target?", a: "Orders of available items that need little or no preparation, going to an address in our delivery area, when a delivery partner is free." },
          { q: "How do I know how long my order will take?", a: "You get an estimate before you confirm. For anything time-critical, call us first." },
          { q: "Can you collect something from a shop or a house urgently?", a: "Yes, if a rider is free. Send a pickup and drop request and mark it as soon as possible." },
        ],
        form: { kind: "delivery_order", title: "Request fast delivery", hindi: "क्या और कहाँ चाहिए, यहाँ भरें। समय और शुल्क हम पहले बताएंगे।", submit: "Request fast delivery" },
        shopLinks: [{ href: "/c/grocery", label: "Grocery & kirana" }, { href: "/c/sweets", label: "Sweets" }, { href: "/c/sweets", label: "Cakes & bakery" }, ...directoryLinks],
        related: ["delivery-boy-merta-city", "food-delivery-merta-city", "cake-delivery-merta-city", "hotel-delivery-merta-city"],
      };
    case "food-delivery-merta-city":
      return {
        title: `Food Delivery in ${city}: Meals Brought to You`,
        description: `Food delivery in ${city}, Rajasthan, to homes, hotels and offices. Tell ${site.seoName} what you'd like and we confirm availability, price and time first.`,
        h1: `Food delivery in ${city}`, crumb: "Food delivery", serviceType: "Food delivery",
        hindi: `${site.cityHindi} में खाने की डिलीवरी। क्या खाना है बताइए, उपलब्धता, कीमत और समय हम पहले बताएंगे।`,
        intro: [
          `Too tired to cook, or staying in town for work? Tell ${site.seoName} what you feel like eating and where you are, and we'll check what we can bring you in ${city}.`,
          "Restaurants that list with us show their own menus and prices. For everything else, we confirm the food, the price and a delivery estimate before you pay.",
        ],
        order: { label: "Order food", href: "#request" },
        whatsappText: `Hi ${site.seoName}, can you deliver food in ${city} now?`,
        offersTitle: "When people order",
        offers: [
          { t: "Lunch at work", s: "A meal to your office, so you don't lose your break." },
          { t: "Dinner at home", s: "For evenings when nobody wants to cook." },
          { t: "Staying at a hotel", s: "A meal to your room or the reception." },
          { t: "Family visiting", s: "Extra food when guests turn up." },
        ],
        stepsTitle: "How to order food",
        steps: [
          { t: "Tell us what you'd like", s: "Use the form, or call or WhatsApp us. You can also browse restaurants listed on the site." },
          { t: "We check and confirm", s: "We tell you what's available, the total and an estimated arrival time." },
          { t: "You approve", s: "Nothing is ordered until you say yes." },
          { t: "We deliver", s: "A delivery partner brings it to your door, room or desk." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [coverageLine(c), hoursLine(c), "Cooking time adds to the delivery time, so food usually takes longer than ready items.", "If anyone has an allergy, ask about ingredients before you order."],
        faqs: [
          { q: `Which food can I order in ${city}?`, a: "It depends on what's available at that time. Tell us what you'd like and we'll confirm." },
          { q: `Can food arrive in ${c.target} minutes?`, a: `Only if the order is eligible. ${c.target} minutes is a target that depends on preparation time, stock, distance and delivery partner availability.` },
          { q: "Can you deliver to my hotel?", a: "Yes, if it's in our delivery area. Give us the hotel name and your room number." },
          { q: "How much is the delivery charge?", a: "We tell you the total, including delivery, before you confirm." },
        ],
        form: { kind: "food_order", title: "Tell us what you'd like", hindi: "क्या खाना चाहिए और कहाँ, यहाँ लिखें।", submit: "Send food request" },
        category: { slug: "food", label: "Browse food" },
        shopLinks: directoryLinks.slice(0, 1),
        related: ["fast-food-delivery-merta-city", "urgent-delivery-merta-city", "hotel-delivery-merta-city"],
      };
    case "fast-food-delivery-merta-city":
      return {
        title: `Fast Food Delivery in ${city}: Snacks and Quick Bites`,
        description: `Fast food delivery in ${city}: snacks and quick bites to your home, hotel or office. Check with ${site.seoName} what's available and how soon it can reach you.`,
        h1: `Fast food delivery in ${city}`, crumb: "Fast food delivery", serviceType: "Fast food delivery",
        hindi: `${site.cityHindi} में फास्ट फूड और नाश्ते की डिलीवरी। पहले पूछें क्या उपलब्ध है और कितनी देर लगेगी।`,
        intro: [
          `Craving something quick? Whether it's an evening snack at home or a bite between meetings, ask ${site.seoName} what we can bring you in ${city} right now.`,
          "Fast food tastes best hot, so we'd rather tell you honestly how long it will take than promise a time we can't keep.",
        ],
        order: { label: "Order fast food", href: "#request" },
        whatsappText: `Hi ${site.seoName}, can you deliver fast food in ${city} now?`,
        offersTitle: "Good for",
        offers: [
          { t: "Evening snacks", s: "Something small for the family at tea time." },
          { t: "Office breaks", s: "A round of snacks for the team." },
          { t: "Late cravings", s: c.hours ? `Before we close. We take orders from ${c.hours}.` : "During our order hours." },
          { t: "Kids' parties", s: "For a larger order, ask us early so we can plan." },
        ],
        stepsTitle: "How to order",
        steps: [
          { t: "Say what you want", s: "Tell us the items and how many." },
          { t: "We check", s: "We confirm what's available, the total and an estimate." },
          { t: "You say yes", s: "We place it with the kitchen." },
          { t: "It's on the way", s: "A delivery partner brings it to you." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [coverageLine(c), hoursLine(c), "Items are made to order, so preparation time adds to delivery time.", "Availability changes through the day."],
        faqs: [
          { q: "What fast food can I order?", a: "It changes with what's available. Ask us and we'll tell you." },
          { q: "Will it still be hot?", a: "We keep the trip as short as we can, but we can't promise a temperature. Distance and traffic matter." },
          { q: "Is there a minimum order?", a: "We confirm any minimum, along with the total, before you order." },
          { q: `Do you guarantee ${c.target} minutes?`, a: `No. It's a target for eligible orders. Food that's made to order takes longer.` },
        ],
        form: { kind: "food_order", title: "What are you craving?", hindi: "क्या चाहिए और कहाँ भेजना है, यहाँ लिखें।", submit: "Send request" },
        category: { slug: "fast-food", label: "Browse fast food" },
        shopLinks: directoryLinks.slice(0, 1),
        related: ["food-delivery-merta-city", "urgent-delivery-merta-city", "office-delivery-merta-city"],
      };
    case "cake-delivery-merta-city":
      return {
        title: `Cake Delivery in ${city}: Birthday & Custom Cakes`,
        description: `Cake delivery in ${city} for birthdays and anniversaries. Ask ${site.seoName} about ready cakes; custom cakes need a separately confirmed time.`,
        h1: `Cake delivery in ${city}`, crumb: "Cake delivery", serviceType: "Cake delivery",
        hindi: `${site.cityHindi} में केक की डिलीवरी। कस्टम केक का समय अलग से पक्का किया जाता है, इसलिए पहले से बताएं।`,
        intro: [
          `A birthday at midnight is hard to plan, but a birthday this evening isn't. Tell ${site.seoName} the occasion, size and flavour, and we'll check what we can get to you in ${city}.`,
          "Ready cakes can sometimes go out the same day. Custom cakes are made for you, so they get their own confirmed time.",
        ],
        notice: `Custom cakes are not part of the ${c.target}-minute target. Their delivery time is confirmed separately.`,
        order: { label: "Order a cake", href: "#request" },
        whatsappText: `Hi ${site.seoName}, I want a cake delivered in ${city}.`,
        offersTitle: "What to tell us",
        offers: [
          { t: "Occasion and date", s: "When it's needed, and if it's a surprise." },
          { t: "Size and flavour", s: "Weight, flavour, and whether it must be eggless." },
          { t: "Message on the cake", s: "The exact spelling of any name." },
          { t: "Where it's going", s: "Home, hotel or office, and who receives it." },
        ],
        stepsTitle: "How to order a cake",
        steps: [
          { t: "Send your request", s: "Use the form, or call or WhatsApp us." },
          { t: "We check with the bakery", s: "We confirm what can be made, the price and the time." },
          { t: "You approve", s: "Payment is agreed at this step." },
          { t: "Delivery", s: "A delivery partner carries it to the address you gave." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [coverageLine(c), hoursLine(c), "Custom cakes need notice. We tell you how much when you ask.", "Cakes are delicate. Please make sure someone can receive it."],
        faqs: [
          { q: "Can I get a cake today?", a: "Possibly, if a ready cake is available. Ask us and we'll confirm." },
          { q: "Do you have eggless cakes?", a: "Tell us you need eggless and we'll confirm if it's possible for that order." },
          { q: "How early should I order a custom cake?", a: "As early as you can. We confirm the time when you order." },
          { q: "Can you deliver a surprise cake to someone else?", a: "Yes, if it's in our delivery area. Add the receiver's name, number and a gift message." },
        ],
        form: { kind: "cake_order", title: "Tell us about your cake", hindi: "मौका, वज़न, फ्लेवर और तारीख बताइए।", submit: "Send cake request" },
        category: { slug: "cakes", label: "Browse cakes" },
        shopLinks: directoryLinks.slice(1, 2),
        related: ["gifts-delivery-merta-city", "sweets-delivery-merta-city", "bulk-gifts-sweets-merta-city"],
      };
    case "home-delivery-merta-city":
      return {
        title: `Home Delivery in ${city}: Essentials to Your Door`,
        description: `Home delivery in ${city}: groceries from the shop, plus food, sweets, cakes and gifts on request. See your estimate and charge before you confirm.`,
        h1: `Home delivery in ${city}`, crumb: "Home delivery", serviceType: "Home delivery",
        hindi: `${site.cityHindi} में घर पर डिलीवरी। ऑर्डर से पहले अनुमानित समय और शुल्क देखें।`,
        intro: [
          `Most ${site.seoName} orders go to homes. Add groceries, sweets, cakes and dry fruits to your cart, or ask us for food, sweets, cakes and gifts, and a delivery partner brings them to your door.`,
          "You can also send something to parents, relatives or a friend in town. Just put their name and number on the address.",
        ],
        order: { label: "Start shopping", href: "/categories" },
        whatsappText: `Hi ${site.seoName}, I need something delivered to my home in ${city}.`,
        offersTitle: "What helps us find you",
        offers: [
          { t: "A map pin", s: "Drop the pin at your door when you add an address." },
          { t: "A landmark", s: "A temple, bank or shop near you." },
          { t: "The right number", s: "The person who will answer when the rider calls." },
          { t: "Delivery notes", s: "For example, which gate to use." },
        ],
        stepsTitle: "How home delivery works",
        steps: [
          { t: "Add your address", s: "With house details, a landmark and a map pin." },
          { t: "See the estimate", s: "The charge and estimated arrival are shown before you confirm." },
          { t: "Choose a time", s: "As soon as possible, or a scheduled slot." },
          { t: "Receive it", s: "Give the delivery OTP to the rider." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [coverageLine(c), hoursLine(c), "Addresses outside our delivery area can't be saved at checkout."],
        faqs: [
          { q: "How long does home delivery take?", a: `Our target for eligible orders is ${c.target} minutes, and the estimate for your address is shown before you confirm.` },
          { q: "Can I order for my parents' home?", a: "Yes. Add their address, name and phone number." },
          { q: "What is the delivery OTP?", a: "A code shown on your order page. Share it with the rider when the order arrives." },
          { q: "How do I pay?", a: c.pay || "Payment options are shown at checkout." },
        ],
        form: { kind: "delivery_order", title: "Need something the shop doesn't list?", hindi: "जो दुकान में नहीं दिखता, उसके लिए यहाँ लिखें।", submit: "Send request", destination: "home" },
        shopLinks: [{ href: "/c/grocery", label: "Grocery & kirana" }, { href: "/c/sweets", label: "Sweets" }, { href: "/c/sweets", label: "Cakes & bakery" }],
        related: ["urgent-delivery-merta-city", "office-delivery-merta-city", "hotel-delivery-merta-city"],
      };
    case "hotel-delivery-merta-city":
      return {
        title: `Food Delivery to Hotels in ${city}: Room or Reception`,
        description: `Staying in ${city}? ${site.seoName} delivers food, sweets and gifts to hotels. Give your hotel name and room number; we follow the hotel's reception rules.`,
        h1: `Delivery to hotels in ${city}`, crumb: "Hotel delivery", serviceType: "Hotel delivery",
        hindi: `${site.cityHindi} के होटल में ठहरे हैं? होटल का नाम और कमरा नंबर बताइए। ज़रूरत होने पर डिलीवरी रिसेप्शन पर होगी।`,
        intro: [
          `Visiting ${city} for work, a wedding or a temple visit? If you need food, sweets, a gift or something you forgot to pack, ${site.seoName} can bring it to your hotel.`,
          "Tell us the hotel name and your room number. Some hotels don't allow riders upstairs, so we hand over at reception where they ask us to.",
        ],
        order: { label: "Request hotel delivery", href: "#request" },
        whatsappText: `Hi ${site.seoName}, I'm staying at a hotel in ${city} and need a delivery.`,
        offersTitle: "What guests ask for",
        offers: [
          { t: "A meal to the room", s: "When you arrive late or don't want to go out." },
          { t: "Things you forgot", s: "Daily items and fruit from the shop." },
          { t: "Sweets to take home", s: "A box before you leave town." },
          { t: "A surprise for a guest", s: "Send a gift or cake to someone staying at a hotel." },
        ],
        stepsTitle: "How hotel delivery works",
        steps: [
          { t: "Give the hotel details", s: "Hotel name, room number if you have one, and your mobile number." },
          { t: "We confirm", s: "You get the charge and an estimated arrival time." },
          { t: "Delivery to the hotel", s: "The rider comes to the hotel and calls you." },
          { t: "Handover", s: "At your room or at reception, as the hotel requires." },
        ],
        conditionsTitle: "Hotel delivery conditions",
        conditions: [coverageLine(c), hoursLine(c), "We follow each hotel's rules for visitors, so we may hand over at reception.", "Please keep your phone with you so the rider can reach you."],
        faqs: [
          { q: `Do you deliver food to hotels in ${city}?`, a: "Yes, if the hotel is in our delivery area and we can get what you've asked for." },
          { q: "Do I need a room number?", a: "It's optional but helpful. Without it, we'll hand over at reception." },
          { q: "Can I order for a guest at a hotel?", a: "Yes. Add the guest's name and number, and a gift message if you'd like." },
          { q: "How long will it take?", a: "You get an estimate before you confirm. It depends on preparation time, stock, distance and delivery partner availability." },
        ],
        form: { kind: "delivery_order", title: "Request delivery to your hotel", hindi: "होटल का नाम, कमरा नंबर और ज़रूरत लिखें।", submit: "Request delivery", destination: "hotel" },
        shopLinks: directoryLinks,
        related: ["food-delivery-merta-city", "urgent-delivery-merta-city", "delivery-boy-merta-city"],
      };
    case "office-delivery-merta-city":
      return {
        title: `Office Delivery in ${city}: Food, Sweets & Supplies`,
        description: `Office delivery in ${city}: lunch, snacks, sweets and gifts to your company. Add your floor or reception instructions, and ${site.seoName} confirms the time first.`,
        h1: `Office delivery in ${city}`, crumb: "Office delivery", serviceType: "Office delivery",
        hindi: `${site.cityHindi} में ऑफिस पर डिलीवरी। कंपनी का नाम और फ्लोर या रिसेप्शन की जानकारी दें।`,
        intro: [
          `Shops, banks, clinics and offices in ${city} can't always step out. ${site.seoName} brings lunch, tea-time snacks, sweets and small gifts to your front desk.`,
          "Give us the company name and your floor or reception instructions, so the rider isn't left walking the corridors.",
        ],
        order: { label: "Request office delivery", href: "#request" },
        whatsappText: `Hi ${site.seoName}, I need a delivery to my office in ${city}.`,
        offersTitle: "What offices order",
        offers: [
          { t: "Lunch and snacks", s: "For one person or the whole team." },
          { t: "Sweets for good news", s: "A box for a new client, a birthday or a festival." },
          { t: "Staff and client gifts", s: "For larger quantities, ask for a bulk quotation." },
          { t: "Documents and parcels", s: "Use a pickup and drop request to send something across town." },
        ],
        stepsTitle: "How office delivery works",
        steps: [
          { t: "Give the office details", s: "Company name, floor or reception instructions, and a contact number." },
          { t: "We confirm", s: "You get the charge and an estimated arrival time." },
          { t: "Choose the time", s: "As soon as possible, or scheduled for a break." },
          { t: "Handover", s: "To the person named, or at reception." },
        ],
        conditionsTitle: "Delivery conditions",
        conditions: [coverageLine(c), hoursLine(c), "Bulk office orders need advance preparation and a confirmed time."],
        faqs: [
          { q: `Do you deliver to offices in ${city}?`, a: "Yes, if the office is in our delivery area." },
          { q: "Can you deliver at a set time?", a: "Yes, choose a scheduled time and we'll confirm whether we can meet it." },
          { q: "Can I order for the whole office?", a: "Yes. Larger orders go through a quotation so we can plan." },
          { q: "Can the rider leave it at reception?", a: "Yes. Tick hand over at reception, or add it to your instructions." },
        ],
        form: { kind: "delivery_order", title: "Request delivery to your office", hindi: "कंपनी का नाम, फ्लोर और ज़रूरत लिखें।", submit: "Request delivery", destination: "office" },
        related: ["bulk-gifts-sweets-merta-city", "food-delivery-merta-city", "delivery-boy-merta-city"],
      };
    case "delivery-boy-merta-city":
      return {
        title: `Delivery Boy in ${city}: Local Pickup & Drop Requests`,
        description: `Need a delivery boy in ${city}? Send your pickup and drop details to ${site.seoName}. We check rider availability and confirm the charge before booking.`,
        h1: `Delivery boy in ${city} for pickup and drop`, crumb: "Delivery boy", serviceType: "Local pickup and drop",
        hindi: `${site.cityHindi} में डिलीवरी बॉय चाहिए? पिकअप और ड्रॉप की जानकारी भरें। उपलब्धता और शुल्क हम बुकिंग से पहले बताएंगे।`,
        intro: [
          `Left the keys at home? Need a tiffin, documents or a parcel moved across town? Send ${site.seoName} your pickup and drop details and we'll check whether a delivery partner in ${city} can take it.`,
        ],
        order: { label: "Request a pickup", href: "#request" },
        whatsappText: `Hi ${site.seoName}, is a delivery boy available in ${city} for a pickup and drop?`,
        offersTitle: "What people send",
        offers: [
          { t: "Documents and keys", s: "Papers, files or keys between a home, office or shop." },
          { t: "Tiffin and food", s: "A packed meal from home to work or school." },
          { t: "Small parcels", s: "Anything that fits safely on a two-wheeler." },
          { t: "Shop pickups", s: "Something already paid for and waiting at a local shop." },
        ],
        stepsTitle: "How pickup and drop works",
        steps: [
          { t: "Send your details", s: "Fill in the pickup, drop, item and time below, or call or WhatsApp us." },
          { t: "We check availability", s: "We see whether a delivery partner is free for your time." },
          { t: "We confirm the charge", s: "You get the charge before booking. No rider is sent until you agree." },
          { t: "Pickup and drop", s: "The delivery partner collects the item and delivers it." },
        ],
        conditionsTitle: "Conditions",
        conditions: [
          `Pickup and drop should both be in our delivery area. ${coverageLine(c)}`,
          hoursLine(c),
          "The item must fit safely on a two-wheeler. Tell us before booking if it's fragile or valuable.",
          "We can refuse anything illegal, dangerous or unsafe to carry.",
        ],
        faqs: [
          { q: `Is a delivery boy available in ${city} right now?`, a: "This page doesn't show live rider status. Send a request, or call or WhatsApp us, and we'll tell you whether someone is free." },
          { q: "How much does pickup and drop cost?", a: `${c.pickupFrom ? `Charges start ${c.pickupFrom}. ` : ""}The charge depends on distance, the item and how soon you need it. We confirm it before booking.` },
          { q: "Is my pickup booked when I send the form?", a: "No. It's a request. Your booking is made only when we've confirmed a rider and you've agreed to the charge." },
          { q: "What can't be sent?", a: "Anything illegal, dangerous, or too big or heavy for a two-wheeler. If you're not sure, ask us first." },
          { q: "I want to work as a delivery partner. Where do I apply?", a: `That's a different page. See Deliver with ${site.name}, linked below.` },
        ],
        form: { kind: "pickup_drop", title: "Check availability and request a pickup", hindi: "पिकअप और ड्रॉप की जानकारी भरें। यह बुकिंग नहीं है, हम पहले पुष्टि करेंगे।", submit: "Check availability" },
        related: ["urgent-delivery-merta-city", "gifts-delivery-merta-city", "bulk-gifts-sweets-merta-city"],
      };
  }
}
