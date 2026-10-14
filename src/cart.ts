import { useEffect, useState } from "react";
import type { Business, Cart, Product } from "./model";
import { blockedReason, quantity } from "./pricing";
export const CART_KEY = "diwali-cart-v1";
export function restore(
  raw: string | null,
  products: Product[],
  config: Business,
) {
  const cart: Cart = {};
  const notices: string[] = [];
  if (!raw) return { cart, notices };
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed.schema !== 1 ||
      !parsed.items ||
      typeof parsed.items !== "object" ||
      Array.isArray(parsed.items)
    )
      throw Error();
    for (const [id, qty] of Object.entries(parsed.items)) {
      const p = products.find((p) => p.id === id);
      if (!p || !p.enabled || p.pricePaise === null) {
        notices.push(
          "A removed or disabled product was removed from your cart.",
        );
        continue;
      }
      const n = quantity(
        qty,
        Math.min(config.maxQuantity, p.maxQuantityPerRequest),
      );
      if (n === null) {
        notices.push("An invalid saved quantity was removed.");
        continue;
      }
      cart[id] = n;
      if (blockedReason(p, config))
        notices.push(
          `${p.name}: ordering information changed; review required.`,
        );
    }
    if (parsed.catalogueVersion !== config.catalogueVersion)
      notices.push(
        "The catalogue has changed. Current prices are applied; review your subtotal before continuing.",
      );
  } catch {
    notices.push("Saved cart could not be read. Started with an empty cart.");
  }
  return { cart, notices: [...new Set(notices)] };
}
export function useCart(
  products: Product[],
  config: Business,
  announce: (s: string) => void,
) {
  const [initial] = useState(() => {
    try {
      return restore(localStorage.getItem(CART_KEY), products, config);
    } catch {
      return {
        cart: {},
        notices: [
          "Browser storage is unavailable. Your cart lasts for this visit.",
        ],
      };
    }
  });
  const [cart, setCart] = useState<Cart>(initial.cart);
  const [notice, setNotice] = useState(initial.notices.join(" "));
  const save = (next: Cart) => {
    setCart(next);
    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify({
          schema: 1,
          catalogueVersion: config.catalogueVersion,
          items: next,
        }),
      );
    } catch {
      setNotice(
        "Browser storage is unavailable. Your cart lasts for this visit.",
      );
    }
  };
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key !== CART_KEY) return;
      const restored = restore(event.newValue, products, config);
      setCart(restored.cart);
      setNotice(restored.notices.join(" "));
      announce("Cart updated from another tab.");
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [products, config, announce]);
  function update(p: Product, value: unknown) {
    const n = quantity(
      value,
      Math.min(config.maxQuantity, p.maxQuantityPerRequest),
    );
    if (n === null) {
      announce(
        `Enter a whole quantity from 1 to ${Math.min(config.maxQuantity, p.maxQuantityPerRequest)}.`,
      );
      return false;
    }
    if (blockedReason(p, config)) {
      announce(blockedReason(p, config)!);
      return false;
    }
    save({ ...cart, [p.id]: n });
    announce(`${p.name}: ${n} units selected.`);
    return true;
  }
  return { cart, save, update, notice };
}
