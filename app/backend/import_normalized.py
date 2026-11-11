"""Import the approved workbook without generating names or merging its rows.

Usage: python -m backend.import_normalized SOURCE OUTPUT
OUTPUT must be new. Activate the verified snapshot with SNABDIKA_CATALOG_DIR.
"""
import argparse
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import pyarrow as pa
import pyarrow.parquet as pq


def number(value):
    if value is None or value == '':
        return None
    result = float(str(value).replace(',', '.'))
    if not math.isfinite(result) or result < 0:
        raise ValueError(f'Invalid numeric value: {value!r}')
    return result


def convert(source, output):
    source, output = Path(source), Path(output)
    if output.exists():
        raise FileExistsError(output)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    stamp = datetime.now(timezone.utc).isoformat()
    book = openpyxl.load_workbook(source, read_only=True, data_only=True)
    iterator = book['База'].iter_rows(values_only=True)
    headers = next(iterator)
    required = {'row', 'ID', 'Исходное', 'Нормализованное', 'Статус_нормализации',
                'Цена_закупа', 'Цена_продажи', 'Ед_цены', 'Ед.изм', 'Источник_цен',
                'Код_Петрович', 'Код_поставщика', 'Цены_других_источников'}
    if len(set(headers)) != len(headers) or required - set(headers):
        raise ValueError(f'Unexpected headers; missing {required - set(headers)}')
    materials, offers, aliases, source_rows, identities = [], [], [], {}, set()

    def alias(mid, supplier, name, code=''):
        if name:
            aliases.append(dict(alias_id=len(aliases) + 1, material_id=mid, supplier=str(supplier or ''),
                                raw_name=str(name), supplier_code=str(code or ''), confidence=100,
                                imported_at=stamp))

    def offer(mid, row, supplier, price_type, price, excel_row):
        price = number(price)
        if price is None:
            return
        supplier = str(supplier)
        name_key = {'Петрович': 'Петрович_наименование', 'STK': 'STK_наименование',
                    'KnaufDom': 'KnaufDom_наименование', 'СибЭлКом': 'СибЭлКом_наименование'}.get(supplier)
        offers.append(dict(offer_id=len(offers) + 1, material_id=mid, supplier=supplier,
            price_type=price_type, current_price=price, imported_at=stamp,
            supplier_code=str((row.get('Код_Петрович') if supplier == 'Петрович' else row.get('Код_поставщика')) or ''),
            raw_name=str(row.get(name_key) or row.get('Исходное') or ''),
            working_name=str(row.get('Нормализованное') or row['Исходное']),
            print_name=str(row.get('Нормализованное') or row['Исходное']),
            article=str(row.get('Артикул') or ''), unit=str(row.get('Ед_цены') or ''),
            source_file=source.name, excel_row=excel_row))

    for excel_row, values in enumerate(iterator, 2):
        row = dict(zip(headers, values))
        identity = str(row['ID'] or f"spine:{row['row']}")
        if identity in identities or identity == 'spine:None':
            raise ValueError(f'Duplicate/missing identity at row {excel_row}: {identity}')
        identities.add(identity)
        # Separate namespace prevents old request IDs from silently selecting a different product.
        mid = 1_000_000_000 + int(hashlib.sha256(identity.encode()).hexdigest()[:12], 16)
        if row['row'] is not None:
            source_rows[str(row['row'])] = mid
        name = row['Нормализованное'] or row['Исходное']
        if not name:
            raise ValueError(f'Missing name at row {excel_row}')
        materials.append(dict(material_id=mid, canonical_name=str(name), working_name=str(name),
            print_name=str(name), unit=str(row.get('Ед.изм') or row.get('Ед_цены') or ''),
            weight_kg=number(row.get('Вес_кг')), category=str(row.get('Категория') or ''),
            subcategory=str(row.get('Подкатегория') or ''), brand=row.get('Бренд'),
            status='active' if row['Статус_нормализации'] == 'Нормализовано' else 'needs_review',
            needs_review=row['Статус_нормализации'] != 'Нормализовано',
            source_id=identity, excel_row=excel_row,
            source_json=json.dumps(row, ensure_ascii=False, default=str)))
        alias(mid, row.get('Источник_строки'), row.get('Исходное'))
        for column, supplier_name in [('Петрович_наименование', 'Петрович'), ('STK_наименование', 'STK'),
                ('НОМЕНКЛАТУРА_наименование', 'НОМЕНКЛАТУРА'), ('KnaufDom_наименование', 'KnaufDom'),
                ('СибЭлКом_наименование', 'СибЭлКом')]:
            alias(mid, supplier_name, row.get(column))
        supplier = row['Источник_цен']
        if supplier == 'нет в прайсе':
            if row['Цена_закупа'] is not None or row['Цена_продажи'] is not None:
                raise ValueError(f'Price without supplier at row {excel_row}')
        else:
            for field, kind in [('Цена_закупа', 'purchase'), ('Цена_продажи', 'retail')]:
                offer(mid, row, supplier, kind, row[field], excel_row)
        other = row.get('Цены_других_источников')
        if other:
            for part in str(other).split(';'):
                match = re.fullmatch(r'\s*([^:]+):\s*розн\s+([\d.,]+)(?:\s*/\s*закуп\s+([\d.,]+))?\s*', part)
                if not match:
                    raise ValueError(f'Unknown secondary price at row {excel_row}: {part}')
                supplier, retail, purchase = match.groups()
                offer(mid, row, supplier, 'retail', retail, excel_row)
                offer(mid, row, supplier, 'purchase', purchase, excel_row)
    offers_by_material = {}
    for item in offers:
        offers_by_material.setdefault(item['material_id'], []).append(item)
    iterator = book['Алиасы_поставщиков'].iter_rows(values_only=True)
    alias_headers = next(iterator)
    for values in iterator:
        row = dict(zip(alias_headers, values))
        mid = source_rows[str(row['row'])]
        alias(mid, row['Поставщик'], row['Наименование'], row['code'])
        for item in offers_by_material.get(mid, []):
            if item['supplier'] == row['Поставщик'] and not item['supplier_code']:
                item['supplier_code'] = str(row['code'] or '')
    book.close()
    assert len({m['material_id'] for m in materials}) == len(materials)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    output.mkdir(parents=True)
    tables = dict(catalog_materials=materials, supplier_offers=offers, material_aliases=aliases,
                  import_logs=[dict(import_id=1, supplier='База нормализации', source_file=source.name,
                                    imported_at=stamp, created=len(materials), updated=0)])
    for name, rows in tables.items():
        pq.write_table(pa.Table.from_pylist(rows), output / f'{name}.parquet')
    report = dict(source=str(source.resolve()), source_sha256=digest, generated_at=stamp,
                  materials=len(materials), offers=len(offers), aliases=len(aliases),
                  statuses=dict(Counter(m['status'] for m in materials)),
                  price_types=dict(Counter(o['price_type'] for o in offers)))
    (output / 'import_summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(convert(args.source, args.output), ensure_ascii=False, indent=2))
