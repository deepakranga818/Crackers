import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Product } from "./model";
import { rupees } from "./pricing";

// Selling price first, with the struck-through MRP and the saving when the Sheet has an MRP above it.
export function Price({ product: p }: { product: Product }) {
  if (p.pricePaise === null) return <strong>Price needs review</strong>;
  const mrp = p.mrpPaise;
  return (
    <span className="price">
      <strong>{rupees(p.pricePaise)}</strong>
      {mrp != null && mrp > p.pricePaise && (
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

export function Modal({
  title,
  onClose,
  children,
  drawer = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
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
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
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
