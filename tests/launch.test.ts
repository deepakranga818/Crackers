import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import checklist from "../source/verification.json";
import approval from "../source/publication-approval.json";
import { business, modeCopy } from "../src/business";
import { orderingAllowed, requiredVerifications } from "../src/pricing";
import { normalizeMobile, validateBuyer } from "../src/buyer";
import { emptyBuyer, type Business } from "../src/model";

// Checkout and publication safeguards that existed before the live-sheet change. They do not
// depend on catalogue data and must keep working.
const config: Business = {
  ...business,
  address: "Test only",
  orderingEnabled: true,
  privateAudience: false,
  publicCatalogueVerified: true,
  verification: Object.fromEntries(requiredVerifications.map((k) => [k, true])),
  fulfilment: [
    { id: "delivery", label: "Test delivery", type: "delivery", verified: true, chargePaise: null, servicePins: ["110001"] },
  ],
};
const buyer = {
  ...emptyBuyer,
  name: "दीपक रांगा",
  mobile: "+91 99922-30740",
  method: "delivery",
  address: "12 Test Road",
  locality: "Test area",
  city: "Delhi",
  state: "Delhi",
  pin: "110001",
  acknowledged: true,
};

describe("buyer validation", () => {
  it("accepts Indian scripts, normalizes mobile and checks service areas separately", () => {
    expect(validateBuyer(buyer, config)).toEqual({});
    expect(normalizeMobile("+91 99922-30740")).toBe("9992230740");
    expect(validateBuyer({ ...buyer, pin: "400001" }, config).pin).toContain("service area");
    expect(validateBuyer({ ...buyer, name: "   ", mobile: "123" }, config)).toHaveProperty("name");
  });
  it("requires no residential address for verified pickup", () => {
    expect(
      validateBuyer(
        { ...emptyBuyer, name: "Test Buyer", mobile: "9992230740", method: "pickup", acknowledged: true },
        { ...config, fulfilment: [{ ...config.fulfilment[0], id: "pickup", type: "pickup" }] },
      ),
    ).toEqual({});
  });
});

describe("launch verification", () => {
  const open = Object.values(checklist).some((i) => !(i.verified && i.reference));
  it("lists every required flag with its group and what it requires", () => {
    expect(Object.keys(checklist).sort()).toEqual([...requiredVerifications].sort());
    for (const item of Object.values(checklist)) {
      expect(["business-config", "licence", "legal", "product-certification", "hosting"]).toContain(item.group);
      expect(item.requires.length).toBeGreaterThan(20);
      if (item.verified) expect(item.reference).toBeTruthy();
    }
  });
  const gate = (manifest: object) => {
    const file = join(mkdtempSync(join(tmpdir(), "gate-")), "release.json");
    writeFileSync(file, JSON.stringify(manifest));
    try {
      execFileSync(process.execPath, ["scripts/check-publication.mjs", file], { stdio: "pipe" });
      return 0;
    } catch (e) {
      return (e as { status: number }).status;
    }
  };
  it("keeps public ordering and the public deploy gate closed while any item lacks evidence", () => {
    expect(open).toBe(true);
    expect(orderingAllowed({ ...business, privateAudience: false })).toBe(false);
    expect(business.publicCatalogueVerified).toBe(false);
    expect(Object.values(business.verification).some(Boolean)).toBe(false);
    expect(gate({ audience: "public", publicCatalogueVerified: false })).toBe(1);
    expect(
      gate({ audience: "public", publicCatalogueVerified: true, reviewDate: "2026-10-14", hostApprovalReference: "x", legalReviewReference: "y" }),
    ).toBe(1);
  });
  it("lets a private friends list order without claiming any verification", () => {
    expect(approval.audience).toBe("private-friends");
    expect(business.privateAudience).toBe(true);
    expect(orderingAllowed(business)).toBe(true);
    expect(gate({ audience: "private-friends" })).toBe(0);
    expect(approval.publicCatalogueVerified).toBe(false);
  });
  it("keeps page title, description and Open Graph metadata equal to the config", () => {
    const html = readFileSync("index.html", "utf8");
    const title = /<title>([^<]*)<\/title>/.exec(html)![1];
    const meta = (attr: string, name: string) =>
      new RegExp(`<meta[^>]*?${attr}="${name}"[^>]*?content="([^"]*)"`).exec(html)![1];
    expect(title).toBe(business.seo.title);
    expect(meta("name", "description")).toBe(business.seo.description);
    expect(meta("property", "og:title")).toBe(business.seo.title);
    expect(meta("property", "og:description")).toBe(business.seo.description);
    expect(html).toContain('content="noindex,nofollow"');
  });
});

describe("mode copy follows what a visitor can actually do", () => {
  it("promises ordering only when ordering is on, and never calls the list access-controlled", () => {
    const ordering = modeCopy(true);
    const browsing = modeCopy(false);
    expect(ordering.banner).toBe("For friends and family · seller confirms orders");
    expect(ordering.banner).not.toMatch(/private|restricted/i);
    expect(ordering.hero).toMatch(/send your selection to the seller on WhatsApp/);
    expect(browsing.hero).not.toMatch(/send your selection|WhatsApp/);
    expect(browsing.steps.flat().join(" ")).not.toMatch(/WhatsApp|cart|Send/i);
    for (const copy of [ordering, browsing])
      expect(JSON.stringify(copy)).not.toMatch(/development|needs review|source products|selling unit/i);
  });
});

describe("no catalogue data or hard-coded shop details in the app code", () => {
  const src = (f: string) => readFileSync(`src/${f}`, "utf8");
  const files = readdirSync("src", { recursive: true, withFileTypes: false }) as string[];
  const code = files.filter((f) => /\.(ts|tsx)$/.test(f.toString()));
  it("contains no WhatsApp number, brand name or product ID literals", () => {
    for (const f of code) {
      const text = src(f.toString());
      expect(text, f.toString()).not.toMatch(/9992230740|Diwali Collection/);
      expect(text, f.toString()).not.toMatch(/\bPRD-\d{4}\b|\bdc-\d{3}\b/);
    }
  });
  it("imports no bundled catalogue, category map or spreadsheet export", () => {
    for (const f of code) expect(src(f.toString()), f.toString()).not.toMatch(/products\.json|category-map|product-overrides|google-sheet\.csv|\.xlsx/);
    expect(existsSync("src/products.json")).toBe(false);
  });
  it("reads the spreadsheet from one place only", () => {
    const hits = code.filter((f) => /docs\.google\.com/.test(src(f.toString())));
    expect(hits.map(String).sort()).toEqual(["sheetConfig.ts"]);
  });
});

describe("test-only modes stay out of the production bundle", () => {
  // Needs a build (CI runs `npm run build` before the tests); skipped when dist/ does not exist.
  const dir = new URL("../dist/assets/", import.meta.url);
  it.skipIf(!existsSync(dir))("contains no local checkout demo, dry run or fixture code", () => {
    const js = readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(new URL(f, dir), "utf8"))
      .join("\n");
    for (const marker of ["Local checkout demo", "checkout-demo", "Dry run", "sample-pickup", "private-fixture", "Test fixture"])
      expect(js, marker).not.toContain(marker);
  });
});
