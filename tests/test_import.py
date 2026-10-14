import json, shutil, subprocess, tempfile, unittest
from pathlib import Path
import openpyxl

ROOT=Path(__file__).resolve().parents[1]

class ImportTests(unittest.TestCase):
    def test_every_source_value_matches_generated_catalogue(self):
        source=openpyxl.load_workbook(ROOT/'source/Diwali_Cracker.xlsx',data_only=True).active
        data=json.loads((ROOT/'src/products.json').read_text(encoding='utf-8'))['products']
        self.assertEqual(len(data),46)
        for p in data:
            row=p['sourceRowNumber']
            self.assertEqual(p['name'],source.cell(row,2).value)
            self.assertEqual(p['originalCategory'],source.cell(row,3).value)
            self.assertEqual(p['pricePaise'],round(source.cell(row,4).value*100))
        self.assertEqual(source['G1'].value,'Contact no - 9992230740')

    def test_invalid_rows_preserved_disabled_and_build_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for folder in ['source','scripts','src','reports','public']:
                (root/folder).mkdir()
            shutil.copytree(ROOT/'source',root/'source',dirs_exist_ok=True)
            shutil.copy(ROOT/'scripts/import_products.py',root/'scripts/import_products.py')
            book=openpyxl.load_workbook(root/'source/Diwali_Cracker.xlsx')
            book.active['B2']=None
            book.active['D3']=-1
            book.active['E4']='javascript:alert(1)'
            book.save(root/'source/Diwali_Cracker.xlsx')
            result=subprocess.run(['python',str(root/'scripts/import_products.py')],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            products=json.loads((root/'src/products.json').read_text(encoding='utf-8'))['products']
            self.assertEqual(len(products),46)
            self.assertTrue(all(not p['enabled'] for p in products[:3]))
            report=(root/'reports/import-report.md').read_text(encoding='utf-8')
            self.assertIn('Missing product name',report)
            self.assertIn('Invalid selling price',report)
            self.assertIn('Malformed',report)

if __name__=='__main__':unittest.main()
