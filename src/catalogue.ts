import type { Product } from "./model";

export type Category = { key: string; label: string };

// Categories come from the visible products themselves: a new category in the sheet appears
// without a code change, and one with no visible products disappears. Spelling variants that
// differ only by case or spacing are one category (the first spelling seen is the label);
// different wording is never merged.
export function deriveCategories(products: Product[]): Category[] {
  const seen = new Map<string, Category>();
  for (const p of products)
    if (p.visible && p.categoryKey && !seen.has(p.categoryKey))
      seen.set(p.categoryKey, { key: p.categoryKey, label: p.category });
  return [...seen.values()];
}

export function matches(p: Product, query: string) {
  const q = query.trim().toLocaleLowerCase();
  return (
    !q ||
    [p.name, p.category, p.description ?? "", p.id]
      .join(" ")
      .toLocaleLowerCase()
      .includes(q)
  );
}

export function filterProducts(
  products: Product[],
  query: string,
  category: string,
  sort: string,
) {
  return products
    .filter(
      (p) =>
        p.visible &&
        matches(p, query) &&
        (category === "all" || p.categoryKey === category),
    )
    .sort((a, b) =>
      sort === "low"
        ? (a.pricePaise ?? Infinity) - (b.pricePaise ?? Infinity)
        : sort === "high"
          ? (b.pricePaise ?? -1) - (a.pricePaise ?? -1)
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : a.displayOrder - b.displayOrder,
    );
}
