import type { Product } from "./model";
const aliases: Record<string, string> = {
  phuljadi: "sparklers",
  phuljhari: "sparklers",
  sparkler: "sparklers",
  sparklers: "sparklers",
  chakkar: "spinners",
  chakkari: "spinners",
  spinner: "spinners",
  spinners: "spinners",
  anar: "pots",
  "flower pot": "pots",
  laddi: "strings",
  ladi: "strings",
  string: "strings",
  strings: "strings",
};
export function matches(p: Product, query: string) {
  const q = query.trim().toLocaleLowerCase();
  return (
    !q ||
    [p.name, p.originalCategory, p.categoryLabel, p.variantLabel || ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(q) ||
    aliases[q] === p.categoryId
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
        matches(p, query) && (category === "all" || p.categoryId === category),
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
