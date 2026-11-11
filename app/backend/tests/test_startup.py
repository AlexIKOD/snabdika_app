"""Real HTTP startup contract, deliberately bypassing the frontend mock server."""
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app


@pytest.fixture
def startup(tmp_path, monkeypatch):
    root = tmp_path / 'catalog'
    root.mkdir()
    tables = {
        'catalog_materials': [
            {'material_id': 10, 'canonical_name': 'Кабель 3х2,5', 'unit': 'м', 'weight_kg': None,
             'category': 'Электрика', 'subcategory': 'Кабели', 'status': 'active', 'needs_review': False},
            {'material_id': 20, 'canonical_name': 'Ротбанд 30 кг', 'unit': 'шт', 'weight_kg': 30,
             'category': 'Смеси', 'subcategory': 'Штукатурки', 'status': 'needs_review', 'needs_review': True},
        ],
        'supplier_offers': [
            {'offer_id': 1, 'material_id': 20, 'supplier': 'Поставщик А', 'supplier_code': 'SKU20',
             'article': 'ART-9', 'price_type': 'purchase', 'current_price': 700, 'imported_at': '2026-10-20T12:00:00'},
            {'offer_id': 2, 'material_id': 20, 'supplier': 'Поставщик Б', 'supplier_code': 'SKU20',
             'price_type': 'retail', 'current_price': 600, 'imported_at': '2026-10-20T12:00:00'},
        ],
        'material_aliases': [{'alias_id': 1, 'material_id': 20, 'raw_name': 'Rotband', 'supplier': 'fixture',
                              'confidence': 100, 'imported_at': '2026-10-20T12:00:00'}],
        'import_logs': [{'import_id': 1, 'supplier': 'Поставщик А', 'source_file': 'fixture.xlsx',
                         'imported_at': '2026-10-20T12:00:00', 'created': 2, 'updated': 0}],
    }
    for name, rows in tables.items():
        pq.write_table(pa.Table.from_pylist(rows), root / f'{name}.parquet')
    monkeypatch.setenv('SNABDIKA_CATALOG_DIR', str(root))
    return TestClient(create_app(tmp_path / 'data.sqlite', auth='fixture-key'),
                      headers={'x-snab-key': 'fixture-key'}), root


@pytest.mark.parametrize('path', ['/api/dashboard', '/api/materials', '/api/suppliers',
    '/api/dictionaries/categories', '/api/materials/20', '/api/imports', '/api/logs'])
def test_startup_endpoints_exist_without_mock(startup, path):
    client, _ = startup
    result = client.get(path)
    assert result.status_code == 200, (path, result.status_code, result.text[:200])
    assert 'data' in result.json()


def test_catalog_values_filters_and_detail(startup):
    client, _ = startup
    rows = client.get('/api/materials').json()['data']
    assert len(rows) == 2
    material = client.get('/api/materials/20').json()['data']
    assert material['best_purchase']['price'] == 700
    assert material['aliases_count'] == 1
    assert material['aliases'][0]['raw_name'] == 'Rotband'
    assert material['offers'][0]['supplier_id'] != material['offers'][1]['supplier_id']
    assert client.get('/api/materials', params={'query': 'SKU20'}).json()['data'][0]['material_id'] == 20
    assert client.get('/api/materials', params={'query': 'ART-9'}).json()['data'][0]['material_id'] == 20
    assert len(client.get('/api/materials', params={'has_price': 'with_price'}).json()['data']) == 1
    assert len(client.get('/api/materials', params={'has_weight': 'no_weight'}).json()['data']) == 1
    assert len(client.get('/api/materials', params={'has_price_conflict': True}).json()['data']) == 1
    assert len(client.get('/api/materials', params={'category': 'Кабели'}).json()['data']) == 1
    assert client.get('/api/materials', params={'sort_by': 'id', 'sort_dir': 'desc'}).json()['data'][0]['material_id'] == 20
    assert client.get('/api/materials/999').status_code == 404


def test_summary_and_suppliers_use_actual_catalog(startup):
    client, _ = startup
    stats = client.get('/api/dashboard').json()['data']
    assert stats['materials_count'] == 2
    assert stats['offers_count'] == 2
    assert stats['suppliers_active_count'] == 2
    assert stats['materials_without_price_count'] == 1
    assert stats['materials_without_weight_count'] == 1
    assert stats['price_conflicts_count'] == 1
    assert sum(s['offers_count'] for s in client.get('/api/suppliers').json()['data']) == 2
    assert client.get('/api/dictionaries/categories').json()['data'][0]['count'] == 2
    health = client.get('/api/health').json()['data']
    assert health['database_version'] == '2'
    assert health['catalog']['materials_count'] == 2
    assert health['moysklad']['connected'] is False
    assert health['gemini']['available'] is False


def test_missing_catalog_reports_failure_instead_of_empty_success(startup):
    client, root = startup
    (root / 'catalog_materials.parquet').unlink()
    assert client.get('/api/materials').status_code == 503
    assert client.get('/api/health').json()['data']['data_layer'] is False


def test_catalog_cache_observes_file_replacement(startup):
    client, root = startup
    assert len(client.get('/api/materials').json()['data']) == 2
    table = pq.read_table(root / 'catalog_materials.parquet')
    pq.write_table(table.slice(0, 1), root / 'catalog_materials.parquet')
    assert len(client.get('/api/materials').json()['data']) == 1


def test_catalog_pages_do_not_load_the_entire_database(startup):
    client, _ = startup
    data = client.get('/api/materials', params={'page': 2, 'page_size': 1, 'sort_by': 'id'}).json()
    assert [r['material_id'] for r in data['data']] == [20]
    assert data['meta'] == {'page': 2, 'page_size': 1, 'total': 2, 'catalog_total': 2}
    assert client.get('/api/materials', params={'page_size': 0}).status_code == 422
