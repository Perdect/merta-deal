import type { CategoryGroup } from "@/lib/data/store";

/**
 * "Parent › Child" options for category selects. A top-level leaf shows just its name. `current` keeps a
 * product's own category selectable even when admins have switched that category off (it would otherwise
 * render as "Choose a category" and look unset).
 */
export function categoryOptions(groups: CategoryGroup[], current?: { id: string; name: string } | null) {
  const opts = groups.flatMap((g) => g.children.map((c) => ({ value: c.id, label: c.id === g.parent.id ? g.parent.name : `${g.parent.name} › ${c.name}` })));
  if (current && !opts.some((o) => o.value === current.id)) opts.unshift({ value: current.id, label: `${current.name} (hidden category)` });
  return opts;
}
