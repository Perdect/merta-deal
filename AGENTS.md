# Merta Deal — engineering conventions

Hyperlocal kirana marketplace for Merta City, Rajasthan. Brand: **Merta Deal** ("Merta Ki Shopping, Ab Online."). Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 + Supabase (Postgres/Auth/Storage/Realtime) + Razorpay + Google Maps + web-push. Package manager: pnpm.

## Non-negotiables
- **Never fake anything.** No mock GPS movement, no fake payments, no placeholder analytics. If an integration needs credentials, the UI must say so plainly (see `integrationStatus()` in `src/lib/env.ts` and `/setup`).
- **Business rules live in the DB `settings` table**, never hardcoded (fees, thresholds, commission, ETAs). Read via `get_setting_num()` in SQL or `getPublicSettings()`/direct select in TS.
- **All order/cart/delivery mutations go through SECURITY DEFINER Postgres functions** (`supabase/migrations/0002_functions.sql`, `0004`, `0006`, `0007`). Call them with `supabase.rpc("fn", {...})`. Never update `orders`, `payments`, `delivery_assignments` rows directly from app code (RLS blocks it anyway).
- Direct table writes are fine for own-row tables: `addresses`, `wishlists`, `push_subscriptions`, `support_tickets/messages`, `profiles` (own), and for store members on `inventory`/`products` (created by that store) and admins on catalog/settings tables.
- Stores can never mark an order delivered; only `verify_delivery_otp` (rider) does that.
- Surface Postgres errors with `friendlyError(err)` from `src/lib/utils.ts`.

## Where things are
- `src/lib/supabase/{server,client,admin}.ts` — `createClient()` (server, cookie-bound) / browser singleton / service-role (only for webhooks & push; may return null when unconfigured).
- `getSessionUser()` (server) returns `{ id, email, role, fullName, phone, avatarUrl }`.
- `src/proxy.ts` — session refresh + role-gated routes (`/admin`, `/store`, `/rider`, `/account`, `/orders`, `/checkout`).
- `src/types/database.ts` — generated (`pnpm gen:types`, needs local Postgres). `src/types/app.ts` — hand-typed JSON shapes returned by RPCs (`CartSummary`, `OrderTracking`, `RiderAssignment`, `StoreStats`, `AdminStats`, …).
- `src/components/ui/*` — the design system: `Button, IconButton, Input, Textarea, Select, Switch, Checkbox, Badge, DiscountBadge, VegMark, Card, CardHeader, CardBody, SectionHeader, Stat, Spinner, Skeleton, LoadingState, ProductGridSkeleton, EmptyState, ErrorState, Alert, Modal, Drawer, BottomSheet, ConfirmDialog, Toaster/toast, Tabs, Chip, Avatar, StarRating, StarPicker, Price, QuantityStepper, Logo, LogoMark, Pagination, KeyValue, PageHeader, Table`. Import from `@/components/ui`. **Do not create duplicates.**
- `src/components/shared/*` — `DynamicIcon` (lucide by name), `DashboardShell` (sidebar/topbar/mobile tabs for store & admin), `ImageUpload`, `QrPoster`.
- `src/components/shop/*` — customer components (`ProductCard`, `ProductImage`, `AddToCart`, `OrderTimeline`, `OrderStatusBadge`, `LiveMap`, …).
- `src/hooks/*` — `useDebouncedValue`, `useOrderRealtime`, `useNotifications`.
- Order status metadata: `src/lib/order-status.ts`. Hinglish parser: `src/lib/order-parser.ts`.
- Storage buckets: `product-images`, `store-photos`, `avatars`, `banners` (public), `store-documents` (private). Paths must start with `<storeId>/` or `<userId>/` for RLS.

## Style
- Mobile-first, 16px side gutters (`px-4 sm:px-0` inside `max-w-6xl` containers), rounded cards (`rounded-lg border border-line bg-card shadow-card`), restrained animations (`animate-slide-up`, `animate-pop`).
- Tokens: `brand-*` (green), `saffron-*` (accent), `ink/ink-2/ink-3/ink-4`, `surface/surface-2/card/line/line-2`, `success/warning/danger/info` (+ `-50` tints). Fonts: `font-sans` (Inter), `font-display` (Plus Jakarta Sans) for headings.
- Money via `formatINR()`, dates via `formatDate/formatDateTime/timeAgo`. Indian context: ₹, IST, 10-digit mobiles, 6-digit pincodes.
- Server Components fetch; Client Components (`"use client"`) handle interaction and call server actions in `src/lib/actions/*` (return `{ ok, data } | { ok, error }`), or `createClient()` RPCs for high-frequency calls (GPS, typeahead).
- Next 16: `params`/`searchParams` are Promises; `proxy.ts` not middleware; `useActionState` for forms.
- Realtime: tables `orders, order_status_history, delivery_assignments, delivery_locations, notifications, delivery_partners, inventory` are in the `supabase_realtime` publication (RLS applies).

## Verify
- `pnpm exec tsc --noEmit` must pass. `pnpm build` must pass. `pnpm lint` for warnings.
- DB: `./scripts/db-local-reset.sh` then `psql -h /tmp -d merta_deal -f scripts/test-lifecycle.sql` (67 checks).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
