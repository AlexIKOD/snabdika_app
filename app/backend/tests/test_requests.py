"""Real HTTP request workflow, bypassing the frontend mock."""
import copy
import pytest
from test_startup import startup
from backend.services.matching import Gemini, GeminiError, candidates, keyed


def test_empty_matching_explains_missing_products(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'client_name': 'Ротбанд'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 422
    assert 'позици' in result.json()['detail'].lower()


def test_whole_request_deletion(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'client_name': 'test', 'raw_text': 'Ротбанд'}).json()['data']
    url = f"/api/requests/{request['request_id']}"
    result = client.delete(url)
    assert result.status_code == 200
    assert result.json()['data'] == {'request_id': request['request_id'], 'deleted': True}
    assert client.get(url).status_code in (404, 422)
    assert all(r['request_id'] != request['request_id'] for r in client.get('/api/requests').json()['data'])


def test_claimed_request_cannot_be_deleted(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'client_name': 'test', 'raw_text': 'Ротбанд'}).json()['data']
    with client.app.state.store.connect() as db:
        db.execute('INSERT INTO claims VALUES (?,1,?)', (request['request_id'], 'invoice-operation'))
    assert client.delete(f"/api/requests/{request['request_id']}").status_code == 422
    assert client.app.state.store.request(request['request_id'])['positions']


class FakeGemini:
    available = False

    def __init__(self):
        self.calls = 0
        self.material_id = 20

    def generate(self, prompt, schema, model):
        self.calls += 1
        self.available = True
        if self.calls % 2:
            return {'positions': [{'position_id': 1, 'queries': ['ротбанд'], 'quantity': 20, 'unit': 'мешок'}]}
        return {'positions': [{'position_id': 1, 'suggestions': [{'material_id': self.material_id, 'score': 85}],
                                'questions': ['Уточните фасовку']}]}


def test_matching_uses_catalog_and_requires_operator(startup):
    client, _ = startup
    client.app.state.gemini = FakeGemini()
    request = client.post('/api/requests', json={'client_name': 'test', 'raw_text': 'Ротбанд 20 мешков'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 200, result.text
    position = result.json()['data']['positions'][0]
    assert position['matched_material_id'] == 20
    assert position['matched_material_name'] == 'Ротбанд 30 кг'
    assert position['parsed_qty'] == 20
    assert position['selected_price'] in (600, 700)
    assert position['status'] == 'needs_review'
    assert not position.get('confirmation_hash')
    assert 'Уточните фасовку' in position['reasoning']


def test_missing_order_quantity_and_unit_remain_unconfirmed(startup):
    class MissingOrderTerms(FakeGemini):
        def generate(self, prompt, schema, model):
            self.calls += 1
            self.available = True
            if self.calls == 1:
                return {'positions': [{'position_id': 1, 'queries': ['ротбанд'], 'quantity': None, 'unit': None}]}
            return {'positions': [{'position_id': 1, 'suggestions': [{'material_id': 20, 'score': 85}], 'questions': []}]}

    client, _ = startup
    client.app.state.gemini = MissingOrderTerms()
    request = client.post('/api/requests', json={'doc_number': '345567', 'raw_text': 'ОСП'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 200, result.text
    position = result.json()['data']['positions'][0]
    assert position['matched_material_id'] == 20
    assert position['parsed_qty'] == 1 and position['parsed_unit'] == 'шт'
    assert position['quantity_confirmed'] is False and position['unit_confirmed'] is False
    assert len(position['review_questions']) == 2
    confirmation = client.patch(f"/api/requests/{request['request_id']}/positions/1", json={'status': 'confirmed'})
    assert confirmation.status_code == 422
    assert 'Количество сверено' in confirmation.json()['detail']
    assert client.app.state.store.catalog_moysklad_link(20) is None


def test_supplier_offers_never_switch_the_selected_internal_material(startup):
    class TwoLocalCandidates(FakeGemini):
        def generate(self, prompt, schema, model):
            self.calls += 1
            self.available = True
            if self.calls == 1:
                return {'positions': [{'position_id': 1, 'queries': ['ротбанд', 'кабель'], 'quantity': 2, 'unit': 'шт'}]}
            return {'positions': [{'position_id': 1, 'suggestions': [
                {'material_id': 20, 'score': 90}, {'material_id': 10, 'score': 80}], 'questions': []}]}

    client, _ = startup
    client.app.state.gemini = TwoLocalCandidates()
    request = client.post('/api/requests', json={'raw_text': 'ОСП'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 200, result.text
    position = result.json()['data']['positions'][0]
    assert position['matched_material_id'] == 20
    assert position['matched_material_name'] == 'Ротбанд 30 кг'
    assert {offer['material_id'] for offer in position['alternatives']} == {20}
    assert any('Неоднозначный подбор' in q and '20:' in q for q in position['review_questions'])


def test_invented_material_rejected_without_changing_request(startup):
    client, _ = startup
    fake = FakeGemini()
    fake.material_id = 999
    client.app.state.gemini = fake
    request = client.post('/api/requests', json={'client_name': 'test', 'raw_text': 'Ротбанд'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 502
    assert client.app.state.store.request(request['request_id']) == request


def test_missing_key_gives_settings_guidance(startup, monkeypatch):
    import keyring
    monkeypatch.setattr(keyring, 'get_password', lambda *_: None)
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('SNABDIKA_DEV', raising=False)
    client, _ = startup
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 422
    assert 'Настройки' in result.json()['detail']
    assert client.app.state.store.request(request['request_id']) == request
    assert client.get('/api/integrations/gemini/test').status_code == 422


def test_confirmed_and_claimed_positions_are_preserved(startup):
    client, _ = startup
    client.app.state.gemini = FakeGemini()
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд\nconfirmed\nclaimed'}).json()['data']
    request['positions'][1].update(status='confirmed', confirmation_hash='saved')
    with client.app.state.store.connect() as db:
        client.app.state.store.save_request(request, db)
        db.execute('INSERT INTO claims VALUES (?,3,?)', (request['request_id'], 'invoice'))
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 200, result.text
    assert result.json()['data']['positions'][1:] == request['positions'][1:]


def test_parallel_edit_is_not_overwritten(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд'}).json()['data']
    edited = copy.deepcopy(request)
    edited['positions'][0]['raw_text'] = 'Изменено оператором'
    class ConcurrentGemini(FakeGemini):
        def generate(self, *args):
            with client.app.state.store.connect() as db:
                client.app.state.store.save_request(edited, db)
            return super().generate(*args)
    client.app.state.gemini = ConcurrentGemini()
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 422
    assert client.app.state.store.request(request['request_id']) == edited


@pytest.mark.parametrize('rows', [[], [{'position_id': 2}], [{'position_id': 1}, {'position_id': 1}], [{'position_id': True}]])
def test_missing_duplicate_and_foreign_position_ids_rejected(rows):
    with pytest.raises(GeminiError):
        keyed({'positions': rows}, [1])


@pytest.mark.parametrize('body', [
    {'candidates': []},
    {'candidates': [{'finishReason': 'MAX_TOKENS'}]},
    {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 'not json'}]}}]},
])
def test_invalid_gemini_http_response_is_safe(monkeypatch, body):
    import httpx
    import backend.services.matching as matching
    monkeypatch.setattr(matching, 'api_key', lambda: 'test-secret')
    def post(*args, **kwargs):
        assert kwargs['headers']['x-goog-api-key'] == 'test-secret'
        return httpx.Response(200, json=body)
    monkeypatch.setattr(httpx.Client, 'post', post)
    ai = Gemini()
    with pytest.raises(GeminiError) as error:
        ai.generate('test', {}, 'gemini-2.5-flash')
    assert 'test-secret' not in str(error.value)
    assert not ai.available


def injected_variant(client, request_id, variants, analogs):
    with client.app.state.store.connect() as db:
        data = client.app.state.store.request(request_id, db)
        data['positions'][0].update(variants=variants, analogs=analogs)
        client.app.state.store.save_request(data, db)


def variant_row(material_id, name, klass):
    return {'material_id': material_id, 'canonical_name': name, 'unit': 'шт', 'class': klass, 'score': 80,
            'matched_fields': [], 'conflicting_fields': [],
            'offers': [{'supplier_id': 1, 'supplier_name': 'Поставщик А', 'price': 100,
                        'article': 'A1', 'supplier_code': 'SKU20', 'source_file': 'fixture.xlsx'}]}


def test_variant_selection_is_recorded_and_analog_needs_its_own_confirmation(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд 30 кг'}).json()['data']
    identifier = request['request_id']
    injected_variant(client, identifier, [variant_row(20, 'Ротбанд 30 кг', 'exact')],
                     [variant_row(10, 'Кабель 3х2,5', 'analog')])
    url = f'/api/requests/{identifier}/positions/1/variant'
    refused = client.post(url, json={'material_id': 10})
    assert refused.status_code == 422
    assert 'аналог' in refused.json()['detail'].casefold()
    accepted = client.post(url, json={'material_id': 10, 'confirm_analog': True})
    assert accepted.status_code == 200, accepted.text
    position = accepted.json()['data']
    assert position['matched_material_id'] == 10
    assert position['variant_selected_class'] == 'analog'
    assert position['variant_selected_rank'] == 2
    assert position['variant_selected_by'] == 'local-operator'
    assert position['variant_selected_at']
    assert position['status'] == 'needs_review'
    assert not position.get('confirmation_hash')
    assert position['alternatives'][0]['supplier_name'] == 'Поставщик А'


def test_manual_catalog_pick_replaces_the_ai_variant_list(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд 30 кг'}).json()['data']
    identifier = request['request_id']
    injected_variant(client, identifier, [variant_row(20, 'Ротбанд 30 кг', 'exact')], [])
    url = f'/api/requests/{identifier}/positions/1'
    result = client.patch(url, json={'matched_material_id': 10})
    assert result.status_code == 200, result.text
    position = result.json()['data']
    assert position['variants'] == []
    assert position['analogs'] == []
    assert position['variant_selected_class'] == 'manual'
    assert position['variant_selected_rank'] is None
    assert position['raw_text'] == 'Ротбанд 30 кг'


def test_variant_selection_prefills_prices_from_its_offers(startup):
    client, _ = startup
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд 30 кг'}).json()['data']
    identifier = request['request_id']
    variant = variant_row(20, 'Ротбанд 30 кг', 'exact')
    variant['offers'] = [{'supplier_id': 1, 'supplier_name': 'Поставщик А', 'price': 700, 'price_type': 'purchase',
                          'article': 'A1', 'supplier_code': 'SKU20', 'source_file': 'fixture.xlsx'}]
    injected_variant(client, identifier, [variant], [])
    position = client.post(f'/api/requests/{identifier}/positions/1/variant', json={'material_id': 20}).json()['data']
    assert position['purchase_price'] == 700
    assert position['purchase_source'] == 'Прайс: Поставщик А'
