import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_KEY, REFRESH_MS, SheetStore, type Env } from "../src/sheet/store";
import { parseSheet } from "../src/sheet/parse";
import { product, sheet } from "./helpers/sheet";

const csv = (n = 2, extra = {}) => sheet({ products: Array.from({ length: n }, (_, i) => product(i + 1, extra)) });
const ok = (text: string, init: ResponseInit = {}) =>
  new Response(text, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" }, ...init });

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}
// An environment the tests control: tab visibility and the "visible"/"online" events.
function fakeEnv() {
  let visible = true;
  const visibleCbs = new Set<() => void>();
  const env: Env = {
    isVisible: () => visible,
    onVisible: (cb) => (visibleCbs.add(cb), () => visibleCbs.delete(cb)),
    onOnline: () => () => {},
  };
  return {
    env,
    hide: () => (visible = false),
    show: () => {
      visible = true;
      visibleCbs.forEach((cb) => cb());
    },
  };
}
const mk = (fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) =>
  new SheetStore({ fetch, storage: new MemoryStorage(), spreadsheetId: "SHEET", url: "https://example.test/sheet.csv", ...extra });

beforeEach(() => vi.useFakeTimers({ now: 1_800_000_000_000 }));
afterEach(() => vi.useRealTimers());

describe("loading and failures", () => {
  it("starts loading, then ready with a fresh (not stale) snapshot", async () => {
    const store = mk(async () => ok(csv()));
    expect(store.getState().phase).toBe("loading");
    await store.refresh();
    const s = store.getState();
    expect(s).toMatchObject({ phase: "ready", stale: false, error: null });
    expect(s.snapshot!.products).toHaveLength(2);
    expect(s.fetchedAt).toBe(Date.now());
  });
  it("sends no credentials and bypasses the HTTP cache", async () => {
    const fetch = vi.fn(async () => ok(csv()));
    await mk(fetch).refresh();
    expect(fetch).toHaveBeenCalledWith("https://example.test/sheet.csv", expect.objectContaining({ cache: "no-store", credentials: "omit" }));
  });
  it("reports a network failure with no cache as an error state (no fallback data)", async () => {
    const store = mk(async () => { throw new TypeError("Failed to fetch"); });
    await expect(store.refresh()).rejects.toMatchObject({ kind: "network" });
    expect(store.getState()).toMatchObject({ phase: "error", snapshot: null });
  });
  it.each([[401], [403], [404]])("treats HTTP %i as an access problem", async (status) => {
    const store = mk(async () => ok("nope", { status }));
    await expect(store.refresh()).rejects.toMatchObject({ kind: "access" });
  });
  it("treats HTTP 500 as a network problem", async () => {
    await expect(mk(async () => ok("x", { status: 500 })).refresh()).rejects.toMatchObject({ kind: "network" });
  });
  it("treats an HTML body or content-type as an access problem, never as data", async () => {
    await expect(mk(async () => ok("<html>Sign in</html>", { headers: { "content-type": "text/html" } })).refresh()).rejects.toMatchObject({ kind: "access" });
    await expect(mk(async () => ok("<!doctype html><html></html>")).refresh()).rejects.toMatchObject({ kind: "access" });
  });
  it("rejects an invalid sheet structure without replacing anything", async () => {
    const store = mk(async () => ok("a,b\n1,2\n"));
    await expect(store.refresh()).rejects.toMatchObject({ kind: "structure" });
    expect(store.getState().phase).toBe("error");
  });
  it("times out a slow request and aborts it", async () => {
    let signal: AbortSignal | undefined;
    const store = mk((_url, init) => new Promise<Response>((_, reject) => {
      signal = init!.signal!;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }), { timeoutMs: 5000 });
    const p = store.refresh();
    const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(signal!.aborted).toBe(true);
    expect(store.getState().refreshing).toBe(false);
  });
});

describe("failure while data is already on screen", () => {
  it("keeps the last good snapshot, marks it stale and records the error", async () => {
    let fail = false;
    const store = mk(async () => (fail ? ok("<html></html>") : ok(csv())));
    await store.refresh();
    const good = store.getState().snapshot;
    fail = true;
    await expect(store.refresh()).rejects.toBeTruthy();
    expect(store.getState()).toMatchObject({ phase: "ready", stale: true, snapshot: good });
    expect(store.getState().error?.kind).toBe("access");
    fail = false;
    await store.refresh();
    expect(store.getState()).toMatchObject({ stale: false, error: null });
  });
  it("never mixes: an invalid response leaves products, offers and settings from the previous snapshot", async () => {
    const good = sheet({ products: [product(1)], settings: [["WhatsApp number", "919876543210"]] });
    const bad = sheet({ products: [product(1), product(1)], settings: [["WhatsApp number", "911111111111"]] });
    let body = good;
    const store = mk(async () => ok(body));
    await store.refresh();
    body = bad; // duplicate IDs: whole response rejected
    await expect(store.refresh()).rejects.toMatchObject({ kind: "structure" });
    expect(store.getState().snapshot!.settings.whatsapp).toBe("919876543210");
    expect(store.getState().snapshot!.products).toHaveLength(1);
  });
});

describe("races", () => {
  const deferred = () => {
    let resolve!: (r: Response) => void;
    const promise = new Promise<Response>((r) => (resolve = r));
    return { promise, resolve };
  };
  it("shares one in-flight request between callers", async () => {
    const fetch = vi.fn(async () => ok(csv()));
    const store = mk(fetch);
    const [a, b] = await Promise.all([store.refresh(), store.refresh()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
  it("an older response arriving late never overwrites a newer snapshot", async () => {
    const slow = deferred(), fast = deferred();
    const queue = [slow, fast];
    const store = mk(() => queue.shift()!.promise);
    const first = store.refresh();
    const second = store.refresh({ force: true });
    fast.resolve(ok(csv(1, { price: "₹300.00" })));
    await second;
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(30000);
    slow.resolve(ok(csv(1, { price: "₹100.00" })));
    await first; // resolves with its own data…
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(30000); // …but is not applied
  });
  it("an older failure does not mask a newer success", async () => {
    const slow = deferred(), fast = deferred();
    const queue = [slow, fast];
    const store = mk(() => queue.shift()!.promise);
    const first = store.refresh().catch(() => "failed");
    const second = store.refresh({ force: true });
    fast.resolve(ok(csv()));
    await second;
    slow.resolve(ok("<html></html>"));
    expect(await first).toBe("failed");
    expect(store.getState()).toMatchObject({ phase: "ready", stale: false, error: null });
  });
  it("force always starts a new request", async () => {
    const fetch = vi.fn(async () => ok(csv()));
    const store = mk(fetch);
    await Promise.all([store.refresh(), store.refresh({ force: true })]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("holds back background results during checkout and applies them afterwards", async () => {
    const bg = deferred();
    const queue: Promise<Response>[] = [Promise.resolve(ok(csv(1, { price: "₹100.00" }))), bg.promise, Promise.resolve(ok(csv(1, { price: "₹200.00" })))];
    const store = mk(() => queue.shift()!);
    await store.refresh();
    const background = store.refresh(); // starts the second (pending) request
    store.lock();
    const forced = await store.refreshForCheckout(); // third request: the checkout's own data
    expect(forced.products[0].pricePaise).toBe(20000);
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(20000);
    bg.resolve(ok(csv(1, { price: "₹999.00" }))); // an older background response finishes mid-checkout
    await background;
    store.unlock();
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(20000);
  });
});

describe("checkout lock", () => {
  it("a background result that arrives after the checkout's own data waits until unlock", async () => {
    const prices = ["₹100.00", "₹200.00", "₹300.00"];
    const store = mk(async () => ok(csv(1, { price: prices.shift() })));
    await store.refresh();
    store.lock();
    await store.refreshForCheckout();
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(20000);
    await store.refresh(); // newer background fetch finishes mid-checkout
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(20000);
    store.unlock();
    expect(store.getState().snapshot!.products[0].pricePaise).toBe(30000);
  });
});

describe("polling and tab visibility", () => {
  it("fetches on start and then about every 60 seconds while visible", async () => {
    const fetch = vi.fn(async () => ok(csv()));
    const { env } = fakeEnv();
    const store = mk(fetch, { env });
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(fetch).toHaveBeenCalledTimes(3);
    store.stop();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not poll while the tab is hidden, and refreshes on return when data is older than 60 s", async () => {
    const fetch = vi.fn(async () => ok(csv()));
    const t = fakeEnv();
    const store = mk(fetch, { env: t.env });
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    t.hide();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 5);
    expect(fetch).toHaveBeenCalledTimes(1);
    t.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    store.stop();
  });
  it("does not refetch on return when the data is still fresh", async () => {
    const fetch = vi.fn(async () => ok(csv()));
    const t = fakeEnv();
    const store = mk(fetch, { env: t.env });
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    t.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    store.stop();
  });
  it("a failed background refresh never throws out of the timer", async () => {
    let n = 0;
    const store = mk(async () => { if (n++) throw new TypeError("offline"); return ok(csv()); }, { env: fakeEnv().env });
    store.start();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 2);
    expect(store.getState()).toMatchObject({ phase: "ready", stale: true });
    store.stop();
  });
});

describe("cache", () => {
  const entry = (over: Record<string, unknown> = {}, snapshot = parseSheet(csv(3)).snapshot) => ({
    schema: 2, spreadsheetId: "SHEET", fetchedAt: Date.now() - 5000, snapshot, ...over,
  });
  const withCache = (value: unknown, fetch = async () => ok(csv())) => {
    const storage = new MemoryStorage();
    storage.setItem(CACHE_KEY, typeof value === "string" ? value : JSON.stringify(value));
    return { storage, store: new SheetStore({ fetch, storage, spreadsheetId: "SHEET", url: "u" }) };
  };
  it("starts from a valid cache as stale data, and replaces it on fetch", async () => {
    const { store, storage } = withCache(entry());
    expect(store.getState()).toMatchObject({ phase: "ready", stale: true });
    expect(store.getState().snapshot!.products).toHaveLength(3);
    await store.refresh();
    expect(store.getState()).toMatchObject({ stale: false });
    expect(store.getState().snapshot!.products).toHaveLength(2);
    expect(JSON.parse(storage.getItem(CACHE_KEY)!).snapshot.products).toHaveLength(2);
  });
  it("with a cache and a failing fetch it stays browsable but flagged", async () => {
    const { store } = withCache(entry(), async () => { throw new TypeError("offline"); });
    await expect(store.refresh()).rejects.toBeTruthy();
    expect(store.getState()).toMatchObject({ phase: "ready", stale: true });
    expect(store.getState().error?.kind).toBe("network");
  });
  it.each([
    ["malformed JSON", "{not json"],
    ["wrong schema", entry({ schema: 1 })],
    ["other spreadsheet", entry({ spreadsheetId: "OLD-SHEET" })],
    ["future timestamp", entry({ fetchedAt: Date.now() + 3_600_000 })],
    ["ancient timestamp", entry({ fetchedAt: Date.now() - 90 * 86_400_000 })],
    ["non-numeric timestamp", entry({ fetchedAt: "yesterday" })],
    ["NaN-like timestamp", entry({ fetchedAt: null })],
    ["tampered price", (() => { const e = entry(); (e.snapshot.products[0] as any).pricePaise = -5; return e; })()],
    ["duplicate IDs", (() => { const e = entry(); e.snapshot.products[1].id = e.snapshot.products[0].id; return e; })()],
    ["array", []],
  ])("discards an unusable cache: %s", (_name, value) => {
    const { store, storage } = withCache(value as unknown);
    expect(store.getState()).toMatchObject({ phase: "loading", snapshot: null });
    expect(storage.getItem(CACHE_KEY)).toBeNull();
  });
  it("survives unavailable storage and quota errors", async () => {
    const throwing = { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("quota"); }, removeItem: () => { throw Error("denied"); } };
    const store = new SheetStore({ fetch: async () => ok(csv()), storage: throwing, spreadsheetId: "SHEET", url: "u" });
    expect(store.getState().phase).toBe("loading");
    await store.refresh();
    expect(store.getState().phase).toBe("ready");
    expect(new SheetStore({ fetch: async () => ok(csv()), storage: null }).getState().phase).toBe("loading");
  });
  it("stores catalogue data only", async () => {
    const storage = new MemoryStorage();
    await new SheetStore({ fetch: async () => ok(csv()), storage, spreadsheetId: "SHEET", url: "u" }).refresh();
    expect(Object.keys(JSON.parse(storage.getItem(CACHE_KEY)!)).sort()).toEqual(["fetchedAt", "schema", "snapshot", "spreadsheetId"]);
  });
});
