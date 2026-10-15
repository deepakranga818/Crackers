"""Read-only Excel extraction. Explicit row mapping; fail closed, never drop rows."""
import csv, json, hashlib, sys, os
from pathlib import Path
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
def atomic_write(path,text):
    temporary=path.with_name(path.name+f'.{os.getpid()}.tmp')
    temporary.write_text(text,encoding='utf-8');temporary.replace(path)
CATEGORIES = {'sparklers':'Sparklers / Phuljadi','spinners':'Ground Spinners / Chakkar','pots':'Flower Pots / Anar','rockets':'Rockets','shots':'Sky Shots','sound':'Sound Crackers / Bombs','strings':'Strings / Laddi','pop':'Pop-ups','review':'More products'}

def extract(path):
    if Path(path).suffix=='.csv':
        rows=list(csv.reader(Path(path).read_text(encoding='utf-8').splitlines(keepends=True)))
        header=['No.','Product / Item Name','Category','Selling Price','Image Link','Order']
        positions=[i for i,row in enumerate(rows) if all(row.count(name)==1 for name in header)]
        if len(positions)!=1:raise ValueError('Unexpected Google Sheet headers')
        source_header=rows[positions[0]]
        result=[]
        for i,row in enumerate(rows):
            if i<=positions[0] or not any(cell.strip() for cell in row):continue
            fields=[row[source_header.index(name)] for name in header]
            if fields[0].strip().isdigit():fields[0]=float(fields[0])
            fields.append(row[source_header.index('MRP')] if 'MRP' in source_header else None)
            result.append((i+1,fields))
        return result
    sheet = openpyxl.load_workbook(path, data_only=True).active
    if list(next(sheet.values)[:6]) != ['No.','Product / Item Name','Category','Selling Price','Image Link','Order']:
        raise ValueError('Unexpected spreadsheet headers; review importer before proceeding')
    return [(i,list(row[:6])) for i,row in enumerate(sheet.values,1) if i>1 and any(v is not None for v in row[:6])]

def run():
    path = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'source/google-sheet.csv'
    rows = extract(path)
    metadata=json.loads((ROOT/'source/google-sheet-meta.json').read_text(encoding='utf-8')) if path.suffix=='.csv' else {}
    contact = 'Contact no - '+metadata['contact'] if metadata else openpyxl.load_workbook(path,data_only=True).active['G1'].value
    if contact != 'Contact no - 9992230740':
        raise ValueError('Seller contact changed; reconcile central business configuration before import')
    mapping = json.loads((ROOT/'source/category-map.json').read_text())
    overrides = json.loads((ROOT/'source/product-overrides.json').read_text())
    assets = json.loads((ROOT/'source/image-manifest.json').read_text())
    provenance=json.loads((ROOT/'source/image-provenance.json').read_text()) if (ROOT/'source/image-provenance.json').exists() else None
    products, report, errors, seen = [], [], [], set()
    for row_no, row in rows:
        issues=[]
        number, name, category, price, links, _ = row[:6]
        mrp=row[6] if len(row)>6 else None
        mrp_paise=None
        if mrp not in [None,'']:
            try:
                value=Decimal(str(mrp))*100
                if not value.is_finite() or value<=0 or value!=value.to_integral_value():raise InvalidOperation
                mrp_paise=int(value)
            except (InvalidOperation,ValueError,TypeError):issues.append('Invalid source MRP')
        identity = f'dc-{int(number):03d}' if isinstance(number,(int,float)) and int(number)==number else f'invalid-row-{row_no}'
        if identity in seen: issues.append('Duplicate ID')
        seen.add(identity)
        if not isinstance(name,str) or not name.strip(): issues.append('Missing product name')
        entry=mapping.get(identity,{})
        if entry.get('expectedName')!=name or entry.get('expectedCategory')!=category or entry.get('categoryId') not in CATEGORIES:
            issues.append('Missing or stale explicit category mapping')
        try:
            paise = Decimal(str(price))*100
            if not paise.is_finite() or paise<=0 or paise!=paise.to_integral_value() or paise>100000000:
                raise InvalidOperation
            paise=int(paise)
        except (InvalidOperation,ValueError,TypeError):
            paise=None; issues.append('Invalid selling price')
        source_links=str(links or '').splitlines()
        for link in source_links:
            parsed=urlparse(link)
            if parsed.scheme!='https' or parsed.hostname!='prnt.sc' or not parsed.path.strip('/') or parsed.username:
                issues.append(f'Malformed or unsupported image link: {link}')
        override=overrides.get(identity,{})
        if override.get('sellingUnit') is not None and (not isinstance(override['sellingUnit'],str) or not override['sellingUnit'].strip()): issues.append('Invalid selling unit override')
        if override.get('stockQuantity') is not None and (type(override['stockQuantity']) is not int or override['stockQuantity']<0): issues.append('Invalid stock quantity override')
        if not isinstance(override.get('verifiedSpecifications',[]),list) or not all(isinstance(s,str) for s in override.get('verifiedSpecifications',[])): issues.append('Invalid verified specifications override')
        local_images=[asset for asset in assets.get(identity,[]) if provenance is None or provenance.get(asset) in source_links]
        for asset in local_images:
            if not asset.startswith('images/') or '..' in asset or not (ROOT/'public'/asset).is_file(): issues.append('Missing or unsafe local image asset')
        category_id=entry.get('categoryId','review')
        product={'id':identity,'sourceRowNumber':row_no,'sourceNumber':number,'name':name or '(Missing name)','originalCategory':category,'categoryId':category_id,'categoryLabel':CATEGORIES.get(category_id,CATEGORIES['review']),'variantLabel':entry.get('variantLabel'),'pricePaise':paise,'sellingUnit':override.get('sellingUnit'),'packDetails':entry.get('packDetails'),'images':local_images,'sourceImageLinks':source_links,'availability':override.get('availability','unknown'),'stockQuantity':override.get('stockQuantity'),'maxQuantityPerRequest':override.get('maxQuantityPerRequest',99),'verifiedSpecifications':override.get('verifiedSpecifications',[]),'certificationDetails':override.get('certificationDetails'),'enabled':not issues and override.get('enabled',True),'categoryReviewed':entry.get('reviewed',False),'displayOrder':row_no,'importIssues':issues}
        product['mrpPaise']=mrp_paise
        if product['availability'] not in ['unknown','available','unavailable']: issues.append('Invalid availability')
        if not isinstance(product['maxQuantityPerRequest'],int) or not 1<=product['maxQuantityPerRequest']<=999: issues.append('Invalid quantity limit')
        product['enabled']=product['enabled'] and not issues
        products.append(product)
        warnings=issues+(['Category requires seller review'] if not product['categoryReviewed'] else [])+(['Selling unit unconfirmed'] if not product['sellingUnit'] else [])+(['Image missing; original asset required'] if not local_images else [])
        report.append(f"- {identity} | Excel row {row_no} | {name} | {category} → {product['categoryLabel']} | ₹{price}: {'; '.join(warnings) or 'OK'}")
        errors.extend(f'Row {row_no}: {issue}' for issue in issues)
    expected_count=metadata.get('rowCount',46)
    if len(products)!=expected_count: errors.append(f'Expected {expected_count} source rows, found {len(products)}')
    if not set(p['id'] for p in products).issubset(mapping): errors.append('New source IDs require explicit category mapping')
    version=hashlib.sha256(json.dumps(products,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    version=hashlib.sha256(json.dumps({'products':products,'offers':metadata.get('offers',{})},sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    atomic_write(ROOT/'src/products.json',json.dumps({'version':version,'source':metadata,'offers':metadata.get('offers',{'labels':[],'tiers':[]}),'products':products},ensure_ascii=False,indent=2))
    source_label='Google Sheet' if metadata else 'Excel archive'
    source_note=f"Source: {metadata.get('url',str(path))}. Fetched: {metadata.get('fetchedAt','historical archive')}."
    atomic_write(ROOT/'reports/import-report.md','# Spreadsheet import audit\n\n'+f'{source_label}: {len(products)} rows; version {version}. Blank Order cells are ignored; no inventory inferred. Seller contact: 9992230740. {source_note}\n\n'+'\n'.join(report).replace('Excel row',source_label+' row')+'\n\n## Blocking import errors\n'+('\n'.join(errors) or 'None. Unconfirmed units and category reviews still block production ordering.'))
    print(f'Imported {len(products)} rows; {len(errors)} errors; version {version}')
    if errors: sys.exit(1)

if __name__=='__main__': run()
