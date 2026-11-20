# Admin kit

Reusable design system for `/admin`. Import everything from `@/components/admin/kit`.
Reference implementations: `src/app/admin/page.tsx` (dashboard), `src/app/admin/orders/page.tsx`
(list + tabs + filters + quick view), `src/app/admin/orders/[id]/page.tsx` (detail).

## Look
Set once in `.theme-admin` (globals.css), so pages never carry their own colours: cool slate canvas and
lines, tighter corners (`rounded-md` 8px controls, `rounded-xl` 12px cards — the `card` class string),
short crisp shadows, the portal's blue accent (`brand-*`), lucide outline icons at `h-4 w-4` /
`strokeWidth 1.9`. Tables have small-caps headers; the selected row carries an accent bar. Panels and
form sections have a header divided from the body by a hairline. Status = coloured dot + words
(`StatusPill`, `OrderStatusPill`, `PaymentStatusPill`, `StatusText`), never colour alone; use the
`text-warning` / `text-success` / `text-danger` tokens, not hex values.

## Motion
150–250 ms, always `motion-safe:` / `motion-reduce:`: a section settles in when opened from the sidebar
(`(panel)/template.tsx`, `animate-page-in`), sidebar groups open by height, menus use `animate-menu-in`,
side panels slide in over a dimmed page, metric cards lift on hover. Nothing loops.

## Navigation
`nav.ts` holds the sidebar: `ADMIN_NAV_DAILY` (always visible: Dashboard, Orders, Scan & pack, Service requests, Riders,
Payments, with live badges from `getLiveCounts`), `ADMIN_NAV` (collapsible groups: Catalogue, Marketing, Finance, Delivery
setup, Customer care; the active group is always open, others remember their state per browser), `ADMIN_NAV_FOOTER`
(Settings, Audit logs) and `ADMIN_NAV_MOBILE` (phone bottom bar). A new route goes in exactly one of these.

## Page skeleton
```tsx
<>
  <AdminPageHeader title="Products" description="…" back="/admin/products" actions={<…/>} />  // the ONLY h1
  <StatusTabs items={[{ value: "", label: "All", count }, …]} />     // optional, param "status" by default
  <ListToolbar searchPlaceholder="…" filters={[…]} dateRange />    // search + Filters panel + chips
  <DataTable rows={items} rowKey={(r) => r.id} columns={[…]} empty={<EmptyBlock … />} />
  <ListPagination page={page} pageSize={pageSize} total={total} />
  {viewId ? <QuickView title=… fullHref=…>…</QuickView> : null}   // server-rendered side panel via ?view=
</>
```
Never render `PageHeader`, `Stat`, `Table` from `@/components/ui` or `ListToolbar` from
`@/components/admin/list-controls` in admin pages any more.

## Pieces
- Server-safe (`ui.tsx`): `AdminPageHeader`, `Panel` (card section; `flush` for tables/lists),
  `MetricCard` (always pass `period`; pass `change` only when a previous period exists),
  `DataTable` (sticky header; `hideBelow` on non-essential columns), `CellStack`, `RowLink`,
  `DetailList`, `FormSection`, `ActionRow`, `EmptyBlock`, `ErrorBlock` (with Retry), `StatusPill`,
  `toneOf(oldBadgeTone)`, `rupees()` (2 decimals, transactions) and `rupeesRounded()` (aggregates).
- Client (`client.tsx`): `ListToolbar`, `StatusTabs`, `ListPagination`, `QuickView` (URL param),
  `SidePanel` (controlled; quick-edit forms), `useUnsavedChanges(dirty)` (returns `confirmDiscard()`),
  `FormActions` (sticky Save / Cancel bar with "Unsaved changes" state), `IconAction` (icon-only with
  tooltip + aria-label), `RangePicker`, `BackLink`, `useQueryState`.
- Charts (`charts.tsx`): `TrendChart`, `BreakdownBar` — SVG, no libraries.

## Rules
- Server pagination/filtering only (`range()`), filters in the URL, debounced search (toolbar does it).
- Keep list position: detail pages use `AdminPageHeader back="/admin/<list>"` (BackLink returns via history).
- Consequential actions (cancel, refund, delete, suspend, payout status) need a confirm dialog
  (`ConfirmDialog` from `@/components/ui/overlay` or a `Modal` with explicit confirm).
- Show saving state, success toast (`toast` from `@/components/ui/toast`), actionable errors
  (`friendlyError` already applied by actions). Forms: `useUnsavedChanges(dirty)` + `FormActions`.
- Empty states say what to do next; failed loads use `ErrorBlock` with a Retry link.
- No mock data, no sample numbers. Don't change business rules, RLS, or actions' behaviour.
