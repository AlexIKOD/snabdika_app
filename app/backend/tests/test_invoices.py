import copy
import json
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.services.catalog import Catalog
from backend.services.invoice_pricing import calculate
from backend.services.moysklad import ExternalError, BASE
from backend.services.invoice_submission import reserve, submit

# Catalog IDs now refer to spine:11, IMP-088430 and spine:35 in the approved workbook.
PRODUCT, UNIT, ORGANIZATION, AGENT, STORE = [str(uuid4()) for _ in range(5)]


class FakeMoysklad:
    def __init__(self):
        self.documents = {}
        self.products = {}
        self.posts = 0
        self.product_creates = 0
        self.calls = []
        self.failure = None
        self.product_timeout_after = False
        self.archived = False

    def entity(self, kind, identifier):
        if self.archived:
            raise ValueError('Архивировано')
        if kind == 'product' and identifier in self.products:
            return copy.deepcopy(self.products[identifier])
        if identifier not in (ORGANIZATION, AGENT, STORE):
            raise ValueError('Unknown UUID')
        return {'id': identifier, 'name': 'fixture', 'uom': {'meta': {'href': BASE + '/entity/uom/' + UNIT}}}

    def dictionary(self, kind, query=''):
        return [self.entity(kind, {'organization': ORGANIZATION, 'store': STORE, 'counterparty': AGENT, 'product': PRODUCT}[kind])]

    def get(self, path, params=None):
        self.calls.append(('GET', path))
        if path == '/entity/uom':
            return {'rows': [{'id': UNIT, 'name': params.get('search', 'шт')}]}
        if path == '/entity/product':
            code = params.get('filter', '').removeprefix('externalCode=')
            return {'rows': [p for p in self.products.values() if p['externalCode'] == code]}
        if path.endswith('/metadata/attributes'):
            return {'rows': [{'id': 'fixture-attr', 'name': 'Discount', 'type': 'double', 'meta': {'href': 'fixture'}}]}
        if path.endswith('/metadata'):
            return {}
        if path == '/entity/invoiceout':
            return {'rows': [v for v in self.documents.values() if v['syncId'] == params['filter'].split('=', 1)[1]]}
        identifier = path.split('/')[3]
        if path.endswith('/positions'):
            return {'meta': {'size': len(self.documents[identifier]['positions'])}, 'rows': self.documents[identifier]['positions']}
        return self.documents[identifier]

    def request(self, method, path, body):
        self.calls.append((method, path))
        if path == '/entity/counterparty':
            return {**body, 'id': AGENT}
        if path == '/entity/product' and method == 'POST':
            self.product_creates += 1
            identifier = str(uuid4())
            result = copy.deepcopy(body)
            result.update(id=identifier, uom={'meta': {'href': BASE + '/entity/uom/' + UNIT}})
            self.products[identifier] = result
            if self.product_timeout_after:
                self.product_timeout_after = False
                raise ExternalError(0)
            return copy.deepcopy(result)
        if path.startswith('/entity/product/') and method == 'PUT':
            identifier = path.split('/')[-1]
            self.products[identifier].update(body)
            return copy.deepcopy(self.products[identifier])
        self.posts += 1
        if self.failure and self.failure not in ('timeout_after',):
            raise ExternalError(self.failure)
        identifier = str(uuid4())
        result = copy.deepcopy(body)
        result.update(id=identifier, name='TEST-1', sum=0, vatSum=0)
        for line in body['positions']:
            base = Decimal(str(line['price'])) * Decimal(str(line['quantity'])) / 100
            base = base.quantize(Decimal('.01'))
            factor = Decimal(1) + Decimal(line['vat']) / 100 if body['vatEnabled'] else Decimal(1)
            net = (base / factor).quantize(Decimal('.01')) if body['vatIncluded'] else base
            vat = base - net if body['vatIncluded'] else (base * (factor - 1)).quantize(Decimal('.01'))
            result['sum'] += float((net + vat) * 100)
            result['vatSum'] += float(vat * 100)
        self.documents[identifier] = result
        if self.failure == 'timeout_after':
            self.failure = None
            raise ExternalError(0)
        return result


@pytest.fixture
def flow(tmp_path):
    ms = FakeMoysklad()
    app = create_app(tmp_path / 'data.sqlite', ms, 'fixture-key')
    client = TestClient(app, headers={'x-snab-key': 'fixture-key'})
    req = client.post('/api/requests', json={'client_name': 'fixture', 'doc_number': 'T', 'raw_text': 'line\nline2'}).json()['data']
    patch = {'matched_material_id': 120552996668895, 'matched_material_name': 'fixture', 'selected_supplier_id': 7,
             'parsed_qty': 2, 'parsed_unit': 'шт', 'quantity_confirmed': True, 'unit_confirmed': True,
             'retail_price': 120, 'purchase_price': 60, 'purchase_source': 'supplier fixture', 'retail_source': 'manual fixture'}
    for p in req['positions']:
        url = f"/api/requests/{req['request_id']}/positions/{p['position_id']}"
        assert client.patch(url, json=patch).status_code == 200
        assert client.patch(url, json={'status': 'confirmed'}).status_code == 200
    ms.calls.clear()
    assert client.post(f"/api/requests/{req['request_id']}/pricing", json={
        'pricing_mode': 'discount', 'target_percent': 10, 'vat_enabled': True,
        'vat_included': True, 'vat_rate': 20}).status_code == 200
    settings = {'position_ids': [1], 'organization_id': ORGANIZATION, 'agent_id': AGENT, 'store_id': STORE,
                'doc_date': '2026-10-21', 'vat_enabled': True, 'vat_included': True, 'vat_rate': 20,
                'pricing_mode': 'discount', 'target_percent': 10, 'merge': False, 'comment': 'TEST'}
    return client, app, ms, req['request_id'], settings


PRICING_KEYS = ('pricing_mode', 'target_percent', 'vat_enabled', 'vat_included', 'vat_rate')


def preview(flow, **changes):
    """Pricing lives in the request header now; the invoice reads that single object."""
    c, app, ms, rid, settings = flow
    pricing = {key: value for key, value in changes.items() if key in PRICING_KEYS}
    if pricing:
        saved = c.post(f'/api/requests/{rid}/pricing', json=pricing)
        if saved.status_code != 200:
            return saved
    return c.post(f'/api/requests/{rid}/invoice/preview', json={**settings, **changes})


def test_invoice_moment_uses_selected_date_and_current_moscow_time(flow, monkeypatch):
    from datetime import datetime, timedelta
    from backend.services import invoice_assembly

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is not None:
                assert tz.utcoffset(None) == timedelta(hours=3)
            return cls(2026, 10, 23, 18, 37, 12, tzinfo=tz)

    monkeypatch.setattr(invoice_assembly, 'datetime', FixedDateTime)
    data = preview(flow).json()['data']
    with flow[1].state.store.connect() as db:
        saved = json.loads(db.execute('SELECT data FROM previews WHERE id=?',
                           (data['preview_id'],)).fetchone()['data'])
    assert saved['payload']['moment'] == '2026-10-21 18:37:12'


def test_real_service_financial_values_and_pure_preview(flow):
    c, app, ms, rid, settings = flow
    p = preview(flow).json()['data']
    invoice = p['invoice_preview']
    assert invoice['sum_total'] == 216
    assert invoice['sum_without_vat'] == 180
    assert invoice['sum_vat'] == 36
    assert invoice['sum_purchase'] == 120
    assert invoice['profit'] == 60
    assert invoice['actual_discount'] == 10
    assert p['excluded_position_ids'] == [2]
    assert all(method == 'GET' for method, path in ms.calls)


@pytest.mark.parametrize('field,value', [('parsed_qty', 3), ('retail_price', 125), ('purchase_price', 80),
    ('selected_supplier_id', 5), ('matched_material_id', 209123415378470), ('parsed_unit', 'шт.')])
def test_changes_remove_confirmation_and_stale_preview(flow, field, value):
    c, app, ms, rid, _ = flow
    p = preview(flow).json()['data']
    changed = c.patch(f'/api/requests/{rid}/positions/1', json={field: value, 'status': 'confirmed'}).json()['data']
    assert changed['status'] == 'needs_review'
    assert c.post('/api/invoices', json={'preview_id': p['preview_id']}).status_code == 422
    assert ms.posts == 0


@pytest.mark.parametrize('changes', [{'position_ids': []}, {'position_ids': [1, 1]}, {'position_ids': [999]},
    {'target_percent': 100}, {'target_percent': -1}, {'vat_rate': 13}, {'vat_enabled': False, 'vat_rate': 20},
    {'pricing_mode': 'max'}, {'target_percent': 'NaN'}, {'target_percent': 'Infinity'}])
def test_invalid_inputs_block_before_post(flow, changes):
    assert preview(flow, **changes).status_code == 422
    assert flow[2].posts == 0


def test_merge_and_trace(flow):
    data = preview(flow, position_ids=[1, 2], merge=True).json()['data']
    assert len(data['invoice_preview']['positions']) == 1
    row = data['invoice_preview']['positions'][0]
    assert row['qty'] == 4
    assert row['source_position_ids'] == [1, 2]
    assert len(preview(flow, position_ids=[1, 2]).json()['data']['invoice_preview']['positions']) == 2


def test_independent_invoices_survive_restart_and_zero_differs_no_vat(flow):
    c, app, ms, rid, _ = flow
    p1 = preview(flow, vat_rate=0).json()['data']
    p2 = preview(flow, position_ids=[2], vat_enabled=False, vat_included=False, vat_rate=0).json()['data']
    r1 = c.post('/api/invoices', json={'preview_id': p1['preview_id']}).json()['data']
    r2 = c.post('/api/invoices', json={'preview_id': p2['preview_id']}).json()['data']
    assert r1['status'] == r2['status'] == 'created'
    restarted = TestClient(create_app(app.state.store.path, ms, 'fixture-key'), headers={'x-snab-key': 'fixture-key'})
    assert restarted.get(f"/api/invoices/{r1['invoice_id']}").json()['data']['settings']['vat_enabled'] is True
    assert restarted.get(f"/api/invoices/{r2['invoice_id']}").json()['data']['settings']['vat_enabled'] is False


def test_timeout_readback_and_no_duplicate(flow):
    c, app, ms, rid, _ = flow
    ms.failure = 'timeout_after'
    p = preview(flow).json()['data']
    first = c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    assert first['operation_state'] == 'outcome_unknown'
    second = c.post(f"/api/invoices/{first['invoice_id']}/retry").json()['data']
    assert second['status'] == 'created'
    assert ms.posts == 1
    assert c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']['invoice_id'] == first['invoice_id']
    assert c.patch(f'/api/requests/{rid}/positions/1', json={'parsed_qty': 8}).status_code == 422
    req = c.get(f'/api/requests/{rid}').json()['data']
    assert req['positions'][0]['invoiced_operation_id']
    assert not req['positions'][1].get('invoiced_operation_id')


@pytest.mark.parametrize('status', [401, 403, 429, 500, 0])
def test_api_errors_retry_without_duplicate(flow, status):
    c, app, ms, rid, _ = flow
    ms.failure = status
    # 0 must still trigger a transport failure in this fixture.
    if status == 0:
        ms.failure = 503
    p = preview(flow).json()['data']
    first = c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    assert first['status'] == 'error'
    ms.failure = None
    second = c.post(f"/api/invoices/{first['invoice_id']}/retry").json()['data']
    if status in (500, 0):
        assert second['operation_state'] == 'outcome_unknown'
        assert ms.posts == 1
    else:
        assert second['status'] == 'created'
        assert ms.posts == 2


def test_parallel_reservation_same_preview_and_other_preview_claims(flow):
    c, app, ms, rid, _ = flow
    first, second = [preview(flow).json()['data'] for _ in range(2)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(lambda _: reserve(app.state.store, first['preview_id']), range(4)))
    assert len(set(ids)) == 1
    with pytest.raises(ValueError):
        reserve(app.state.store, second['preview_id'])
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: submit(app.state.store, ms, ids[0]), range(2)))
    assert ms.posts == 1


def test_crash_after_post_started_never_reposts(flow):
    c, app, ms, rid, _ = flow
    p = preview(flow).json()['data']
    identifier = reserve(app.state.store, p['preview_id'])
    with app.state.store.connect() as db:
        row = db.execute('SELECT data FROM operations WHERE id=?', (identifier,)).fetchone()
        data = json.loads(row['data']); data['post_started'] = True
        db.execute("UPDATE operations SET state='sending',data=? WHERE id=?", (json.dumps(data), identifier))
    new_app = create_app(app.state.store.path, ms, 'fixture-key')
    assert submit(new_app.state.store, ms, identifier)['operation_state'] == 'outcome_unknown'
    assert ms.posts == 0


def test_readback_mismatch_is_unknown_and_not_success(flow):
    c, app, ms, rid, _ = flow
    original = ms.request
    def corrupt(method, path, body):
        doc = original(method, path, body)
        doc['sum'] += 1
        return doc
    ms.request = corrupt
    p = preview(flow).json()['data']
    result = c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    assert result['operation_state'] == 'outcome_unknown'
    assert 'не совпал' in result['error_text']


def test_auth_and_host(flow):
    c, app, *_ = flow
    assert TestClient(app).get('/api/requests').status_code == 401
    assert c.get('/api/requests', headers={'host': 'attacker.invalid'}).status_code == 403


def test_counterparty_fields_metadata(flow):
    c, app, ms, *_ = flow
    assert c.get('/api/moysklad/metadata/counterparty').json()['data']['attributes']['rows'][0]['type'] == 'double'
    created = c.post('/api/moysklad/dictionaries/counterparty', json={'name': 'TEST', 'phone': '+70000000000',
        'attributes': [{'id': 'fixture-attr', 'value': 15}]}).json()['data']
    assert created['phone'] == '+70000000000'
    assert created['attributes'][0]['value'] == 15
    assert c.post('/api/moysklad/dictionaries/counterparty', json={'name': 'TEST', 'attributes': [{'id': 'bad', 'value': 1}]}).status_code == 422


@pytest.mark.parametrize('enabled,included,rate', [(False, False, 0), (True, True, 0), (True, False, 0),
    (True, True, 5), (True, False, 5), (True, True, 7), (True, False, 7), (True, True, 10),
    (True, False, 10), (True, True, 20), (True, False, 20), (True, True, 22), (True, False, 22)])
def test_margin_tax_combinations(flow, enabled, included, rate):
    c, app, ms, rid, _ = flow
    p = preview(flow, pricing_mode='margin', target_percent=25, vat_enabled=enabled,
                vat_included=included, vat_rate=rate).json()['data']
    assert p['invoice_preview']['actual_margin'] == 25
    assert p['invoice_preview']['sum_purchase'] == 120
    result = c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    assert result['status'] == 'created'


def test_loss_warning_only_and_unreachable_target(flow):
    p = preview(flow, target_percent=80).json()['data']
    assert p['warnings'] and not p['blocking_reasons']
    p = preview(flow, pricing_mode='margin', target_percent=33.33).json()['data']
    assert p['blocking_reasons']


@pytest.mark.parametrize('field,value', [('purchase_price', None), ('retail_price', 0), ('parsed_qty', 'NaN'),
                                      ('unit_confirmed', False), ('quantity_confirmed', False), ('retail_source', ''),
                                      ('retail_source', '   '), ('purchase_source', '   '), ('quantity_confirmed', 'yes'),
                                      ])
def test_confirmation_requires_sources_and_known_unit(flow, field, value):
    c, app, ms, rid, _ = flow
    c.patch(f'/api/requests/{rid}/positions/1', json={field: value})
    assert c.patch(f'/api/requests/{rid}/positions/1', json={'status': 'confirmed'}).status_code == 422


def test_selected_internal_material_syncs_once_and_preview_keeps_name_quantity_and_unit(flow):
    c, app, ms, rid, _ = flow
    req = c.get(f'/api/requests/{rid}').json()['data']
    position = req['positions'][0]
    link = app.state.store.catalog_moysklad_link(120552996668895)
    assert link and position['moysklad_id'] == link['moysklad_id']
    assert position['matched_material_id'] == 120552996668895
    material = Catalog().material(120552996668895)
    assert position['matched_material_name'] == material['canonical_name']
    assert position['matched_material_unit'] == material['unit'] == 'шт'
    assert position['selected_supplier_id'] == 7  # procurement choice remains separate
    assert c.patch(f'/api/requests/{rid}/positions/1', json={'status': 'confirmed'}).status_code == 200
    assert ms.product_creates == 1
    invoice = preview(flow).json()['data']['invoice_preview']['positions'][0]
    assert (invoice['material_id'], invoice['name'], invoice['qty'], invoice['unit']) == (
        120552996668895, material['canonical_name'], 2, 'шт')
    assert invoice['supplier'] == '7'


def test_unconfirmed_inferred_quantity_and_unit_block_before_moysklad_product_creation(flow):
    c, app, ms, rid, _ = flow
    c.patch(f'/api/requests/{rid}/positions/1', json={'quantity_confirmed': False, 'unit_confirmed': False})
    result = c.patch(f'/api/requests/{rid}/positions/1', json={'status': 'confirmed'})
    assert result.status_code == 422
    assert 'Количество сверено' in result.json()['detail']
    assert ms.product_creates == 1  # fixture's products only; the rejected confirmation made none


def test_uncertain_product_create_is_recovered_by_local_material_external_code(flow):
    c, app, ms, rid, _ = flow
    # Start with another local material that has not yet been mirrored.
    url = f'/api/requests/{rid}/positions/1'
    c.patch(url, json={'matched_material_id': 209123415378470, 'parsed_unit': 'шт', 'quantity_confirmed': True,
        'unit_confirmed': True, 'retail_price': 120, 'purchase_price': 60,
        'retail_source': 'fixture', 'purchase_source': 'fixture'})
    ms.product_timeout_after = True
    first = c.patch(url, json={'status': 'confirmed'})
    assert first.status_code == 502
    assert ms.product_creates == 2  # one for the fixture material and one uncertain POST
    second = c.patch(url, json={'status': 'confirmed'})
    assert second.status_code == 200, second.text
    assert ms.product_creates == 2
    assert app.state.store.catalog_moysklad_link(209123415378470)['moysklad_id'] == second.json()['data']['moysklad_id']


def test_missing_invoice_prices_block_product_sync(flow):
    c, app, ms, rid, _ = flow
    url = f'/api/requests/{rid}/positions/1'
    changed = c.patch(url, json={'matched_material_id': 209123415378470, 'parsed_qty': 2, 'parsed_unit': 'шт',
        'quantity_confirmed': True, 'unit_confirmed': True, 'retail_price': None, 'purchase_price': None,
        'retail_source': '', 'purchase_source': ''})
    assert changed.status_code == 200
    result = c.patch(url, json={'status': 'confirmed'})
    assert result.status_code == 422
    assert 'розничную цену' in result.json()['detail']
    assert ms.product_creates == 1
    assert app.state.store.catalog_moysklad_link(209123415378470) is None


def test_archived_after_preview_blocked(flow):
    c, app, ms, rid, _ = flow
    p = preview(flow).json()['data']
    ms.archived = True
    result = c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    assert result['status'] == 'error' and ms.posts == 0


@pytest.mark.parametrize('field,value', [('unit_id', str(uuid4())), ('pack_id', str(uuid4())),
    ('retail_price', 130), ('purchase_price', 80), ('moysklad_id', str(uuid4())), ('selected_supplier_id', 12)])
def test_different_terms_are_not_merged(flow, field, value):
    from backend.services.invoice_assembly import build_preview, fingerprint
    c, app, ms, rid, settings = flow
    # Deliberately alter a persisted confirmed fixture; GET validation remains active.
    with app.state.store.connect() as db:
        req = app.state.store.request(rid, db)
        req['positions'][1][field] = value
        req['positions'][1]['confirmation_hash'] = fingerprint(req['positions'][1])
        app.state.store.save_request(req, db)
    settings = {**settings, 'position_ids': [1, 2], 'merge': True}
    if field in ('unit_id', 'pack_id', 'moysklad_id'):
        with pytest.raises(ValueError):
            build_preview(app.state.store, ms, rid, settings)
    else:
        assert len(build_preview(app.state.store, ms, rid, settings)['invoice_preview']['positions']) == 2


def test_fractional_quantities_and_document_remainder(flow):
    from backend.services.invoice_assembly import build_preview, fingerprint
    c, app, ms, rid, settings = flow
    with app.state.store.connect() as db:
        req = app.state.store.request(rid, db)
        for p, qty in zip(req['positions'], ('0.1', '0.2')):
            p['parsed_qty'] = qty
            p['confirmation_hash'] = fingerprint(p)
        app.state.store.save_request(req, db)
    data = build_preview(app.state.store, ms, rid, {**settings, 'position_ids': [1, 2], 'merge': True})
    assert data['invoice_preview']['positions'][0]['qty'] == Decimal('0.3')
    assert data['invoice_preview']['sum_total'] == Decimal('32.40')
    assert data['payload']['positions'][0]['discount'] == 0
    lines = [{**req['positions'][0], 'parsed_qty': 1, 'retail_price': '1.01', 'purchase_price': '.50'} for _ in range(2)]
    calc = calculate(lines, {**settings, 'target_percent': 50})
    assert calc['sum_total'] == Decimal('1.01')
    assert calc['rounding_residual'] == 0


def test_missing_settings_and_preview_are_422(flow):
    c, app, ms, rid, _ = flow
    assert c.post('/api/invoices', json={}).status_code == 422
    assert c.post(f'/api/requests/{rid}/invoice/preview', json={}).status_code == 422


def test_auth_failure_during_recovery_does_not_erase_unknown_post(flow):
    c, app, ms, rid, _ = flow
    p = preview(flow).json()['data']
    ms.failure = 503
    first = c.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    original = ms.get
    def fail_search(path, params=None):
        raise ExternalError(401)
    ms.get = fail_search
    retry = c.post('/api/invoices/1/retry').json()['data']
    assert retry['operation_state'] == 'outcome_unknown'
    ms.get = original
    ms.failure = None
    retry = c.post('/api/invoices/1/retry').json()['data']
    assert retry['operation_state'] == 'outcome_unknown'
    assert ms.posts == 1


def test_settings_persist_and_do_not_change_invoice_settings(flow):
    c, app, ms, rid, settings = flow
    p = preview(flow).json()['data']
    assert c.put('/api/settings', json={'moysklad_vat_rate': '22%', 'rows_per_page': 25}).status_code == 200
    restarted = TestClient(create_app(app.state.store.path, ms, 'fixture-key'), headers={'x-snab-key': 'fixture-key'})
    assert restarted.get('/api/settings').json()['data']['rows_per_page'] == 25
    row = restarted.post('/api/invoices', json={'preview_id': p['preview_id']}).json()['data']
    assert row['settings']['vat_rate'] == 20
    assert restarted.put('/api/settings', json={'moysklad_token': 'fixture'}).status_code == 422
    assert restarted.put('/api/settings', json={'moysklad_api_url': 'https://untrusted.invalid'}).status_code == 422


def test_secret_api_only_exposes_status(flow, monkeypatch):
    import keyring
    vault = {}
    monkeypatch.setattr(keyring, 'set_password', lambda service, key, value: vault.update({key: value}))
    monkeypatch.setattr(keyring, 'get_password', lambda service, key: vault.get(key))
    c = flow[0]
    assert c.post('/api/secrets/moysklad_token', json={'value': 'synthetic-fixture-secret'}).status_code == 200
    status = c.get('/api/secrets/moysklad_token/status')
    assert status.json() == {'is_set': True, 'updated_at': None}
    assert 'synthetic-fixture-secret' not in status.text
    assert c.get('/api/secrets/moysklad_token').status_code == 405
    assert c.post('/api/secrets/arbitrary', json={'value': 'fixture'}).status_code == 422


def test_unconfirmed_selected_source_is_blocked_and_other_request_is_not_merged(flow):
    c, app, ms, rid, settings = flow
    c.patch(f'/api/requests/{rid}/positions/1', json={'status': 'needs_review'})
    assert preview(flow).status_code == 422
    other = c.post('/api/requests', json={'raw_text': 'other'}).json()['data']
    assert c.post(f"/api/requests/{other['request_id']}/invoice/preview", json=settings).status_code == 422
    assert ms.posts == 0


def test_catalog_draft_uses_local_cards_without_inventing_inputs(flow):
    c, app, ms, rid, settings = flow
    before = ms.product_creates
    result = c.post('/api/invoices/catalog-drafts', json={'material_ids': [120552996668895, 209123415378470]})
    assert result.status_code == 200, result.text
    draft = result.json()['data']
    assert draft['source'] == 'catalog_invoice'
    assert len(draft['positions']) == 2
    for row, mid in zip(draft['positions'], [120552996668895, 209123415378470]):
        material = Catalog().material(mid)
        assert row['matched_material_id'] == mid
        assert row['matched_material_name'] == material['canonical_name']
        assert row['parsed_unit'] == material['unit']
        assert row['parsed_qty'] is None
        assert not row['quantity_confirmed'] and not row['unit_confirmed']
        assert not row.get('retail_price') and not row.get('purchase_price')
        assert not row.get('selected_supplier_id') and not row.get('moysklad_id')
    url = f"/api/requests/{draft['request_id']}/positions/1"
    blocked = c.patch(url, json={'status': 'confirmed'})
    assert blocked.status_code == 422 and 'Количество' in blocked.json()['detail']
    assert ms.product_creates == before
    assert c.post(f"/api/requests/{draft['request_id']}/invoice/preview", json=settings).status_code == 422
    c.patch(url, json={'parsed_qty': 3, 'quantity_confirmed': True, 'unit_confirmed': True,
        'retail_price': 120, 'retail_source': 'isolated sale fixture',
        'purchase_price': 60, 'purchase_source': 'isolated procurement fixture',
        'moysklad_id': Catalog().material(120552996668895)['offers'][0]['uuid']})
    assert c.patch(url, json={'status': 'confirmed'}).status_code == 200
    assert c.patch(url, json={'status': 'confirmed'}).status_code == 200
    assert ms.product_creates == before
    data = c.post(f"/api/requests/{draft['request_id']}/invoice/preview", json=settings).json()['data']
    row = data['invoice_preview']['positions'][0]
    assert (row['material_id'], row['name'], row['qty'], row['unit']) == (
        120552996668895, Catalog().material(120552996668895)['canonical_name'], 3, Catalog().material(120552996668895)['unit'])
    assert row['moysklad_id'] != Catalog().material(120552996668895)['offers'][0]['uuid']
    assert row['price_retail'] == 120 and row['price_purchase'] == 60
    assert ms.posts == 0


@pytest.mark.parametrize('ids', [[], [120552996668895, 120552996668895], [999999999], ['120552996668895'], [True]])
def test_catalog_draft_rejects_invalid_materials(flow, ids):
    result = flow[0].post('/api/invoices/catalog-drafts', json={'material_ids': ids})
    assert result.status_code in (404, 422)


def test_five_catalog_materials_preview_without_invoice_post(flow):
    c, app, ms, _, settings = flow
    catalog = Catalog()
    catalog.load()
    ids = [120552996668895, 209123415378470, 171654330975994]
    ids += [m['material_id'] for m in catalog.rows if m['unit'] and m['material_id'] not in ids][:2]
    result = c.post('/api/invoices/catalog-drafts', json={'material_ids': ids})
    assert result.status_code == 200, result.text
    draft = result.json()['data']
    for i, position in enumerate(draft['positions'], 1):
        url = f"/api/requests/{draft['request_id']}/positions/{position['position_id']}"
        assert c.patch(url, json={'parsed_qty': i, 'quantity_confirmed': True, 'unit_confirmed': True,
            'retail_price': 120, 'retail_source': 'TEST ONLY sale 120 RUB',
            'purchase_price': 60, 'purchase_source': 'TEST ONLY procurement 60 RUB'}).status_code == 200
        assert c.patch(url, json={'status': 'confirmed'}).status_code == 200
    count = ms.product_creates
    for position in draft['positions']:
        assert c.patch(f"/api/requests/{draft['request_id']}/positions/{position['position_id']}",
                       json={'status': 'confirmed'}).status_code == 200
    assert ms.product_creates == count
    result = c.post(f"/api/requests/{draft['request_id']}/invoice/preview", json={**settings,
        'position_ids': [1, 2, 3, 4, 5], 'target_percent': 0, 'vat_enabled': False,
        'vat_included': False, 'vat_rate': 0})
    assert result.status_code == 200, result.text
    data = result.json()['data']
    for i, row in enumerate(data['invoice_preview']['positions'], 1):
        material = catalog.material(ids[i-1])
        assert (row['material_id'], row['name'], row['qty'], row['unit']) == (
            material['material_id'], material['canonical_name'], i, material['unit'])
        assert row['price_final'] == 120 and row['retail_source'] == 'TEST ONLY sale 120 RUB'
        assert row['moysklad_id'] not in {o.get('uuid') for o in material['offers']}
    with app.state.store.connect() as db:
        persisted = json.loads(db.execute('SELECT data FROM previews WHERE id=?', (data['preview_id'],)).fetchone()['data'])
    assert [p['quantity'] for p in persisted['payload']['positions']] == [1, 2, 3, 4, 5]
    assert all(p['price'] == 12000 for p in persisted['payload']['positions'])
    assert data['invoice_preview']['sum_total'] == 1800
    assert ms.posts == 0


@pytest.mark.parametrize('changes,detail', [({'parsed_qty': None}, 'количество'),
    ({'parsed_unit': ''}, 'единицу'), ({'retail_price': None}, 'розничную'),
    ({'purchase_price': None}, 'закупку'), ({'retail_source': ''}, 'источник'),
    ({'unit_confirmed': False}, 'Единица сверена')])
def test_catalog_missing_inputs_cannot_confirm(flow, changes, detail):
    c, app, ms, rid, _ = flow
    url = f'/api/requests/{rid}/positions/1'
    c.patch(url, json=changes)
    result = c.patch(url, json={'status': 'confirmed'})
    assert result.status_code == 422
    # Changes to quantity/unit first require explicit re-verification.
    assert detail.casefold() in result.json()['detail'].casefold() or 'сверено' in result.json()['detail'].casefold() or 'сверена' in result.json()['detail'].casefold()
    assert ms.posts == 0
