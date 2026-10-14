"""Build-time import of user-supplied product images. No access-control bypass."""
import argparse, concurrent.futures, html, json, re, urllib.request,os
from pathlib import Path
from urllib.parse import urlparse, urljoin
from PIL import Image
from io import BytesIO
ROOT=Path(__file__).resolve().parents[1]
def atomic_write(path,text):
    temporary=path.with_name(path.name+f'.{os.getpid()}.tmp')
    temporary.write_text(text,encoding='utf-8');temporary.replace(path)
parser=argparse.ArgumentParser()
parser.add_argument('--rights-confirmed',action='store_true',help='Owner confirms rights to reuse all linked product images')
parser.add_argument('--download-supplied-images',action='store_true',help='Download workbook-linked images for the authorized local website; publication rights still require review')
parser.add_argument('--only-missing',action='store_true',help='Reuse files only when their recorded source URL still matches')
args=parser.parse_args()
products=json.loads((ROOT/'src/products.json').read_text(encoding='utf-8'))['products']
provenance=json.loads((ROOT/'source/image-provenance.json').read_text()) if (ROOT/'source/image-provenance.json').exists() else {}

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'DiwaliCatalogueAssetAudit/1.0'}),timeout=12) as response:
        if response.status!=200: raise ValueError(f'HTTP {response.status}')
        data=response.read(8_000_001)
        if len(data)>8_000_000: raise ValueError('Asset exceeds 8 MB')
        return data

def resolve(pair):
    product,index,url=pair
    status=''; asset=None
    try:
        existing=f'images/{product["id"]}-{index+1}.webp'
        if args.only_missing and provenance.get(existing)==url and (ROOT/'public'/existing).exists():
            return product['id'],url,'Reused local image; source URL unchanged',existing
        page=fetch(url).decode('utf-8',errors='replace')
        match=re.search(r'<img[^>]+class="[^"]*screenshot-image[^"]*"[^>]+src="([^"]+)"',page)
        if not match: match=re.search(r'<img[^>]+src="([^"]+)"[^>]+class="[^"]*screenshot-image[^"]*"',page)
        if not match: raise ValueError('No accessible screenshot image; original required')
        direct=urljoin(url,html.unescape(match.group(1))); parsed=urlparse(direct)
        if parsed.scheme!='https' or parsed.hostname not in ['image.prntscr.com','img.lightshot.app','i.imgur.com'] or parsed.username:
            raise ValueError('Unapproved image origin; manual review required')
        if not (args.rights_confirmed or args.download_supplied_images): status='Image origin resolved; run authorized local download or confirm publication reuse rights'
        else:
            picture=Image.open(BytesIO(fetch(direct)))
            picture.thumbnail((960,960))
            asset=f'images/{product["id"]}-{index+1}.webp'
            (ROOT/'public/images').mkdir(exist_ok=True)
            picture.convert('RGB').save(ROOT/'public'/asset,'WEBP',quality=85)
            status='Downloaded and optimized from supplied workbook; publication reuse rights still require review' if not args.rights_confirmed else 'Downloaded and optimized; owner reuse rights asserted'
    except Exception as error: status=f'Unavailable: {type(error).__name__}: {str(error)[:120]}'
    return product['id'],url,status,asset

jobs=[(p,i,url) for p in products for i,url in enumerate(p['sourceImageLinks'])]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=list(pool.map(resolve,jobs))
manifest=json.loads((ROOT/'source/image-manifest.json').read_text())
for identity,url,_,asset in results:
    if asset and asset not in manifest.setdefault(identity,[]): manifest[identity].append(asset)
    if asset:provenance[asset]=url
atomic_write(ROOT/'source/image-manifest.json',json.dumps(manifest,indent=2))
atomic_write(ROOT/'source/image-provenance.json',json.dumps(provenance,indent=2))
lines=['# Image asset report','',f'{len(jobs)} screenshot-page links audited. Runtime never loads these URLs.','', 'Photos imported from the user-supplied workbook for the authorized local website. Public reuse rights require owner confirmation before launch. Do not download captcha, blocked pages or generic site imagery as products.','']
lines += [f'- {identity}: {url} — {status}' for identity,url,status,_ in results]
lines += [f'- {p["id"]} ({p["name"]}): no source links; original image required' for p in products if not p['sourceImageLinks']]
(ROOT/'reports/image-report.md').write_text('\n'.join(lines),encoding='utf-8')
print(f'Audited {len(results)} links; {sum(r[2].startswith("Downloaded") for r in results)} downloads; {sum(r[2].startswith("Reused") for r in results)} reused')
