"""Integration checks against the approved workbook and the active real catalog."""
import hashlib
import json
from pathlib import Path

import openpyxl
import pyarrow.parquet as pq

from backend.services.catalog import Catalog
from backend.services.matching import candidates


def test_active_catalog_matches_every_workbook_row():
    root = Path(__file__).resolve().parents[3]
    source = root / 'База_нормализации.xlsx'
    catalog = Catalog()
    manifest = json.loads((catalog.root / 'import_summary.json').read_text(encoding='utf-8'))
    assert manifest['source_sha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
    materials = pq.read_table(catalog.root / 'catalog_materials.parquet').to_pylist()
    by_row = {m['excel_row']: m for m in materials}
    offers = pq.read_table(catalog.root / 'supplier_offers.parquet').to_pylist()
    prices = {(o['material_id'], o['supplier'], o['price_type']): o['current_price'] for o in offers}
    book = openpyxl.load_workbook(source, read_only=True, data_only=True)
    iterator = book['База'].iter_rows(values_only=True)
    headers = next(iterator)
    count = 0
    for excel_row, values in enumerate(iterator, 2):
        row = dict(zip(headers, values))
        material = by_row[excel_row]
        assert material['canonical_name'] == (row['Нормализованное'] or row['Исходное'])
        assert json.loads(material['source_json']) == row
        for field, kind in [('Цена_закупа', 'purchase'), ('Цена_продажи', 'retail')]:
            if row[field] is not None:
                assert prices[material['material_id'], row['Источник_цен'], kind] == float(row[field])
        count += 1
    book.close()
    assert count == len(materials) == manifest['materials']


def test_rotband_retrieval_retains_normalized_name_and_both_prices():
    catalog = Catalog()
    rows = candidates(catalog, ['Штукатурка гипсовая КНАУФ Ротбанд 30кг'])
    row = next(r for r in rows if r['canonical_name'] ==
               'Штукатурка гипсовая универсальная Кнауф Ротбанд, 30 кг')
    assert {(o['price_type'], o['price']) for o in row['offers']} >= {
        ('purchase', 625.13), ('retail', 585)}
    assert all(not r['canonical_name'].startswith('Кабель ') for r in rows)
