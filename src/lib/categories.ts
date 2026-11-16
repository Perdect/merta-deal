/**
 * Category pickers, built from the same tree the shop renders.
 *
 * The admin lists used to be flat: `categories` comes back ordered by sort_order alone, so a
 * sub-category's number (Dal is 4 under Grocery & Kitchen) interleaved it with other parents'
 * children and with the top-level lines themselves. On screen that reads as a jumble, and the
 * switched-off shelves kept from 0054 (Dairy, Household, Baby Care …) sat among the live ones with
 * nothing to tell them apart.
 *
 * So every picker groups by top-level line, in the shop's own order, with the switched-off shelves
 * collected at the end — still selectable, because a product may already be filed in one and the
 * select must be able to show it.
 */

import type { GroupedOptions, Option, OptionGroup } from "@/lib/utils";

export type CategoryLike = { id: string; name: string; parent_id?: string | null; sort_order?: number | null; is_active?: boolean };

const byOrder = (a: CategoryLike, b: CategoryLike) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
const live = (c: CategoryLike) => c.is_active !== false;

/**
 * Category options grouped under their top-level line.
 *
 * @param topLabel what the top-level line itself reads as inside its own group. Filters match the
 *   whole branch, so they say "incl. subcategories"; the product form files into that line alone.
 */
export function categoryOptions(categories: CategoryLike[], { topLabel = (name: string) => name }: { topLabel?: (name: string) => string } = {}): GroupedOptions {
  const tops = categories.filter((c) => !c.parent_id).sort(byOrder);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id).sort(byOrder);

  const groups: OptionGroup[] = [];
  const off: Option[] = [];

  for (const top of tops) {
    const kids = childrenOf(top.id);
    if (!live(top)) {
      // A switched-off line takes its whole branch with it: the shop shows none of it.
      off.push({ value: top.id, label: top.name }, ...kids.map((c) => ({ value: c.id, label: `${top.name} › ${c.name}` })));
      continue;
    }
    groups.push({ label: top.name, options: [{ value: top.id, label: topLabel(top.name) }, ...kids.filter(live).map((c) => ({ value: c.id, label: c.name }))] });
    off.push(...kids.filter((c) => !live(c)).map((c) => ({ value: c.id, label: `${top.name} › ${c.name}` })));
  }

  // A sub-category whose parent row is missing would otherwise disappear from every picker.
  const orphans = categories.filter((c) => c.parent_id && !categories.some((p) => p.id === c.parent_id)).sort(byOrder);
  if (orphans.length) groups.push({ label: "Not filed under a category", options: orphans.map((c) => ({ value: c.id, label: c.name })) });

  const result: GroupedOptions = [...groups];
  if (off.length) result.push({ label: "Switched off — hidden from customers", options: off });
  return result;
}

/** True when this category, or the line above it, is switched off, so nothing filed here is on sale. */
export function isCategoryHidden(categories: CategoryLike[], id: string | null | undefined): boolean {
  const c = categories.find((x) => x.id === id);
  if (!c) return false;
  if (!live(c)) return true;
  const parent = c.parent_id ? categories.find((x) => x.id === c.parent_id) : null;
  return Boolean(parent && !live(parent));
}
