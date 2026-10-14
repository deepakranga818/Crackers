"""Fetch the owner's specific read-only sheet; never silently fall back to old data."""
import csv,hashlib,io,json,re,urllib.request,os
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SHEET_ID='1T21rN-iyxcuJyIyYxU-ARjhnqwDrMSRVWH8Z_wWpI2E'
GID='1949134617'
SOURCE_URL=f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}'
EXPORT_URL=f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}'
def atomic_write(path,text):
    temporary=path.with_name(path.name+f'.{os.getpid()}.tmp')
    temporary.write_text(text,encoding='utf-8');temporary.replace(path)

def parse_sheet(text):
    rows=list(csv.reader(io.StringIO(text)))
    header=['No.','Product / Item Name','Category','Selling Price','Image Link','Order']
    matches=[i for i,row in enumerate(rows) if all(row.count(name)==1 for name in header)]
    if len(matches)!=1:raise ValueError('Missing or ambiguous catalogue headers in Google Sheet')
    position=matches[0]
    prefix='\n'.join(cell for row in rows[:position] for cell in row if cell.strip())
    phones=re.findall(r'(?:Mob\s*no|Contact\s*no)\s*-?\s*(\d{10})',prefix,re.I)
    if phones!=['9992230740']:raise ValueError('Seller contact missing or changed; reconcile business config')
    offer_text=re.sub(r'(?:Mob\s*no|Contact\s*no)\s*-?\s*\d{10}','',prefix,flags=re.I)
    labels=[' '.join(line.split()) for line in offer_text.splitlines() if line.strip()]
    tiers=[]
    for label in labels:
        match=re.fullmatch(r'(?:Coupon\s+code\s*-\s*([A-Z0-9_]+)\s*-\s*)?(\d+)%\s+off\s+(upto|above)\s+(\d+)',label,re.I)
        if not match:raise ValueError(f'Unsupported offer text needs review: {label}')
        coupon,percentage,kind,limit=match.groups()
        if not 0<int(percentage)<=100:raise ValueError('Invalid offer percentage')
        tiers.append({'maxSubtotalPaise':None if kind.lower()=='above' else int(limit)*100,'basisPoints':int(percentage)*100,'couponCode':coupon.upper() if coupon else None,'sourceLabel':label,'sourceBoundaryPaise':int(limit)*100})
    if tiers:
        if len(tiers)<2 or tiers[-1]['maxSubtotalPaise'] is not None:raise ValueError('Offer tiers must finish with an above-threshold band')
        bounds=[tier['maxSubtotalPaise'] for tier in tiers[:-1]]
        if any(value is None for value in bounds) or bounds!=sorted(set(bounds)) or tiers[-1]['sourceBoundaryPaise']!=bounds[-1]:raise ValueError('Overlapping or unclear offer boundaries require owner review')
    products=[(i+1,row) for i,row in enumerate(rows) if i>position and any(cell.strip() for cell in row)]
    if not products:raise ValueError('Empty Google Sheet catalogue')
    return {'headerRow':position+1,'contact':'9992230740','offers':{'labels':labels,'tiers':tiers},'rowCount':len(products)}

def sync():
    with urllib.request.urlopen(EXPORT_URL,timeout=30) as response:
        if 'text/csv' not in response.headers.get('Content-Type',''):raise ValueError('Sheet did not return CSV; check read access')
        data=response.read(2_000_001)
    if len(data)>2_000_000:raise ValueError('Sheet exceeds import size limit')
    text=data.decode('utf-8-sig').replace('\r\n','\n')
    metadata=parse_sheet(text)
    metadata.update({'url':SOURCE_URL,'gid':GID,'sha256':hashlib.sha256(data).hexdigest(),'fetchedAt':datetime.now(timezone.utc).isoformat()})
    atomic_write(ROOT/'source/google-sheet.csv',text)
    atomic_write(ROOT/'source/google-sheet-meta.json',json.dumps(metadata,ensure_ascii=False,indent=2))
    print(f"Synced Google Sheet: {metadata['rowCount']} products; offers: {', '.join(metadata['offers']['labels'])}")

if __name__=='__main__':sync()
