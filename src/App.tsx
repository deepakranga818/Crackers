import { useCallback, useEffect, useRef, useState } from "react";
import { categories, config, isLocalDemo, products } from "./business";
import { filterProducts, matches } from "./catalogue";
import { useCart } from "./cart";
import {
  blockedReason,
  orderingAllowed,
  quantity,
  rupees,
  totals,
} from "./pricing";
import { emptyBuyer, type Buyer, type Product } from "./model";
import { validateBuyer } from "./buyer";
import { makeRequest, type RequestDraft } from "./whatsapp";
import { useAudio } from "./audio";
import { Modal, ProductImage, Quantity } from "./components";

export default function App() {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [sort, setSort] = useState("source");
  const [detail, setDetail] = useState<Product | null>(null),
    [cartOpen, setCartOpen] = useState(false),
    [stage, setStage] = useState<"cart" | "buyer" | "review">("cart");
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [toast, setToast] = useState(""),
    [undo, setUndo] = useState<{ p: Product; qty: number } | null>(null);
  const [buyer, setBuyer] = useState<Buyer>({ ...emptyBuyer }),
    [errors, setErrors] = useState<Partial<Record<keyof Buyer, string>>>({});
  const [draft, setDraft] = useState<RequestDraft>(),
    [handoff, setHandoff] = useState(""),
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
  const canOrder = orderingAllowed(config);
  const method = config.fulfilment.find(
    (f) => f.id === buyer.method && f.verified,
  );
  const amount = totals(cart, products, config, method);
  const selected = products.filter((p) => p.id in cart);
  const visible = filterProducts(products, query, category, sort);
  const searchProducts = products.filter((p) => matches(p, query));
  const cartReady =
    canOrder &&
    selected.length > 0 &&
    selected.every((p) => !blockedReason(p, config));
  useEffect(() => {
    if (detail) setDetailQuantity(cart[detail.id] || 1);
  }, [detail]);
  useEffect(() => {
    if (cartOpen && stage !== "cart")
      requestAnimationFrame(() => {
        if (stage === "buyer") document.getElementById("buyer-name")?.focus();
        else
          document
            .querySelector<HTMLElement>(
              ".handoff-preparation, .request-preview",
            )
            ?.focus();
      });
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
  function review() {
    const next = validateBuyer(buyer, config);
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document.getElementById(`buyer-${Object.keys(next)[0]}`)?.focus(),
      );
      return;
    }
    try {
      setDraft(makeRequest(cart, products, buyer, config, draft));
      setStage("review");
      setHandoff("");
      setManualCopy(false);
      setDownloadRequested(false);
    } catch (e) {
      announce((e as Error).message);
    }
  }
  function handoffRequest() {
    if (Date.now() - tapGuard.current < 1000) return;
    try {
      const current = makeRequest(cart, products, buyer, config, draft);
      if (current.fingerprint !== draft?.fingerprint) {
        setDraft(current);
        setHandoff(
          "Your request changed. Review the updated details before continuing.",
        );
        return;
      }
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
          onChange={(e) => setBuyer({ ...buyer, [key]: e.target.value })}
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
      <div className="preview-banner">
        {isLocalDemo
          ? "Local demo · test units and pickup only · do not send a real request"
          : canOrder
            ? "Requests require seller confirmation"
            : "Catalogue preview · ordering is currently unavailable"}
      </div>
      <header>
        <a className="brand" href="#" aria-label={`${config.brand} home`}>
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
            ♪ <span>{audio.label}</span>
            <small className="sound-state">{audio.isOn ? "On" : "Off"}</small>
          </button>
          {canOrder && (
            <button
              className="cart-button"
              onClick={openCart}
              aria-label={`Open cart, ${amount.units} units`}
            >
              <span aria-hidden="true">🛒</span> Cart{" "}
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
            <p className="hero-intro">
              A little sparkle. A beautiful celebration.
            </p>
            <h1>
              Bring home the
              <br />
              festival of lights.
            </h1>
            <p>
              Explore the collection, find your favourites, and compare prices
              at your own pace.
            </p>
            <div className="hero-actions">
              <a className="button gold" href="#catalogue">
                Browse Crackers
              </a>
              <a className="hero-secondary" href="#how-it-works">
                How it works <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="hero-note">
              {canOrder
                ? "Choose, review, then send a request on WhatsApp."
                : "46 source products · selling units awaiting confirmation"}
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="firework fw-one">
              {Array.from({ length: 16 }, (_, i) => (
                <i key={i} style={{ transform: `rotate(${i * 22.5}deg)` }} />
              ))}
            </div>
            <div className="firework fw-two">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ transform: `rotate(${i * 30}deg)` }} />
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
            <span className="art-star star-c">✧</span>
          </div>
        </section>
        <section
          className="catalogue"
          id="catalogue"
          aria-labelledby="catalogue-title"
        >
          <div className="section-heading">
            <div>
              <p className="section-intro">Find your festive favourites</p>
              <h2 id="catalogue-title">The crackers collection</h2>
            </div>
            <p className="catalogue-note">
              Prices from the supplied catalogue.
              <br />
              Availability and selling units require confirmation.
            </p>
          </div>
          <div className="search-bar">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search crackers"
                type="search"
                placeholder="Search products, Phuljadi, Anar…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="sort">
              Sort by
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
          <div
            className="categories"
            role="group"
            aria-label="Product categories"
          >
            {categories.map((c) => (
              <button
                key={c.id}
                aria-pressed={category === c.id}
                className={category === c.id ? "active" : ""}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
                <span>
                  {c.id === "all"
                    ? searchProducts.length
                    : searchProducts.filter((p) => p.categoryId === c.id)
                        .length}
                </span>
              </button>
            ))}
          </div>
          <div className="results-bar">
            <p aria-live="polite">
              Showing <strong>{visible.length}</strong> of {products.length}{" "}
              products
              {category !== "all"
                ? ` · ${categories.find((c) => c.id === category)?.label}`
                : ""}
              {query ? ` · “${query}”` : ""}
            </p>
            <small>Category counts match your search.</small>
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
              {visible.map((p) => (
                <article className="product-card" key={p.id}>
                  <button
                    className="image-button"
                    onClick={() => setDetail(p)}
                    aria-label={`View ${p.name}, ${p.originalCategory} details`}
                  >
                    <ProductImage product={p} />
                  </button>
                  <div className="product-info">
                    <p className="category-label">{p.categoryLabel}</p>
                    <h3>
                      <button
                        className="product-title"
                        onClick={() => setDetail(p)}
                      >
                        {p.name}
                      </button>
                    </h3>
                    <p className="variant">
                      {p.variantLabel || p.originalCategory}
                    </p>
                    <div className="price-row">
                      <strong>
                        {p.pricePaise === null
                          ? "Price needs review"
                          : rupees(p.pricePaise)}
                      </strong>
                      <button
                        className="details-button"
                        onClick={() => setDetail(p)}
                        aria-label={`Details for ${p.name}, ${p.originalCategory}`}
                      >
                        Details <span aria-hidden="true">↗</span>
                      </button>
                    </div>
                    <p className="unit-note">
                      {p.sellingUnit || "Selling unit: to be confirmed"}
                    </p>
                    {p.availability === "unavailable" && (
                      <p>Currently unavailable</p>
                    )}
                    {p.importIssues.length > 0 && (
                      <p className="error">Product data needs correction</p>
                    )}
                    {canOrder &&
                      (blockedReason(p, config) ? (
                        <p className="blocked">{blockedReason(p, config)}</p>
                      ) : cart[p.id] ? (
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
                        <button className="add-button" onClick={() => add(p)}>
                          Add to cart <span aria-hidden="true">+</span>
                        </button>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section id="how-it-works" className="how">
          <div>
            <p className="section-intro">
              A personal touch, from start to finish
            </p>
            <h2>
              {canOrder
                ? "Your selection. Seller confirmation."
                : "Browse now. Confirm the details."}
            </h2>
            <p>
              {canOrder
                ? "No online payment or account required. A request becomes an order only after the seller confirms it."
                : "Ordering is unavailable while business permissions, selling units, and fulfilment details are being verified."}
            </p>
          </div>
          <ol>
            <li>
              <strong>Choose your favourites</strong>
              <span>Browse categories and compare catalogue prices.</span>
            </li>
            <li>
              <strong>Review quantities and amount</strong>
              <span>
                Once ordering is enabled, check your selection and enter buyer
                details.
              </span>
            </li>
            <li>
              <strong>Review and send on WhatsApp</strong>
              <span>
                Open WhatsApp, review the request and tap Send. The seller
                confirms availability, fulfilment and the final payable amount.
              </span>
            </li>
          </ol>
        </section>
      </main>
      <footer id="contact">
        <div className="footer-brand">
          <h2>{config.brand}</h2>
          <p>A catalogue for the festival of lights.</p>
          <small>Development brand · final shop name pending</small>
        </div>
        <div>
          <h3>Contact the seller</h3>
          <a href={`tel:+${config.whatsapp}`}>{config.phoneDisplay}</a>
          <p>{config.address || "Shop address awaiting verification"}</p>
          <p>{config.hours || "Business hours awaiting confirmation"}</p>
          {canOrder && (
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
            <summary>Privacy in this preview</summary>
            <p>
              Cart IDs and quantities and your sound preference may be stored on
              this device. Buyer details remain in memory. If you choose
              WhatsApp, your request is shared with WhatsApp and the seller when
              you press Send. No analytics are installed.
            </p>
          </details>
        </div>
        <div className="footer-bottom">
          Catalogue information requires seller confirmation.{" "}
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
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <ProductImage product={detail} large />
          <div className="detail-content">
            <p className="category-label">{detail.categoryLabel}</p>
            <h3>
              {detail.pricePaise === null
                ? "Price needs review"
                : rupees(detail.pricePaise)}
            </h3>
            <dl>
              <dt>Original category</dt>
              <dd>{detail.originalCategory}</dd>
              <dt>Selling unit</dt>
              <dd>
                {detail.sellingUnit ||
                  "Needs seller confirmation — ordering blocked"}
              </dd>
              {detail.packDetails && (
                <>
                  <dt>Source pack text</dt>
                  <dd>{detail.packDetails} (selling unit unconfirmed)</dd>
                </>
              )}
              <dt>Product reference</dt>
              <dd>{detail.id}</dd>
            </dl>
            {detail.verifiedSpecifications.map((s) => (
              <p key={s}>{s}</p>
            ))}
            {detail.certificationDetails && (
              <p>{detail.certificationDetails}</p>
            )}
            {config.policies.safety && <p>{config.policies.safety}</p>}
            {!detail.categoryReviewed && (
              <p className="callout">
                This product’s category requires seller review.
              </p>
            )}
            {canOrder &&
              (blockedReason(detail, config) ? (
                <p>{blockedReason(detail, config)}</p>
              ) : (
                <>
                  <Quantity
                    value={detailQuantity}
                    max={Math.min(
                      config.maxQuantity,
                      detail.maxQuantityPerRequest,
                    )}
                    name={detail.name}
                    onChange={(v) => {
                      const n = quantity(
                        v,
                        Math.min(
                          config.maxQuantity,
                          detail.maxQuantityPerRequest,
                        ),
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
                </>
              ))}
          </div>
        </Modal>
      )}
      {cartOpen && (
        <Modal
          drawer
          title={
            stage === "buyer"
              ? "Buyer details"
              : stage === "review"
                ? "Review your request"
                : "Your selection"
          }
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
                review();
              }}
            >
              <p>
                Only verified fulfilment options are shown. Details remain in
                this tab until you choose to share them.
              </p>
              {field("name", "Full name", true, 100)}
              {field("mobile", "Mobile number", true, 30)}
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
              {method?.type === "pickup" && (
                <p className="callout">
                  Pickup location: {method.address || config.address}
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
              <PriceSummary amount={amount} />
              <button className="button primary full" type="submit">
                Review complete request
              </button>
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
          {stage === "review" && draft && (
            <div className="review-content">
              <p className="callout">
                {draft.long
                  ? "For this long request, copy the full details below and paste them in WhatsApp, or attach the downloaded request file. "
                  : "WhatsApp will open with your complete request. "}
                Review it and tap Send. Your order is confirmed only after the
                seller replies.
              </p>
              {draft.long && (
                <section
                  className="handoff-preparation"
                  aria-label="Prepare complete WhatsApp request"
                  tabIndex={-1}
                >
                  <h3>Send every item in your request</h3>
                  <p>
                    This request is too long for our configured chat-link limit.
                    The chat link carries a reference, so you must paste the
                    complete details or attach the file before sending.
                  </p>
                  <ol>
                    <li>Copy Complete Request, or download the file.</li>
                    <li>Continue to WhatsApp.</li>
                    <li>
                      Paste the details or attach the file, then tap Send.
                    </li>
                  </ol>
                  <div className="copy-actions">
                    <button className="primary" onClick={() => void copy()}>
                      Copy Complete Request
                    </button>
                    <button onClick={download}>Download Request</button>
                  </div>
                  {manualCopy && (
                    <label className="field">
                      Select and copy the complete request
                      <textarea
                        readOnly
                        rows={8}
                        value={draft.message}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                  )}
                  {requestPrepared && (
                    <p className="prepared-status" role="status">
                      Complete request prepared. Paste it or attach the file in
                      WhatsApp before tapping Send.
                    </p>
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
                      I have copied the complete request, or downloaded it and
                      will attach it in WhatsApp.
                    </label>
                  )}
                </section>
              )}
              <pre
                className="request-preview"
                tabIndex={0}
                aria-label="Complete order request"
              >
                {draft.message}
              </pre>
              <button
                className="button whatsapp full"
                disabled={busy || !requestPrepared}
                onClick={handoffRequest}
              >
                {handoff ? "Open WhatsApp again" : "Continue to WhatsApp"}
              </button>
              {handoff && (
                <p className="callout" role="status">
                  {handoff}
                </p>
              )}
              <p>
                Contact:{" "}
                <a href={`tel:+${config.whatsapp}`}>{config.phoneDisplay}</a>.
                WhatsApp may require installation or a Web login. If it fails,
                use the number and copy/download options.
              </p>
              {!draft.long && (
                <div className="copy-actions">
                  <button onClick={() => void copy()}>
                    Copy Complete Request
                  </button>
                  <button onClick={download}>Download Request</button>
                </div>
              )}
              {manualCopy && !draft.long && (
                <label className="field">
                  Select and copy the complete request
                  <textarea
                    readOnly
                    rows={12}
                    value={draft.message}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              <button
                className="button secondary full"
                onClick={() => setStage("buyer")}
              >
                Edit buyer details
              </button>
              <button className="text-button" onClick={() => setStage("cart")}>
                Edit cart
              </button>
              <button
                className="text-button"
                onClick={() => setCartOpen(false)}
              >
                Continue shopping
              </button>
              <button
                className="text-button"
                onClick={() => setClearConfirm(true)}
              >
                Clear cart
              </button>
              <p className="muted">
                Your cart is retained after opening WhatsApp. This website does
                not track sending, confirmation or purchases. Prices and
                availability must be independently confirmed by the seller.
              </p>
            </div>
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
function PriceSummary({ amount }: { amount: ReturnType<typeof totals> }) {
  return (
    <div className="price-summary">
      <p>
        <span>Product subtotal</span>
        <strong>{rupees(amount.subtotal)}</strong>
      </p>
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
