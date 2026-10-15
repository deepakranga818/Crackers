import type { Snapshot } from "../model";
import { SPREADSHEET_ID, sheetUrl } from "../sheetConfig";
import { SheetError, parseSheet, validateSnapshot, type Diagnostic } from "./parse";

export const CACHE_KEY = "diwali-sheet-v2";
const CACHE_SCHEMA = 2;
export const REFRESH_MS = 60_000;
const MAX_CACHE_AGE = 30 * 24 * 3600 * 1000;

export type SheetState = {
  phase: "loading" | "ready" | "error";
  snapshot: Snapshot | null;
  // When this website last fetched the data. It is not the date the sheet was edited.
  fetchedAt: number | null;
  // True while the data on screen has not been confirmed by the latest fetch (cached start-up
  // data, or the newest refresh failed).
  stale: boolean;
  refreshing: boolean;
  error: SheetError | null;
  diagnostics: Diagnostic[];
};

export type Env = {
  isVisible: () => boolean;
  onVisible: (cb: () => void) => () => void;
  onOnline: (cb: () => void) => () => void;
};
const browserEnv: Env = {
  isVisible: () => document.visibilityState === "visible",
  onVisible: (cb) => {
    const l = () => document.visibilityState === "visible" && cb();
    document.addEventListener("visibilitychange", l);
    return () => document.removeEventListener("visibilitychange", l);
  },
  onOnline: (cb) => {
    window.addEventListener("online", cb);
    return () => window.removeEventListener("online", cb);
  },
};

export type StoreOptions = {
  fetch?: typeof fetch;
  url?: string;
  spreadsheetId?: string;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now?: () => number;
  timeoutMs?: number;
  env?: Env;
};

export class SheetStore {
  private state: SheetState;
  private listeners = new Set<() => void>();
  private seq = 0; // id of the most recently started request
  private applied = 0; // id of the newest request whose result is on screen
  private inflight: Promise<Snapshot> | null = null;
  private inflightId = 0;
  private locks = 0;
  private held: { id: number; snapshot: Snapshot; diagnostics: Diagnostic[]; at: number } | null = null;
  private stops: (() => void)[] = [];
  private opts: Required<Omit<StoreOptions, "storage" | "env">> & Pick<StoreOptions, "storage" | "env">;

  constructor(o: StoreOptions = {}) {
    const id = o.spreadsheetId ?? SPREADSHEET_ID;
    this.opts = {
      fetch: o.fetch ?? ((...a) => fetch(...a)),
      url: o.url ?? sheetUrl(id),
      spreadsheetId: id,
      now: o.now ?? Date.now,
      timeoutMs: o.timeoutMs ?? 15_000,
      storage: o.storage === undefined ? safeLocalStorage() : o.storage,
      env: o.env,
    };
    const cached = this.readCache();
    this.state = cached
      ? { phase: "ready", snapshot: cached.snapshot, fetchedAt: cached.fetchedAt, stale: true, refreshing: false, error: null, diagnostics: [] }
      : { phase: "loading", snapshot: null, fetchedAt: null, stale: false, refreshing: false, error: null, diagnostics: [] };
  }

  getState = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<SheetState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- cache: the same data contract as a fresh fetch, never anything else ----
  private readCache(): { snapshot: Snapshot; fetchedAt: number } | null {
    const { storage, spreadsheetId, now } = this.opts;
    if (!storage) return null;
    try {
      const raw = storage.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      const t = now();
      if (
        !c ||
        c.schema !== CACHE_SCHEMA ||
        c.spreadsheetId !== spreadsheetId ||
        typeof c.fetchedAt !== "number" ||
        !Number.isFinite(c.fetchedAt) ||
        c.fetchedAt > t + 60_000 ||
        c.fetchedAt < t - MAX_CACHE_AGE
      )
        throw Error("incompatible cache");
      return { snapshot: validateSnapshot(c.snapshot), fetchedAt: c.fetchedAt };
    } catch {
      try {
        storage.removeItem(CACHE_KEY);
      } catch {
        /* storage unavailable */
      }
      return null;
    }
  }
  private writeCache(snapshot: Snapshot, fetchedAt: number) {
    try {
      this.opts.storage?.setItem(
        CACHE_KEY,
        JSON.stringify({ schema: CACHE_SCHEMA, spreadsheetId: this.opts.spreadsheetId, fetchedAt, snapshot }),
      );
    } catch {
      /* quota or private mode: the cache is only an optimisation */
    }
  }

  // ---- fetching ----
  private async load(signal: AbortSignal): Promise<{ snapshot: Snapshot; diagnostics: Diagnostic[] }> {
    let res: Response;
    try {
      res = await this.opts.fetch(this.opts.url, { cache: "no-store", credentials: "omit", redirect: "follow", signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new SheetError("timeout", "The sheet took too long to respond.");
      // A private sheet redirects to a sign-in page that browsers refuse to read cross-origin,
      // which looks the same as being offline.
      throw new SheetError("network", "Could not reach the sheet.");
    }
    if (res.status === 401 || res.status === 403 || res.status === 404)
      throw new SheetError("access", `The sheet is not available to the public (HTTP ${res.status}).`);
    if (!res.ok) throw new SheetError("network", `The sheet service returned HTTP ${res.status}.`);
    if (/html/i.test(res.headers.get("content-type") ?? ""))
      throw new SheetError("access", "Received a web page instead of sheet data (sign-in or permission page).");
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new SheetError("timeout", "The sheet took too long to respond.");
      throw new SheetError("network", "The sheet response was interrupted.");
    }
    return parseSheet(text);
  }

  /**
   * Fetches, validates and (if still the newest) applies a snapshot. Without `force`, an
   * in-flight request is shared. `force` always starts a new request; it is used before checkout.
   * Resolves with the snapshot this very request fetched; rejects with SheetError.
   */
  refresh({ force = false }: { force?: boolean } = {}): Promise<Snapshot> {
    if (this.inflight && !force) return this.inflight;
    const id = ++this.seq;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    this.set({ refreshing: true });
    const run = (async () => {
      try {
        const { snapshot, diagnostics } = await this.load(controller.signal);
        const at = this.opts.now();
        this.accept(id, snapshot, diagnostics, at);
        return snapshot;
      } catch (e) {
        const error = e instanceof SheetError ? e : new SheetError("network", "Unexpected error while loading the sheet.");
        // Only the newest request's failure is reported; an older failure must not mask a newer success.
        if (id === this.seq) this.fail(error);
        throw error;
      } finally {
        clearTimeout(timer);
        if (this.inflightId === id) this.inflight = null;
        if (id === this.seq) this.set({ refreshing: false });
      }
    })();
    this.inflight = run;
    this.inflightId = id;
    run.catch(() => {}); // callers handle rejections; avoid unhandled-rejection noise for background refreshes
    return run;
  }

  private accept(id: number, snapshot: Snapshot, diagnostics: Diagnostic[], at: number) {
    if (id < this.applied) return; // a newer response is already on screen
    if (this.locks > 0 && !this.forcedIds.has(id)) {
      if (!this.held || id > this.held.id) this.held = { id, snapshot, diagnostics, at };
      return;
    }
    this.applied = id;
    this.writeCache(snapshot, at);
    this.set({ phase: "ready", snapshot, fetchedAt: at, stale: false, error: null, diagnostics });
    if (diagnostics.length) console.warn("[sheet] diagnostics", diagnostics);
  }
  private fail(error: SheetError) {
    if (error.diagnostics.length) console.warn("[sheet] rejected", error.message, error.diagnostics);
    if (this.state.snapshot) this.set({ stale: true, error });
    else this.set({ phase: "error", error });
  }

  // Checkout: while a checkout attempt is running, results of background refreshes are held back
  // so the snapshot being reviewed cannot change underneath it. A forced fetch is the attempt's
  // own and applies immediately.
  private forcedIds = new Set<number>();
  refreshForCheckout(): Promise<Snapshot> {
    const p = this.refresh({ force: true });
    this.forcedIds.add(this.seq);
    return p.finally(() => {
      this.forcedIds.clear();
    });
  }
  lock() {
    this.locks++;
  }
  unlock() {
    this.locks = Math.max(0, this.locks - 1);
    if (this.locks === 0 && this.held) {
      const h = this.held;
      this.held = null;
      this.accept(h.id, h.snapshot, h.diagnostics, h.at);
    }
  }

  // ---- background refresh while the page is open ----
  start() {
    this.stop();
    const env = this.opts.env ?? browserEnv;
    const age = () => (this.state.fetchedAt === null ? Infinity : this.opts.now() - this.state.fetchedAt);
    const maybe = () => {
      if (env.isVisible() && age() >= REFRESH_MS - 1000) void this.refresh().catch(() => {});
    };
    void this.refresh().catch(() => {});
    const timer = setInterval(maybe, REFRESH_MS);
    this.stops = [() => clearInterval(timer), env.onVisible(maybe), env.onOnline(() => void this.refresh().catch(() => {}))];
  }
  stop() {
    this.stops.forEach((s) => s());
    this.stops = [];
  }
}

function safeLocalStorage(): StoreOptions["storage"] {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
