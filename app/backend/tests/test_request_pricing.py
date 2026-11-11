"""Request header pricing: one settings object, server-side Decimal, base retail untouched."""
import pytest
from test_startup import startup


def request_with_lines(client, rows):
    request = client.post('/api/requests', json={'raw_text': '\n'.join(r[0] for r in rows)}).json()['data']
    for position, (_, retail, purchase, qty) in zip(request['positions'], rows):
        patch = {'parsed_qty': qty, 'retail_price': retail, 'purchase_price': purchase,
                 'retail_source': 'manual fixture', 'purchase_source': 'supplier fixture'}
        assert client.patch(f"/api/requests/{request['request_id']}/positions/{position['position_id']}",
                            json=patch).status_code == 200
    return request['request_id']


def pricing(client, identifier, **settings):
    return client.post(f'/api/requests/{identifier}/pricing', json=settings)


def test_discount_keeps_base_retail_and_returns_sale_price(startup):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1000, 700, 2)])
    result = pricing(client, identifier, pricing_mode='discount', target_percent=10)
    assert result.status_code == 200, result.text
    data = result.json()['data']
    assert data['positions'][0]['sale_price'] == 900
    assert data['positions'][0]['sum_total'] == 1800
    assert data['excluded'] == []
    assert data['sum_total'] == 1800
    stored = client.get(f'/api/requests/{identifier}').json()['data']
    assert stored['positions'][0]['retail_price'] == 1000
    assert stored['pricing']['target_percent'] == 10


def test_recalculation_is_idempotent_and_zero_restores_the_base(startup):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1000, 700, 1)])
    first = pricing(client, identifier, pricing_mode='discount', target_percent=10).json()['data']
    second = pricing(client, identifier, pricing_mode='discount', target_percent=10).json()['data']
    assert first['positions'] == second['positions']
    restored = pricing(client, identifier, pricing_mode='discount', target_percent=0).json()['data']
    assert restored['positions'][0]['sale_price'] == 1000


def test_margin_mode_uses_purchase_cost_and_excludes_unpriced_rows(startup):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1000, 700, 1), ('Кабель', 500, None, 1)])
    data = pricing(client, identifier, pricing_mode='margin', target_percent=20).json()['data']
    assert data['positions'][0]['sale_price'] == 875
    assert data['excluded'] == [2]
    assert data['sum_total'] == 875


def test_vat_is_applied_to_the_sale_price_and_reported_separately(startup):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1200, 700, 1)])
    data = pricing(client, identifier, pricing_mode='discount', target_percent=10,
                   vat_enabled=True, vat_included=True, vat_rate=20).json()['data']
    assert data['positions'][0]['sale_price'] == 1080
    assert data['sum_total'] == 1080
    assert data['sum_without_vat'] == 900
    assert data['sum_vat'] == 180


@pytest.mark.parametrize('settings', [{'target_percent': 100}, {'target_percent': -1}, {'pricing_mode': 'max'},
    {'vat_rate': 13}, {'vat_enabled': False, 'vat_rate': 20}, {'vat_enabled': False, 'vat_included': True},
    {'unknown_field': 1}, {'target_percent': 'NaN'}])
def test_invalid_header_settings_are_rejected_and_nothing_is_saved(startup, settings):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1000, 700, 1)])
    assert pricing(client, identifier, **settings).status_code == 422
    assert client.get(f'/api/requests/{identifier}').json()['data']['pricing']['target_percent'] == 0


def test_invoice_preview_reads_the_request_settings_not_the_body(startup):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1000, 700, 1)])
    pricing(client, identifier, pricing_mode='discount', target_percent=10)
    body = {'position_ids': [1], 'organization_id': 'o', 'agent_id': 'a', 'store_id': 's',
            'doc_date': '2026-10-24', 'merge': False, 'target_percent': 50}
    result = client.post(f'/api/requests/{identifier}/invoice/preview', json=body)
    # Rejected before МойСклад because the position is not confirmed; the pricing object is not the reason.
    assert result.status_code == 422
    assert 'подтверждена' in result.json()['detail'].lower()


def test_saved_row_returns_its_calculated_price(startup):
    client, _ = startup
    identifier = request_with_lines(client, [('Ротбанд', 1000, 700, 1)])
    pricing(client, identifier, pricing_mode='discount', target_percent=10)
    result = client.patch(f'/api/requests/{identifier}/positions/1', json={'retail_price': 2000})
    assert result.status_code == 200, result.text
    assert result.json()['data']['sale_price'] == 1800
