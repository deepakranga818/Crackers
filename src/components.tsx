import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Product } from "./model";
import { isCheckoutDemo } from "./business";
import { rupees } from "./pricing";

// Selling price only, unless `reference` says the owner has confirmed the Sheet's MRP values
// are genuine reference prices; then the struck-through MRP and the saving are shown too.
export function Price({
  product: p,
  reference = false,
}: {
  product: Product;
  reference?: boolean;
}) {
  if (p.pricePaise === null) return <strong>Price needs review</strong>;
  const mrp = p.mrpPaise;
  return (
    <span className="price">
      <strong>{rupees(p.pricePaise)}</strong>
      {reference && mrp != null && mrp > p.pricePaise && (
        <>
          <del className="mrp">
            <span className="sr-only">MRP </span>
            {rupees(mrp)}
          </del>
          <span className="save">
            {Math.round(100 - (p.pricePaise * 100) / mrp)}% off
          </span>
        </>
      )}
    </span>
  );
}

// Publishes the height of the sticky UI that is actually on screen as --sticky-h (and the
// header's own height as --header-h), so anchors and focused controls clear it however the
// chips wrap or the text is zoomed. When the stack would take more than 30% of the screen
// (20% on phone-width layouts), e.g. at 200% zoom or on a landscape phone, stickiness is
// switched off for the whole page.
// Elements are marked data-sticky="header" | "bar"; the header only sticks on wide screens.
export function useStickyOffset() {
  useEffect(() => {
    const root = document.documentElement;
    const wide = window.matchMedia("(min-width: 761px)");
    const update = () => {
      const header = document.querySelector<HTMLElement>(
        '[data-sticky="header"]',
      );
      const bar = document.querySelector<HTMLElement>('[data-sticky="bar"]');
      // The local demo's label (data-sticky="demo") is always pinned and not counted toward
      // the limit below; the other pinned UI sits beneath it.
      const demoHeight =
        document.querySelector<HTMLElement>('[data-sticky="demo"]')
          ?.offsetHeight ?? 0;
      root.style.setProperty("--demo-h", `${demoHeight}px`);
      const headerHeight = wide.matches ? (header?.offsetHeight ?? 0) : 0;
      const height = headerHeight + (bar?.offsetHeight ?? 0);
      // Phone-width layouts tolerate less pinned UI than wide ones.
      const off = height > window.innerHeight * (wide.matches ? 0.3 : 0.2);
      root.toggleAttribute("data-sticky-off", off);
      root.style.setProperty(
        "--sticky-h",
        `${demoHeight + (off ? 0 : height)}px`,
      );
      root.style.setProperty(
        "--header-h",
        off ? "0px" : `${headerHeight}px`,
      );
    };
    const observer = new ResizeObserver(update);
    document
      .querySelectorAll("[data-sticky]")
      .forEach((el) => observer.observe(el));
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    wide.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      wide.removeEventListener("change", update);
    };
  }, []);
}

// The offer tiers in plain words: a one-line summary that opens to the exact thresholds.
export function OfferStrip({
  offers,
}: {
  offers: { code: string | null; text: string; percent: number }[];
}) {
  if (!offers.length) return null;
  return (
    <details className="offers">
      <summary>
        <span>
          Offers · {offers.map((o) => `${o.percent}%`).join(", ")} off your
          product total
        </span>
        <span className="offers-toggle">View terms</span>
      </summary>
      <ul>
        {offers.map((o) => (
          <li key={o.text}>
            {o.code && <span className="code">{o.code}</span>}
            {o.text}
          </li>
        ))}
      </ul>
      <p>
        Applied automatically to your product total, before any fulfilment
        charge. There is no code to enter.
      </p>
    </details>
  );
}

export function Modal({
  title,
  onClose,
  children,
  drawer = false,
  describedBy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      ref.current?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? "modal drawer" : "modal"}
      aria-labelledby="dialog-title"
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={isCheckoutDemo ? "modal-head with-demo-tag" : "modal-head"}>
        {isCheckoutDemo && (
          <p className="demo-tag">Local checkout demo — test data</p>
        )}
        <h2 id="dialog-title">{title}</h2>
        <button onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ProductImage({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState(false);
  const src = product.images[index];
  return (
    <div className={large ? "product-image large" : "product-image"}>
      {src && !failed ? (
        <img
          src={`${import.meta.env.BASE_URL}${src}`}
          alt={`${product.name} packaging, image ${index + 1}`}
          width="480"
          height="360"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="image-fallback">
          <span aria-hidden="true">✧</span>
          <span>
            Product image
            <br />
            coming soon
          </span>
        </div>
      )}
      {!large && product.images.length > 1 && (
        <span className="photo-count">{product.images.length} photos</span>
      )}
      {large && product.images.length > 1 && (
        <div className="gallery-controls">
          {product.images.map((_, i) => (
            <button
              key={i}
              aria-label={`View product image ${i + 1}`}
              aria-pressed={index === i}
              onClick={() => {
                setIndex(i);
                setFailed(false);
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function Quantity({
  value,
  max,
  name,
  onChange,
}: {
  value: number;
  max: number;
  name: string;
  onChange: (v: unknown) => boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (!onChange(draft)) setDraft(String(value));
  };
  return (
    <div className="quantity">
      <button
        aria-label={`Decrease ${name} quantity`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        aria-label={`${name} quantity`}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      <button
        aria-label={`Increase ${name} quantity`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
