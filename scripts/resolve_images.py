"""Saves local copies of screenshot-page product images and writes public/images/index.json.

Why this exists: the sheet's Image links are often prnt.sc *pages* (HTML), not image files, and a
browser cannot read them cross-origin. This script resolves each page to its image once, downloads
and optimises it, and records `source URL -> local file` in public/images/index.json. The website
reads that index at runtime and uses a local copy ONLY for a URL that is still in the sheet cell.

  * Direct image URLs (…/photo.jpg, i.imgur.com, image.prntscr.com …) need none of this: the site
    shows them straight from the sheet.
  * A new screenshot-page link shows a placeholder and a "View photo" link until this script has
    run and the new files under public/images are published with the site.

Usage: npm run images [-- --dry-run]
No scraping proxy, credentials or access-control bypass: it fetches the same public pages a
visitor could open, from the machine you run it on.
"""
import argparse, concurrent.futures, csv, hashlib, html, io, json, os, re, sys, urllib.request
from pathlib import Path
from urllib.parse import urlparse, urljoin
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "images" / "index.json"
SPREADSHEET_ID = json.loads((ROOT / "sheet.config.json").read_text())["spreadsheetId"]
IMAGE_HOSTS = {"image.prntscr.com", "img.lightshot.app", "i.imgur.com"}
DIRECT_EXT = re.compile(r"\.(jpe?g|png|webp|gif|avif)$", re.I)

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true", help="Report what would be downloaded; write nothing")
args = parser.parse_args()


def get(url, limit=8_000_000):
    request = urllib.request.Request(url, headers={"User-Agent": "DiwaliCatalogueAssetAudit/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError(f"HTTP {response.status}")
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Asset exceeds 8 MB")
        return data, response.headers.get("Content-Type", "")


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def sheet_links():
    text, kind = get(f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv", 4_000_000)
    if "html" in kind.lower():
        sys.exit("The sheet returned a web page, not data: check that link sharing allows viewing.")
    rows = list(csv.reader(io.StringIO(text.decode("utf-8-sig"))))
    header = next((r for r in rows if "productid" in map(norm, r) and "imagelinks" in map(norm, r)), None)
    if header is None:
        sys.exit("Products header (Product ID … Image links) not found in the sheet.")
    column = [norm(c) for c in header].index("imagelinks")
    start = rows.index(header) + 1
    links = []
    for row in rows[start:]:
        if row and norm(row[0]) in ("couponsoffers", "shopsettings"):
            break
        if len(row) > column:
            for part in row[column].split():
                u = urlparse(part)
                if u.scheme == "https" and u.hostname and not u.username and part not in links:
                    links.append(part)
    return links


def load_known():
    """source URL -> local file, from the current index."""
    known = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    return {u: a for u, a in known.items() if (PUBLIC / a).exists()}


def download(url):
    page = get(url)[0].decode("utf-8", errors="replace")
    match = re.search(r'<img[^>]+class="[^"]*screenshot-image[^"]*"[^>]+src="([^"]+)"', page) or re.search(
        r'<img[^>]+src="([^"]+)"[^>]+class="[^"]*screenshot-image[^"]*"', page
    )
    if not match:
        raise ValueError("No accessible screenshot image on that page")
    direct = urljoin(url, html.unescape(match.group(1)))
    parsed = urlparse(direct)
    if parsed.scheme != "https" or parsed.hostname not in IMAGE_HOSTS or parsed.username:
        raise ValueError("Image is on an unapproved host")
    picture = Image.open(io.BytesIO(get(direct)[0]))
    picture.thumbnail((960, 960))
    asset = f"images/{hashlib.sha1(url.encode()).hexdigest()[:12]}.webp"
    (PUBLIC / "images").mkdir(exist_ok=True)
    picture.convert("RGB").save(PUBLIC / asset, "WEBP", quality=85)
    return asset


links = sheet_links()
known = load_known()
index, report = {}, []
todo = []
for url in links:
    host = urlparse(url).hostname
    if DIRECT_EXT.search(urlparse(url).path) or host in IMAGE_HOSTS:
        report.append(f"- {url}: direct image URL; the site shows it straight from the sheet")
    elif url in known:
        index[url] = known[url]
        report.append(f"- {url}: reused {known[url]}")
    else:
        todo.append(url)


def attempt(url):
    try:
        return url, None if args.dry_run else download(url), None
    except Exception as error:  # reported, never fatal: the site falls back to a placeholder
        return url, None, f"{type(error).__name__}: {str(error)[:120]}"


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for url, asset, error in pool.map(attempt, todo):
        if asset:
            index[url] = asset
            report.append(f"- {url}: downloaded {asset}")
        else:
            report.append(f"- {url}: {'would download' if args.dry_run and not error else 'unavailable: ' + str(error)}")

if not args.dry_run:
    INDEX.parent.mkdir(exist_ok=True)
    tmp = INDEX.with_name(INDEX.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(dict(sorted(index.items())), indent=2) + "\n", encoding="utf-8")
    tmp.replace(INDEX)
print("\n".join(report))
print(f"\n{len(links)} link(s) in the sheet; {len(index)} have a local copy; {len(todo)} needed a download attempt.")
