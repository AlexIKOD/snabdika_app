import hashlib

import openpyxl
import pyarrow.parquet as pq
import pytest

from backend.import_normalized import convert
from backend.services.catalog import Catalog
from backend.services.matching import candidates


def test_updated_headers_prices_aliases_and_source_preserved(tmp_path, monkeypatch):
    source = tmp_path / 'source.xlsx'
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = 'База'
    # Reordered columns exercise header-based mapping, including the added code.
    headers = ['ID', 'Код_Петрович', 'Нормализованное', 'Исходное', 'row',
               'Цена_продажи', 'Цена_закупа', 'Источник_цен', 'Ед_цены', 'Ед.изм',
               'Статус_нормализации', 'Код_поставщика', 'Цены_других_источников']
    sheet.append(headers)
    sheet.append([None, '106958', 'Штукатурка гипсовая универсальная Кнауф Ротбанд, 30 кг',
                  'Кнауф Ротбанд штукатурка гипсовая 30 кг', 11, 585, 625.13, 'Петрович',
                  'шт', 'шт', 'Нормализовано', None, 'STK: розн 440 / закуп 410'])
    aliases = book.create_sheet('Алиасы_поставщиков')
    aliases.append(['row', 'Поставщик', 'Наименование', 'code'])
    aliases.append([11, 'Петрович', 'Ротбанд 30кг', '106958'])
    book.save(source)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    output = tmp_path / 'catalog'
    report = convert(source, output)
    assert report['materials'] == 1 and report['offers'] == 4 and report['aliases'] == 2
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest == report['source_sha256']
    monkeypatch.setenv('SNABDIKA_CATALOG_DIR', str(output))
    catalog = Catalog()
    catalog.load()
    row = candidates(catalog, ['Штукатурка гипсовая КНАУФ Ротбанд 30кг'])[0]
    assert row['canonical_name'] == 'Штукатурка гипсовая универсальная Кнауф Ротбанд, 30 кг'
    assert {(o['supplier_name'], o['price_type'], o['price']) for o in row['offers']} == {
        ('Петрович', 'purchase', 625.13), ('Петрович', 'retail', 585),
        ('STK', 'purchase', 410), ('STK', 'retail', 440)}
    assert row['offers'][0]['supplier_code'] == '106958'
    assert pq.read_table(output / 'catalog_materials.parquet').to_pylist()[0]['excel_row'] == 2
    with pytest.raises(FileExistsError):
        convert(source, output)
