import csv, json, shutil, subprocess, tempfile, unittest, importlib.util
from pathlib import Path
import openpyxl

ROOT=Path(__file__).resolve().parents[1]

class ImportTests(unittest.TestCase):
    def test_every_source_value_matches_generated_catalogue(self):
        source=list(csv.reader((ROOT/'source/google-sheet.csv').read_text(encoding='utf-8').splitlines(keepends=True)))
        data=json.loads((ROOT/'src/products.json').read_text(encoding='utf-8'))['products']
        self.assertEqual(len(data),46)
        for p in data:
            row=p['sourceRowNumber']
            header=next(row for row in source if 'Product / Item Name' in row)
            self.assertEqual(p['name'],source[row-1][header.index('Product / Item Name')])
            self.assertEqual(p['originalCategory'],source[row-1][header.index('Category')])
            self.assertEqual(p['pricePaise'],round(float(source[row-1][header.index('Selling Price')])*100))
        self.assertEqual(json.loads((ROOT/'source/google-sheet-meta.json').read_text())['contact'],'9992230740')

    def test_invalid_rows_preserved_disabled_and_build_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for folder in ['source','scripts','src','reports','public']:
                (root/folder).mkdir()
            shutil.copytree(ROOT/'source',root/'source',dirs_exist_ok=True)
            shutil.copytree(ROOT/'public',root/'public',dirs_exist_ok=True)
            shutil.copy(ROOT/'scripts/import_products.py',root/'scripts/import_products.py')
            rows=list(csv.reader((root/'source/google-sheet.csv').read_text(encoding='utf-8').splitlines(keepends=True)))
            indexes=[i for i,row in enumerate(rows) if row and row[0].isdigit()]
            header=next(row for row in rows if 'Product / Item Name' in row)
            rows[indexes[0]][header.index('Product / Item Name')]='';rows[indexes[1]][header.index('Selling Price')]='-1';rows[indexes[2]][header.index('Image Link')]='javascript:alert(1)'
            rows[indexes[3]][header.index('MRP')]='invalid'
            with (root/'source/google-sheet.csv').open('w',encoding='utf-8',newline='') as output:csv.writer(output).writerows(rows)
            result=subprocess.run(['python',str(root/'scripts/import_products.py')],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            products=json.loads((root/'src/products.json').read_text(encoding='utf-8'))['products']
            self.assertEqual(len(products),46)
            self.assertTrue(all(not p['enabled'] for p in products[:4]))
            report=(root/'reports/import-report.md').read_text(encoding='utf-8')
            self.assertIn('Missing product name',report)
            self.assertIn('Invalid selling price',report)
            self.assertIn('Malformed',report)
            self.assertIn('Invalid source MRP',report)

    def test_live_sheet_metadata_and_offer_parsing(self):
        spec=importlib.util.spec_from_file_location('sheet_sync',ROOT/'scripts/sync_google_sheet.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        text=(ROOT/'source/google-sheet.csv').read_text(encoding='utf-8')
        parsed=module.parse_sheet(text)
        self.assertEqual(parsed['rowCount'],46)
        self.assertEqual([tier['basisPoints'] for tier in parsed['offers']['tiers']],[1000,1500,2000])
        self.assertEqual([tier['maxSubtotalPaise'] for tier in parsed['offers']['tiers']],[200000,500000,None])
        self.assertEqual([tier['couponCode'] for tier in parsed['offers']['tiers']],['CRACK10','CRACK15','CRACK20'])
        with self.assertRaises(ValueError):module.parse_sheet('<html>sign in</html>')
        with self.assertRaises(ValueError):module.parse_sheet(text.replace('20% off above 5000','FREE delivery everywhere'))

if __name__=='__main__':unittest.main()
