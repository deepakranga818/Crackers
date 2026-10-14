# GitHub-connected hosting

Do not use GitHub Pages for this commercial project. [GitHub's Pages terms](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) say Pages is not for sites "primarily directed at either facilitating commercial transactions".

## Current hosting status (14 October 2026)

- **Source code:** stays on GitHub, `deepakranga818/Crackers`.
- **Legacy preview:** before this was resolved, a catalogue-only preview (ordering off, noindex) was published to GitHub Pages. `.github/workflows/pages.yml` is now manual-only and runs `scripts/check-publication.mjs` first, so it cannot redeploy until every item in `source/verification.json` (including `hostApproval`) and `source/publication-approval.json` holds a real reference. To take the existing preview down: repository Settings → Pages → Unpublish site (owner action).
- **Prepared alternative:** `netlify.toml` builds from the GitHub repo, runs the same gate and sets security headers; other static hosts (for example Cloudflare Pages) can use the same `npm run build` and `dist`. Netlify's [Acceptable Use Policy](https://www.netlify.com/legal/acceptable-use-policy/) requires lawful use and has no fireworks category; Cloudflare's [terms](https://www.cloudflare.com/policies/terms/) are likewise a general lawful-use clause. Neither is an approval. `hostApproval` stays unverified until the chosen host confirms in writing that this category is acceptable and the seller has legal clearance for the location.
- **Public ordering:** off. `orderingEnabled` is false, every verification item is unverified, and ordering can only be exercised locally with `npm run dev:demo`.

## Provider terms checked on 14 October 2026

Netlify is a technically suitable candidate for this static Vite build and GitHub integration. Its [Acceptable Use Policy](https://www.netlify.com/legal/acceptable-use-policy/) requires lawful use; it does not explicitly grant permission for this fireworks business. Its [Self-Serve Subscription Agreement](https://www.netlify.com/pdf/self-serve-subscription-agreement.pdf/) sections 2.4 and 2.6 require compliance with policy and applicable law. The reviewed policy contains no explicit fireworks category approval. Because online fireworks ordering is legally restricted and the seller’s location is unknown, **we cannot certify this use is permitted**. Obtain confirmation from the host for the actual category/use and applicable legal clearance before deployment. Do not interpret absence of an explicit category ban as approval.

[Vercel’s current Acceptable Use Policy](https://vercel.com/legal/acceptable-use-policy) also prohibits unlawful use and facilitation of illegal goods. It is not a workaround for the legal blocker. Host terms are subject to change and must be rechecked at launch.

## Repository preparation

The source is prepared for `https://github.com/deepakranga818/Crackers.git`. If repeating setup in a fresh checkout, inspect remote contents before pushing; never overwrite an existing repository blindly.

```powershell
git clone https://github.com/deepakranga818/Crackers.git
cd Crackers
python -m pip install -r requirements.txt
npm ci
npm test
npm run build
```

For a new, empty remote and a prepared local repository:

```powershell
git remote add origin https://github.com/deepakranga818/Crackers.git
git add .
git commit -m "Build verified-source Diwali catalogue and gated request flow"
git push -u origin main
```

Git Credential Manager may require owner sign-in. Do not put tokens in commands, files or documentation. Verify the pushed branch/revision. Dependency lockfile is tracked; generated product JSON and reports are tracked for review.

## Deployment after permission is established

1. Obtain legal clearance for the actual public catalogue and separately for any online-ordering behaviour. Confirm host acceptance for this product category/use. Record only non-sensitive review references in `source/publication-approval.json`.
2. Set publicCatalogueVerified true in the manifest after real verification, fill reviewDate, hostApprovalReference and legalReviewReference. Keep orderingEnabled false. Update `src/business.ts` accordingly; do not turn on ordering without the additional launch checklist.
3. In Netlify, choose Import an existing project → GitHub → the Crackers repository and main branch. Do not allow previews to publish while approval is unresolved; noindex is not access control. Use provider access protection for staging, or keep testing local.
4. Use the committed `netlify.toml`. Build installs Python extraction dependencies, runs `npm run build`, then runs the publication gate. Output is `dist`; Node 24/Python 3.12 are declared. If the provider no longer supplies the Python version, choose a currently supported runtime and retest before launch.
5. Review deploy output, asset paths, security headers, refresh handling, keyboard/mobile layouts and exact data. No request or payment is sent by build.
6. Connect the real domain. Configure title, description, canonical and a real licensed OG image in business.ts; add sitemap for the actual single-page canonical if needed. Keep demo/staging noindex. Remove noindex from index.html, robots.txt and hosting headers only for the approved public environment.
7. Verify production has no demo fixture and ordering controls remain absent unless specifically cleared. Test WhatsApp on actual supported devices only if ordering is approved; never send a test request to the seller without coordination.

## Updates and rollback

Edit the authoritative Google Sheet/config, run npm run sync, inspect reports and diff, run tests/build, commit and push. Existing static deployments require redeployment after Sheet changes. GitHub triggers the configured host build. Roll back via the provider’s previous approved deployment and revert the offending Git commit. For an urgent ordering pause, set orderingEnabled false, build/test and redeploy. Cached already-open clients can remain stale: seller must always reconfirm prices and availability. There is no service worker or offline checkout.
