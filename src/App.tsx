import { useCallback, useEffect, useRef, useState } from "react";
import {
  actualCatalogueUrl,
  catalogueSource,
  categories,
  config,
  isCheckoutDemo,
  isLocalDemo,
  modeCopy,
  products,
} from "./business";
import { filterProducts, matches } from "./catalogue";
import { useCart } from "./cart";
import {
  anyOrderable,
  blockedReason,
  offerSummary,
  quantity,
  rupees,
  totals,
} from "./pricing";
import { emptyBuyer, type Buyer, type Product } from "./model";
import { validateBuyer } from "./buyer";
import { makeRequest, type RequestDraft } from "./whatsapp";
import { useAudio } from "./audio";
import {
  Modal,
  OfferStrip,
  Price,
  ProductImage,
  Quantity,
  useStickyOffset,
} from "./components";

// Shopper wording for why a product can't be ordered. The unit is shown on its own line,
// so a missing unit is not repeated here.
const shopperReason: Record<string, string> = {
  "Product type needs seller review":
    "Product type is being reviewed · can’t be ordered yet",
};

export default function App() {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [sort, setSort] = useState("source");
  const [detail, setDetail] = useState<Product | null>(null),
    [cartOpen, setCartOpen] = useState(false),
    [stage, setStage] = useState<"cart" | "buyer">("cart");
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [toast, setToast] = useState(""),
    [undo, setUndo] = useState<{ p: Product; qty: number } | null>(null);
  const [buyer, setBuyer] = useState<Buyer>({ ...emptyBuyer }),
    [errors, setErrors] = useState<Partial<Record<keyof Buyer, string>>>({});
  const [draft, setDraft] = useState<RequestDraft>(),
    [handoff, setHandoff] = useState(""),
    // Local checkout demo only: the request a real handoff would have opened.
    [dryRun, setDryRun] = useState<RequestDraft | null>(null),
    [manualCopy, setManualCopy] = useState(false),
    [clearConfirm, setClearConfirm] = useState(false);
  const [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const [preparedFingerprint, setPreparedFingerprint] = useState<string | null>(
    null,
  );
  const [downloadRequested, setDownloadRequested] = useState(false);
  const requestPrepared =
    !draft?.long || preparedFingerprint === draft.fingerprint;
  const tapGuard = useRef(0);
  const announce = useCallback((s: string) => setToast(s), []);
  const { cart, save, update, notice } = useCart(products, config, announce);
  const audio = useAudio(config.soundVolume);
  useStickyOffset();
  // Ordering is offered only when at least one product can really be ordered; a price
  // without a confirmed unit is for browsing.
  const canOrder = anyOrderable(products, config);
  const mode = modeCopy(canOrder);
  const offers = offerSummary(config.offers);
  const method = config.fulfilment.find(
    (f) => f.id === buyer.method && f.verified,
  );
  const amount = totals(cart, products, config, method);
  const selected = products.filter((p) => p.id in cart);
  // The exact request WhatsApp would open, built only once the form is valid so the shopper can
  // inspect it before continuing. Same builder and same draft as the handoff itself.
  let preview: RequestDraft | undefined;
  if (cartOpen && stage === "buyer") {
    try {
      preview = makeRequest(cart, products, buyer, config, draft);
    } catch {
      preview = undefined;
    }
  }
  const fulfilmentText = !method
    ? "Not chosen yet"
    : method.type === "delivery"
      ? `Delivery to ${[buyer.address, buyer.locality, buyer.city, buyer.state, buyer.pin].filter((v) => v.trim()).join(", ") || "an address you enter above"}`
      : method.address && !method.id.startsWith("demo-")
        ? `Pickup — ${method.address}`
        : method.label;
  const visible = filterProducts(products, query, category, sort);
  const searchProducts = products.filter((p) => matches(p, query));
  useEffect(() => {
    setDraft(undefined);
    setHandoff("");
    setDryRun(null);
    setPreparedFingerprint(null);
  }, [cart]);
  const cartReady =
    canOrder &&
    selected.length > 0 &&
    selected.every((p) => !blockedReason(p, config));
  useEffect(() => {
    if (detail) setDetailQuantity(cart[detail.id] || 1);
  }, [detail]);
  useEffect(() => {
    if (cartOpen && stage === "buyer")
      requestAnimationFrame(() =>
        document.getElementById("buyer-name")?.focus(),
      );
  }, [cartOpen, stage]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const listener = () => setOnline(navigator.onLine);
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  }, []);
  useEffect(() => {
    document.title = config.seo.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", config.seo.description);
    for (const [property, value] of [
      ["og:title", config.seo.title],
      ["og:description", config.seo.description],
    ])
      document
        .querySelector(`meta[property="${property}"]`)
        ?.setAttribute("content", value);
    const entries: [string, string | null][] = [
      ["canonical", config.seo.canonical],
      ["og:image", config.seo.ogImage],
    ];
    for (const [rel, url] of entries)
      if (url && /^https:\/\//.test(url)) {
        const node = document.createElement(
          rel === "canonical" ? "link" : "meta",
        );
        if (rel === "canonical") {
          node.setAttribute("rel", rel);
          node.setAttribute("href", url);
        } else {
          node.setAttribute("property", rel);
          node.setAttribute("content", url);
        }
        document.head.append(node);
      }
  }, []);
  function add(p: Product) {
    if (update(p, (cart[p.id] || 0) + 1)) {
      audio.tone("add");
      setStage("cart");
      setHandoff("");
    }
  }
  function change(p: Product, v: unknown) {
    const result = update(p, v);
    if (result) {
      setStage("cart");
      setHandoff("");
    }
    return result;
  }
  function remove(p: Product) {
    const next = { ...cart };
    delete next[p.id];
    save(next);
    setUndo({ p, qty: cart[p.id] });
    announce(`${p.name} removed.`);
    setStage("cart");
    setHandoff("");
    audio.tone("remove");
  }
  function openCart() {
    setCartOpen(true);
    setStage("cart");
  }
  function checkout() {
    const next = validateBuyer(buyer, config);
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document.getElementById(`buyer-${Object.keys(next)[0]}`)?.focus(),
      );
      return;
    }
    try {
      const current = makeRequest(cart, products, buyer, config, draft);
      setDraft(current);
      setManualCopy(false);
      setDownloadRequested(false);
      handoffRequest(current);
    } catch (error) {
      announce((error as Error).message);
    }
  }
  function handoffRequest(provided?: RequestDraft) {
    if (Date.now() - tapGuard.current < 1000) return;
    try {
      const current =
        provided ?? makeRequest(cart, products, buyer, config, draft);
      if (!navigator.onLine) {
        setHandoff(
          "You are offline. Copy or download your request, then retry when connected.",
        );
        return;
      }
      if (current.long && preparedFingerprint !== current.fingerprint) {
        setHandoff(
          "Copy the complete request first, or download it and confirm you will attach the file.",
        );
        return;
      }
      tapGuard.current = Date.now();
      setBusy(true);
      window.setTimeout(() => setBusy(false), 1000);
      if (isCheckoutDemo) {
        // Dry run: show what would have been opened. WhatsApp is never contacted.
        setDryRun(current);
        setHandoff(
          "Dry run only: WhatsApp was not opened and nothing was sent. The link and message that would have been used are shown below.",
        );
        audio.tone("handoff");
        return;
      }
      const opened = window.open(current.url, "_blank");
      if (opened) {
        opened.opener = null;
        setHandoff(
          current.long
            ? "WhatsApp opened. Paste the complete request or attach your downloaded file, then tap Send. Wait for the seller’s confirmation."
            : "WhatsApp opened. If you sent the request, wait for the seller’s confirmation.",
        );
      } else
        setHandoff(
          "WhatsApp could not open. Allow the new tab, or use the copy/download options and contact number below.",
        );
      audio.tone("handoff");
    } catch (e) {
      setHandoff((e as Error).message);
      setStage("cart");
    }
  }
  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.message);
      setPreparedFingerprint(draft.fingerprint);
      announce("Complete request copied.");
    } catch {
      setManualCopy(true);
      announce(
        "Clipboard unavailable. Select the complete request below and copy it manually.",
      );
    }
  }
  function download() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([draft.message], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.reference}.txt`;
    link.click();
    setDownloadRequested(true);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function field(
    key: Exclude<keyof Buyer, "acknowledged" | "method">,
    label: string,
    required = false,
    max = 200,
  ) {
    return (
      <label className="field" htmlFor={`buyer-${key}`}>
        {label}
        {required ? " *" : ""}
        <input
          id={`buyer-${key}`}
          name={key}
          value={buyer[key]}
          maxLength={max}
          required={required}
          inputMode={
            key === "mobile" ? "tel" : key === "pin" ? "numeric" : "text"
          }
          autoComplete={
            key === "name"
              ? "name"
              : key === "mobile"
                ? "tel"
                : key === "address"
                  ? "street-address"
                  : key === "pin"
                    ? "postal-code"
                    : "off"
          }
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `error-${key}` : undefined}
          onChange={(e) => {
            setBuyer({ ...buyer, [key]: e.target.value });
            setDraft(undefined);
            setHandoff("");
            setPreparedFingerprint(null);
          }}
        />
        {errors[key] && (
          <span className="error" id={`error-${key}`}>
            {errors[key]}
          </span>
        )}
      </label>
    );
  }
  const footerPolicy = (key: keyof typeof config.policies, label: string) =>
    config.policies[key] ? (
      <details>
        <summary>{label}</summary>
        <p>{config.policies[key]}</p>
      </details>
    ) : null;
  return (
    <>
      <a className="skip-link" href="#catalogue">
        Skip to catalogue
      </a>
      {isCheckoutDemo && (
        <div className="demo-label" data-sticky="demo" role="note">
          Local checkout demo — test data
        </div>
      )}
      <div className="preview-banner">
        {mode.banner}
        {isCheckoutDemo && (
          <>
            {" · "}
            <a href={actualCatalogueUrl()}>Switch to the actual catalogue</a>
          </>
        )}
      </div>
      <header data-sticky="header">
        <a className="brand" href="#">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M6 29h36Q37 43 24 43T6 29" fill="currentColor" />
            <path d="M24 4q-13 17 0 22Q34 21 24 4" fill="currentColor" />
          </svg>
          <span>
            {config.brand}
            <small>Light up the celebration</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#catalogue">Shop</a>
          <a className="how-nav" href="#how-it-works">
            How it works
          </a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="header-actions">
          <button
            className="sound"
            onClick={audio.toggle}
            aria-label={audio.label}
            aria-pressed={audio.isOn}
          >
            <span className="sound-icon" aria-hidden="true">
              ♪
            </span>{" "}
            <span className="sound-label">{audio.label}</span>
            {/* Short visible label on narrow screens; the accessible name contains it. On/off
                is shown by the filled button and the struck-through note, and by aria-pressed. */}
            <span className="sound-short">Sound</span>
          </button>
          {canOrder && (
            <button
              className="cart-button"
              onClick={openCart}
              aria-label={`Open cart, ${amount.units} units`}
            >
              <span aria-hidden="true">🛒</span>{" "}
              <span className="cart-label">Cart</span>{" "}
              <span className="badge" key={amount.units}>
                {amount.units}
              </span>
            </button>
          )}
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Bring home the festival of lights.</h1>
            <p>{mode.hero}</p>
            <div className="hero-actions">
              <a className="button gold" href="#catalogue">
                Browse crackers
              </a>
              <a className="hero-secondary" href="#how-it-works">
                How it works
              </a>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="firework fw-one">
              {Array.from({ length: 16 }, (_, i) => (
                <i key={i} style={{ transform: `rotate(${i * 22.5}deg)` }} />
              ))}
            </div>
            <svg className="diya" viewBox="0 0 400 220">
              <defs>
                <radialGradient id="glow">
                  <stop stopColor="#ffd77a" stopOpacity=".22" />
                  <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="bowl" x2="0" y2="1">
                  <stop stopColor="#f2c170" />
                  <stop offset="1" stopColor="#b36b29" />
                </linearGradient>
              </defs>
              <circle cx="200" cy="80" r="110" fill="url(#glow)" />
              <path
                d="M200 19C170 65 166 98 200 104C230 91 219 56 200 19"
                fill="#ffd58c"
              />
              <path
                d="M200 52C187 76 188 92 200 99C212 88 209 70 200 52"
                fill="#fff3ca"
              />
              <ellipse cx="200" cy="132" rx="112" ry="22" fill="#704124" />
              <path
                d="M88 130C104 211 290 211 312 130Q200 163 88 130"
                fill="url(#bowl)"
              />
              <path
                d="M101 151Q200 178 299 151M120 173Q200 192 280 173"
                stroke="#fff0bd"
                fill="none"
                strokeOpacity=".5"
              />
              <ellipse cx="200" cy="133" rx="104" ry="17" fill="#c88c3e" />
              <path d="M200 102v29" stroke="#382233" strokeWidth="4" />
            </svg>
            <span className="art-star star-a">✧</span>
            <span className="art-star star-b">✦</span>
          </div>
        </section>
        <section
          className="catalogue"
          id="catalogue"
          aria-labelledby="catalogue-title"
        >
          <OfferStrip offers={offers} />
          <div className="shop-bar" data-sticky="bar">
            <div className="search-row">
              <label className="search">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Search crackers"
                  type="search"
                  placeholder="Search products, Phuljadi, Anar…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="clear-search"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    ✕
                  </button>
                )}
              </label>
            </div>
            <div
              className="categories"
              role="group"
              aria-label="Product categories. Counts follow your search."
              title="Counts follow your search"
            >
              {categories.map((c) => {
                const count =
                  c.id === "all"
                    ? searchProducts.length
                    : searchProducts.filter((p) => p.categoryId === c.id)
                        .length;
                return (
                  <button
                    key={c.id}
                    aria-pressed={category === c.id}
                    className={
                      (category === c.id ? "active" : "") +
                      (count === 0 ? " none" : "")
                    }
                    onClick={() => setCategory(c.id)}
                    // The browser leaves a half-visible chip half hidden; reveal it fully.
                    onFocus={(e) =>
                      e.currentTarget.scrollIntoView({
                        block: "nearest",
                        inline: "nearest",
                      })
                    }
                  >
                    {c.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="results-bar">
            <div className="results-title">
              <h2 id="catalogue-title">Crackers</h2>
              <p aria-live="polite">
                <span className="lead-word">Showing </span>
                <strong>{visible.length}</strong> of {products.length} products
                {category !== "all"
                  ? ` · ${categories.find((c) => c.id === category)?.label}`
                  : ""}
                {query ? ` · “${query}”` : ""}
              </p>
              {(query || category !== "all" || sort !== "source") && (
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setSort("source");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            <label className="sort">
              <span>Sort by</span>
              <select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="source">Catalogue order</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          {!visible.length ? (
            <div className="empty">
              <span aria-hidden="true">✧</span>
              <h3>No crackers match these filters</h3>
              <p>Try a product name or another category.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="product-grid">
              {visible.map((p) => {
                const reason = blockedReason(p, config);
                const unitKnown = !!p.sellingUnit?.trim();
                return (
                  <article className="product-card" key={p.id}>
                    <button
                      className="image-button"
                      tabIndex={-1}
                      onClick={() => setDetail(p)}
                      aria-label={`View ${p.name}, ${p.originalCategory} details${p.images.length > 1 ? `, ${p.images.length} photos` : ""}${p.images.length ? "" : ", Product image coming soon"}`}
                    >
                      <ProductImage product={p} />
                    </button>
                    <div className="product-info">
                      <p className="category-label">{p.categoryLabel}</p>
                      <h3>{p.name}</h3>
                      <p className="variant">
                        {p.variantLabel || p.originalCategory}
                      </p>
                      <div className="price-row">
                        <Price
                          product={p}
                          reference={config.showReferencePrices}
                        />
                      </div>
                      <p className={unitKnown ? "unit-note" : "unit-note pending"}>
                        {unitKnown
                          ? `Unit: ${p.sellingUnit}`
                          : "Unit not confirmed · can’t be ordered yet"}
                      </p>
                      {p.availability === "unavailable" && (
                        <p className="blocked">Currently unavailable</p>
                      )}
                      {p.importIssues.length > 0 && (
                        <p className="error">Product data needs correction</p>
                      )}
                      {reason && shopperReason[reason] && (
                        <p className="blocked">{shopperReason[reason]}</p>
                      )}
                      <div className="card-actions">
                        {!reason &&
                          (cart[p.id] ? (
                            <Quantity
                              value={cart[p.id]}
                              max={Math.min(
                                config.maxQuantity,
                                p.maxQuantityPerRequest,
                              )}
                              name={`${p.name} ${p.id}`}
                              onChange={(v) => change(p, v)}
                            />
                          ) : (
                            <button
                              className="add-button"
                              onClick={() => add(p)}
                            >
                              Add to cart <span aria-hidden="true">+</span>
                            </button>
                          ))}
                        <button
                          className="details-button"
                          onClick={() => setDetail(p)}
                          aria-label={`Details for ${p.name}, ${p.originalCategory}`}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section id="how-it-works" className="how">
          <div>
            <h2>{mode.howTitle}</h2>
            <p>{mode.howIntro}</p>
          </div>
          <ol>
            {mode.steps.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer id="contact">
        <div className="footer-brand">
          <h2>{config.brand}</h2>
          <p>A catalogue for the festival of lights.</p>
        </div>
        <div>
          <h3>Contact the seller</h3>
          <a href={`tel:+${config.whatsapp}`}>{config.phoneDisplay}</a>
          {config.address && <p>{config.address}</p>}
          {config.hours && <p>{config.hours}</p>}
          {canOrder && !isCheckoutDemo && (
            <a
              href={`https://wa.me/${config.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open WhatsApp
            </a>
          )}
        </div>
        <div>
          <h3>Before you choose</h3>
          <p>
            {config.policies.fulfilment ||
              "Pickup, delivery and service areas are not yet verified."}
          </p>
          <p>No online payment is collected.</p>
          {footerPolicy("privacy", "Privacy information")}
          {footerPolicy("cancellation", "Cancellation and returns")}
          {footerPolicy("safety", "Safety and legal information")}
          <details>
            <summary>Privacy</summary>
            <p>
              Your cart (product IDs and quantities) and sound preference are
              saved on this device only. The name, mobile number, address and
              notes you enter stay in your browser and are not stored by this
              website. When you continue, they go into a WhatsApp message to the
              seller. Nothing is shared until you press Send in WhatsApp; after
              that, WhatsApp and the seller handle the message. No analytics or
              ad trackers are installed.
            </p>
          </details>
        </div>
        <div className="footer-bottom">
          <p>
            Prices come from the seller’s{" "}
            <a
              href={catalogueSource.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              shared price list
            </a>
            ; the seller confirms every detail.
          </p>
          <span>Made for a thoughtful celebration ✧</span>
        </div>
      </footer>
      {canOrder && amount.units > 0 && !cartOpen && !detail && (
        <>
          <div
            className="mobile-cart-bar"
            role="region"
            aria-label="Cart summary"
          >
            <div>
              <strong>
                {amount.units} {amount.units === 1 ? "unit" : "units"} selected
              </strong>
              <span>Product subtotal {rupees(amount.subtotal)}</span>
              {amount.discount > 0 && (
                <span className="offer-saving">
                  After offer {rupees(amount.afterDiscount)}
                </span>
              )}
            </div>
            <button
              className="button primary"
              aria-label={`Review cart, ${amount.units} units`}
              onClick={openCart}
            >
              View cart
            </button>
          </div>
          <div className="mobile-cart-space" aria-hidden="true" />
        </>
      )}
      {!online && (
        <div className="offline" role="status">
          You are offline. Browsing works; WhatsApp requires a connection.
        </div>
      )}
      {audio.status && (
        <p role="status" className="sound-status">
          {audio.status}
        </p>
      )}
      {!cartOpen && (
        <div
          role="status"
          aria-live="polite"
          className={toast ? "toast visible" : "toast"}
        >
          {toast}
        </div>
      )}
      {detail && (
        <Modal
          title={detail.name}
          onClose={() => setDetail(null)}
          describedBy="detail-summary"
        >
          <ProductImage product={detail} large />
          <div className="detail-content">
            <p className="category-label">{detail.categoryLabel}</p>
            <p className="variant">
              {detail.variantLabel || detail.originalCategory}
            </p>
            <div id="detail-summary">
              <p className="detail-price">
                <Price product={detail} reference={config.showReferencePrices} />
              </p>
              <p
                className={
                  detail.sellingUnit?.trim() ? "unit-note" : "unit-note pending"
                }
              >
                {detail.sellingUnit?.trim()
                  ? `Unit: ${detail.sellingUnit}`
                  : "Unit not confirmed · can’t be ordered yet"}
              </p>
            </div>
            <dl>
              <dt>Type</dt>
              <dd>{detail.originalCategory}</dd>
              {detail.packDetails && (
                <>
                  <dt>Pack information</dt>
                  <dd>
                    {detail.packDetails}
                    {!detail.sellingUnit?.trim() &&
                      " (describes the pack, not the selling unit)"}
                  </dd>
                </>
              )}
              <dt>Reference</dt>
              <dd>{detail.id}</dd>
            </dl>
            {detail.verifiedSpecifications.map((s) => (
              <p key={s}>{s}</p>
            ))}
            {detail.certificationDetails && (
              <p>{detail.certificationDetails}</p>
            )}
            {config.policies.safety && <p>{config.policies.safety}</p>}
            {!detail.sellingUnit?.trim() && (
              <p className="callout">
                This product can’t be ordered until the seller confirms its
                selling unit.
              </p>
            )}
            {!detail.categoryReviewed && (
              <p className="callout">
                This product’s category requires seller review.
              </p>
            )}
            {detail.availability === "unavailable" && (
              <p className="callout">Currently unavailable.</p>
            )}
            {!blockedReason(detail, config) && (
              <div className="detail-actions">
                <Quantity
                  value={detailQuantity}
                  max={Math.min(config.maxQuantity, detail.maxQuantityPerRequest)}
                  name={detail.name}
                  onChange={(v) => {
                    const n = quantity(
                      v,
                      Math.min(config.maxQuantity, detail.maxQuantityPerRequest),
                    );
                    if (n === null) {
                      announce("Enter a valid whole quantity.");
                      return false;
                    }
                    setDetailQuantity(n);
                    return true;
                  }}
                />
                <button
                  className="button primary"
                  onClick={() => {
                    if (update(detail, detailQuantity)) {
                      audio.tone("add");
                      setDetail(null);
                      setStage("cart");
                      setHandoff("");
                    }
                  }}
                >
                  {cart[detail.id] ? "Update cart" : "Add to cart"}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {cartOpen && (
        <Modal
          drawer
          title={stage === "buyer" ? "Checkout" : "Your selection"}
          onClose={() => setCartOpen(false)}
        >
          {toast && (
            <div className="cart-toast" role="status" aria-live="polite">
              {toast}
              {undo && (
                <button
                  onClick={() => {
                    if (!blockedReason(undo.p, config)) {
                      save({ ...cart, [undo.p.id]: undo.qty });
                      announce(`${undo.p.name} restored.`);
                      setUndo(null);
                    }
                  }}
                >
                  Undo removal
                </button>
              )}
            </div>
          )}
          {notice && <p className="callout">{notice}</p>}
          {stage === "cart" && (
            <div className="cart-content">
              {!selected.length ? (
                <div className="empty">
                  <h3>Your cart is empty</h3>
                  <p>Find something to brighten your celebration.</p>
                </div>
              ) : (
                <>
                  <p className="muted">
                    {amount.units} total units · quantities do not reserve stock
                  </p>
                  {selected.map((p) => (
                    <div className="cart-line" key={p.id}>
                      <div>
                        <h3>{p.name}</h3>
                        <p>{p.originalCategory}</p>
                        <small>
                          {p.sellingUnit || "Selling unit unconfirmed"}
                        </small>
                        <p>
                          {rupees(p.pricePaise!)} each ·{" "}
                          <strong>{rupees(p.pricePaise! * cart[p.id])}</strong>
                        </p>
                        {blockedReason(p, config) && (
                          <p className="error">{blockedReason(p, config)}</p>
                        )}
                      </div>
                      <Quantity
                        name={`${p.name} ${p.id}`}
                        value={cart[p.id]}
                        max={Math.min(
                          config.maxQuantity,
                          p.maxQuantityPerRequest,
                        )}
                        onChange={(v) => change(p, v)}
                      />
                      <button
                        className="text-button remove"
                        onClick={() => remove(p)}
                        aria-label={`Remove ${p.name}, ${p.id}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <PriceSummary amount={amount} />
                  <button
                    className="button primary full"
                    disabled={!cartReady}
                    onClick={() => {
                      setBuyer((b) => ({
                        ...b,
                        method:
                          b.method ||
                          config.fulfilment.find((f) => f.verified)?.id ||
                          "",
                      }));
                      setStage("buyer");
                    }}
                  >
                    Proceed to buyer details
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setClearConfirm(true)}
                  >
                    Clear cart
                  </button>
                </>
              )}
              <button
                className="button secondary full"
                onClick={() => setCartOpen(false)}
              >
                Continue shopping
              </button>
            </div>
          )}
          {stage === "buyer" && (
            <form
              className="buyer-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                checkout();
              }}
            >
              <p>
                Enter your name and mobile number, then review your request
                below.
              </p>
              {field("name", "Full name", true, 100)}
              {field("mobile", "Mobile number", true, 30)}
              {config.fulfilment.filter((f) => f.verified).length > 1 && (
                <label className="field" htmlFor="buyer-method">
                  Fulfilment method *
                  <select
                    id="buyer-method"
                    value={buyer.method}
                    onChange={(e) =>
                      setBuyer({ ...buyer, method: e.target.value })
                    }
                    aria-invalid={!!errors.method}
                  >
                    <option value="">Choose an option</option>
                    {config.fulfilment
                      .filter((f) => f.verified)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                  {errors.method && (
                    <span className="error">{errors.method}</span>
                  )}
                </label>
              )}
              {method?.type === "pickup" && !isLocalDemo && (
                <p className="callout">
                  {method.address || config.address
                    ? `Pickup location: ${method.address || config.address}`
                    : method.label}
                </p>
              )}
              {method?.type === "delivery" && (
                <>
                  {field("address", "Address line", true)}
                  {field("locality", "Locality / area", true)}
                  {field("city", "City", true)}
                  {field("state", "State", true)}
                  {field("pin", "PIN code", true, 6)}
                  <p className="muted">
                    A valid PIN does not guarantee serviceability. It must match
                    the configured service area.
                  </p>
                  {field("landmark", "Landmark", false)}
                </>
              )}
              {field("notes", "Order notes", false, 500)}
              <label className="ack">
                <input
                  id="buyer-acknowledged"
                  type="checkbox"
                  checked={buyer.acknowledged}
                  onChange={(e) =>
                    setBuyer({ ...buyer, acknowledged: e.target.checked })
                  }
                />
                I understand that my buyer details and request will be shared
                with the seller on WhatsApp.
              </label>
              {errors.acknowledged && (
                <p className="error">{errors.acknowledged}</p>
              )}
              <section className="review-summary" aria-labelledby="review-title">
                <h3 id="review-title">Review your request</h3>
                <ul className="review-lines">
                  {selected.map((p) => (
                    <li key={p.id}>
                      <div className="review-item">
                        <strong>{p.name}</strong>
                        <span>{p.variantLabel || p.originalCategory}</span>
                        {p.sellingUnit && <small>Unit: {p.sellingUnit}</small>}
                      </div>
                      <div className="review-amount">
                        <span>
                          {cart[p.id]} × {rupees(p.pricePaise!)}
                        </span>
                        <strong>{rupees(p.pricePaise! * cart[p.id])}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
                <PriceSummary amount={amount} />
                <dl className="review-buyer">
                  <dt>Name</dt>
                  <dd>{buyer.name.trim() || "Not entered yet"}</dd>
                  <dt>Mobile</dt>
                  <dd>{buyer.mobile.trim() || "Not entered yet"}</dd>
                  <dt>Fulfilment</dt>
                  <dd>{fulfilmentText}</dd>
                  {buyer.notes.trim() && (
                    <>
                      <dt>Notes</dt>
                      <dd>{buyer.notes.trim()}</dd>
                    </>
                  )}
                </dl>
                <div className="review-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStage("cart")}
                  >
                    Edit items
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => document.getElementById("buyer-name")?.focus()}
                  >
                    Edit details
                  </button>
                </div>
                <details className="complete-message">
                  <summary>View the complete WhatsApp message</summary>
                  {preview ? (
                    <pre tabIndex={0} aria-label="Complete WhatsApp message">
                      {preview.message}
                    </pre>
                  ) : (
                    <p className="muted">
                      Enter your name and mobile number and tick the
                      acknowledgement above to see the complete message.
                    </p>
                  )}
                </details>
              </section>
              {draft?.long && (
                <section
                  className="handoff-preparation"
                  aria-label="Complete order transfer"
                >
                  <h3>Copy your full order first</h3>
                  <p>
                    Your order is too long for a chat link. Copy it, then open
                    WhatsApp, paste and tap Send. Or download it and attach the
                    file.
                  </p>
                  <div className="copy-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void copy()}
                    >
                      Copy Complete Order
                    </button>
                    <button type="button" onClick={download}>
                      Download Order
                    </button>
                  </div>
                  {manualCopy && (
                    <label className="field">
                      Select and copy the complete order
                      <textarea
                        readOnly
                        rows={6}
                        value={draft.message}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                  )}
                  {(manualCopy || downloadRequested) && (
                    <label className="ack">
                      <input
                        type="checkbox"
                        checked={requestPrepared}
                        onChange={(event) =>
                          setPreparedFingerprint(
                            event.target.checked ? draft.fingerprint : null,
                          )
                        }
                      />
                      I have copied the full order, or will attach the
                      downloaded file.
                    </label>
                  )}
                  {requestPrepared && (
                    <p className="prepared-status" role="status">
                      Full order ready to paste or attach.
                    </p>
                  )}
                </section>
              )}
              {isCheckoutDemo && (
                <p className="callout">
                  <strong>Dry run.</strong> Continue to WhatsApp shows the link
                  and message here instead. It does not open WhatsApp or send
                  anything.
                </p>
              )}
              <button
                className="button whatsapp full"
                type="submit"
                disabled={busy || (!!draft?.long && !requestPrepared)}
              >
                {handoff && !draft?.long
                  ? isCheckoutDemo
                    ? "Run the dry run again"
                    : "Open WhatsApp again"
                  : "Continue to WhatsApp"}
              </button>
              <p className="muted">
                WhatsApp will open with your request. Review it and tap Send.
                Your order is confirmed only after the seller replies.
              </p>
              {handoff && (
                <p className="callout" role="status">
                  {handoff}
                </p>
              )}
              {isCheckoutDemo && dryRun && <DryRunPanel draft={dryRun} />}
              {draft && !draft.long && (
                <details className="order-backup">
                  <summary>Copy or save this order</summary>
                  <div className="copy-actions">
                    <button type="button" onClick={() => void copy()}>
                      Copy Complete Order
                    </button>
                    <button type="button" onClick={download}>
                      Download Order
                    </button>
                  </div>
                  {manualCopy && (
                    <label className="field">
                      Select and copy the complete order
                      <textarea
                        readOnly
                        rows={6}
                        value={draft.message}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                  )}
                </details>
              )}
              <p className="muted">
                Availability and collection/delivery are confirmed by the
                seller. Your cart stays saved.
              </p>
              <button
                type="button"
                className="button secondary full"
                onClick={() => setStage("cart")}
              >
                Edit cart
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setBuyer({ ...emptyBuyer });
                  setErrors({});
                }}
              >
                Reset buyer details
              </button>
            </form>
          )}
          {clearConfirm && (
            <div
              className="confirm-box"
              role="group"
              aria-label="Confirm clearing cart"
            >
              <p>
                Remove all selected items? This also resets the reviewed
                request.
              </p>
              <button
                onClick={() => {
                  save({});
                  setStage("cart");
                  setDraft(undefined);
                  setHandoff("");
                  setClearConfirm(false);
                  setUndo(null);
                  announce("Cart cleared.");
                }}
              >
                Yes, clear cart
              </button>
              <button onClick={() => setClearConfirm(false)}>Keep items</button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
// Local checkout demo only (see isCheckoutDemo): what "Continue to WhatsApp" would have opened.
function DryRunPanel({ draft }: { draft: RequestDraft }) {
  const url = new URL(draft.url);
  return (
    <section className="dry-run" aria-labelledby="dry-run-title">
      <h3 id="dry-run-title">Dry run result: nothing was sent</h3>
      <p>
        On the live site this step would open WhatsApp with the link below.
        The buyer would still have to tap Send, and the seller confirms the
        order. Here, WhatsApp was not opened.
      </p>
      <dl>
        <dt>Would open</dt>
        <dd>
          <code>{draft.url}</code>
        </dd>
        <dt>Recipient</dt>
        <dd>
          +{url.pathname.slice(1)} (the real seller number; this demo never
          contacts it)
        </dd>
        <dt>Reference</dt>
        <dd>{draft.reference}</dd>
        <dt>Link length</dt>
        <dd>
          {draft.url.length} characters (limit {config.urlThreshold})
          {draft.long
            ? ". Too long for a chat link, so WhatsApp would open with a short note and the buyer pastes or attaches the complete request."
            : ". Fits in the link."}
        </dd>
      </dl>
      <h4>Message carried in the link</h4>
      <pre tabIndex={0} aria-label="Message carried in the WhatsApp link">
        {url.searchParams.get("text")}
      </pre>
      {draft.long && (
        <>
          <h4>Complete request (to paste or attach)</h4>
          <pre tabIndex={0} aria-label="Complete request">
            {draft.message}
          </pre>
        </>
      )}
    </section>
  );
}
function PriceSummary({ amount }: { amount: ReturnType<typeof totals> }) {
  return (
    <div className="price-summary">
      <p>
        <span>Product subtotal</span>
        <strong>{rupees(amount.subtotal)}</strong>
      </p>
      {amount.discount > 0 && (
        <p className="offer-saving">
          <span>
            {amount.discountBasisPoints / 100}% offer
            {amount.couponCode ? ` (${amount.couponCode})` : ""}
          </span>
          <strong>−{rupees(amount.discount)}</strong>
        </p>
      )}
      <p>
        <span>Delivery / fulfilment charge</span>
        <span>
          {amount.delivery === null
            ? "Seller will confirm"
            : rupees(amount.delivery)}
        </span>
      </p>
      {amount.tax !== null && (
        <p>
          <span>Configured tax</span>
          <span>{rupees(amount.tax)}</span>
        </p>
      )}
      <p className="summary-total">
        <span>{amount.label}</span>
        <strong>{amount.text}</strong>
      </p>
      <small>
        Final payable amount and availability require seller confirmation.
      </small>
    </div>
  );
}
