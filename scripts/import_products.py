"""Read-only Excel extraction. Explicit row mapping; fail closed, never drop rows."""
import json, hashlib, sys
from pathlib import Path
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {'sparklers':'Sparklers / Phuljadi','spinners':'Ground Spinners / Chakkar','pots':'Flower Pots / Anar','rockets':'Rockets','shots':'Sky Shots','sound':'Sound Crackers / Bombs','strings':'Strings / Laddi','pop':'Pop-ups','review':'Other / Needs Review'}

def extract(path):
    sheet = openpyxl.load_workbook(path, data_only=True).active
    if list(next(sheet.values)[:6]) != ['No.','Product / Item Name','Category','Selling Price','Image Link','Order']:
        raise ValueError('Unexpected spreadsheet headers; review importer before proceeding')
    return [(i,list(row[:6])) for i,row in enumerate(sheet.values,1) if i>1 and any(v is not None for v in row[:6])]

def run():
    path = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'source/Diwali_Cracker.xlsx'
    rows = extract(path)
    contact = openpyxl.load_workbook(path,data_only=True).active['G1'].value
    if contact != 'Contact no - 9992230740':
        raise ValueError('Seller contact changed; reconcile central business configuration before import')
    mapping = json.loads((ROOT/'source/category-map.json').read_text())
    overrides = json.loads((ROOT/'source/product-overrides.json').read_text())
    assets = json.loads((ROOT/'source/image-manifest.json').read_text())
    products, report, errors, seen = [], [], [], set()
    for row_no, row in rows:
        number, name, category, price, links, _ = row
        issues=[]
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
        local_images=assets.get(identity,[])
        for asset in local_images:
            if not asset.startswith('images/') or '..' in asset or not (ROOT/'public'/asset).is_file(): issues.append('Missing or unsafe local image asset')
        category_id=entry.get('categoryId','review')
        product={'id':identity,'sourceRowNumber':row_no,'sourceNumber':number,'name':name or '(Missing name)','originalCategory':category,'categoryId':category_id,'categoryLabel':CATEGORIES.get(category_id,CATEGORIES['review']),'variantLabel':entry.get('variantLabel'),'pricePaise':paise,'sellingUnit':override.get('sellingUnit'),'packDetails':entry.get('packDetails'),'images':local_images,'sourceImageLinks':source_links,'availability':override.get('availability','unknown'),'stockQuantity':override.get('stockQuantity'),'maxQuantityPerRequest':override.get('maxQuantityPerRequest',99),'verifiedSpecifications':override.get('verifiedSpecifications',[]),'certificationDetails':override.get('certificationDetails'),'enabled':not issues and override.get('enabled',True),'categoryReviewed':entry.get('reviewed',False),'displayOrder':row_no,'importIssues':issues}
        if product['availability'] not in ['unknown','available','unavailable']: issues.append('Invalid availability')
        if not isinstance(product['maxQuantityPerRequest'],int) or not 1<=product['maxQuantityPerRequest']<=999: issues.append('Invalid quantity limit')
        product['enabled']=product['enabled'] and not issues
        products.append(product)
        warnings=issues+(['Category requires seller review'] if not product['categoryReviewed'] else [])+(['Selling unit unconfirmed'] if not product['sellingUnit'] else [])+(['Image missing; original asset required'] if not local_images else [])
        report.append(f"- {identity} | Excel row {row_no} | {name} | {category} → {product['categoryLabel']} | ₹{price}: {'; '.join(warnings) or 'OK'}")
        errors.extend(f'Row {row_no}: {issue}' for issue in issues)
    if len(products)!=46: errors.append(f'Expected 46 rows, found {len(products)}; review source changes explicitly')
    if set(mapping)!=set(p['id'] for p in products): errors.append('Mapping IDs do not match spreadsheet IDs')
    version=hashlib.sha256(json.dumps(products,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    (ROOT/'src/products.json').write_text(json.dumps({'version':version,'products':products},ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'reports/import-report.md').write_text('# Spreadsheet import audit\n\n'+f'{len(products)} rows; version {version}. Blank Order cells are ignored; no inventory inferred. Seller contact verified from G1: 9992230740.\n\n'+'\n'.join(report)+'\n\n## Blocking import errors\n'+('\n'.join(errors) or 'None. Unconfirmed units and category reviews still block ordering.'),encoding='utf-8')
    print(f'Imported {len(products)} rows; {len(errors)} errors; version {version}')
    if errors: sys.exit(1)

if __name__=='__main__': run()
