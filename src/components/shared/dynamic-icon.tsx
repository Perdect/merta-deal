import { Wheat, Flame, Milk, Cookie, CupSoda, Sparkles, SprayCan, LeafyGreen, Baby, Heart, CookingPot, MapPin, Grip, CircleDot, Bean, Candy, Droplet, Leaf, Sprout, Circle, Square, Triangle, Nut, Coffee, GlassWater, Bath, Smile, Scissors, Shirt, Carrot, Apple, Utensils, Package, ShoppingBasket, type LucideIcon, Home, LayoutGrid, ShoppingCart, User, Bike, Wallet, LayoutDashboard, Box, Layers, Users, CreditCard, Store, Settings, Tag, Map, Ticket, Megaphone, Banknote, BarChart3, Bell, LifeBuoy, Star, ScrollText, Receipt, PackageCheck, Navigation, CheckCircle2, BadgeCheck, XCircle } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  wheat: Wheat, flame: Flame, milk: Milk, cookie: Cookie, "cup-soda": CupSoda, sparkles: Sparkles, "spray-can": SprayCan, "leafy-green": LeafyGreen, baby: Baby, heart: Heart, "cooking-pot": CookingPot, "map-pin": MapPin,
  grip: Grip, "circle-dot": CircleDot, bean: Bean, candy: Candy, shaker: Droplet, droplet: Droplet, leaf: Leaf, sprout: Sprout, circle: Circle, square: Square, triangle: Triangle, nut: Nut, coffee: Coffee, "glass-water": GlassWater,
  bath: Bath, smile: Smile, scissors: Scissors, shirt: Shirt, carrot: Carrot, apple: Apple, utensils: Utensils, package: Package, basket: ShoppingBasket,
  home: Home, grid: LayoutGrid, cart: ShoppingCart, user: User, bike: Bike, wallet: Wallet, layout: LayoutDashboard, box: Box, layers: Layers, users: Users, "credit-card": CreditCard, store: Store, settings: Settings, tag: Tag, map: Map, ticket: Ticket, megaphone: Megaphone, banknote: Banknote, "bar-chart": BarChart3, bell: Bell, "life-buoy": LifeBuoy, star: Star, scroll: ScrollText,
  receipt: Receipt, "package-check": PackageCheck, navigation: Navigation, "check-circle": CheckCircle2, "badge-check": BadgeCheck, "x-circle": XCircle,
};

export function DynamicIcon({ name, className, size }: { name: string | null | undefined; className?: string; size?: number }) {
  const Icon = (name && icons[name]) || ShoppingBasket;
  return <Icon className={className} size={size} aria-hidden />;
}
