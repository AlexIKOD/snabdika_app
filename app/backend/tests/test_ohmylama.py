import pytest
from test_startup import startup


def test_slow_response_has_explicit_timeout_and_actionable_message(monkeypatch):
    import httpx
    import keyring
    from backend.services.matching import OhMyLama, GeminiError
    monkeypatch.setattr(keyring, 'get_password', lambda *_: 'fixture-secret')

    def post(self, *args, **kwargs):
        assert self.timeout.read == 180
        assert self.timeout.connect == 15
        raise httpx.ReadTimeout('fixture-secret')

    monkeypatch.setattr(httpx.Client, 'post', post)
    with pytest.raises(GeminiError, match='180') as error:
        OhMyLama().generate('test', {'type': 'OBJECT'}, 'gpt-6-luna')
    assert 'fixture-secret' not in str(error.value)


def test_ohmylama_secret_and_provider_settings(startup, monkeypatch):
    import keyring
    saved = {}
    monkeypatch.setattr(keyring, 'set_password', lambda service, key, value: saved.update({key: value}))
    monkeypatch.setattr(keyring, 'get_password', lambda service, key: saved.get(key))
    client, _ = startup
    assert client.post('/api/secrets/ohmylama_api_key', json={'value': 'fixture-only'}).status_code == 200
    assert client.get('/api/secrets/ohmylama_api_key/status').json()['is_set'] is True
    result = client.put('/api/settings', json={'ai_provider': 'ohmylama', 'ai_model': 'gpt-6-luna'})
    assert result.status_code == 200
    assert result.json()['data']['ai_provider'] == 'ohmylama'
    assert 'fixture-only' not in str(client.get('/api/settings').json())
    assert client.put('/api/settings', json={'ai_base_url': 'https://other.example/v1'}).status_code == 422
    assert client.put('/api/settings', json={'ai_provider': 'arbitrary'}).status_code == 422


@pytest.mark.parametrize('status', [401, 402, 429, 500])
def test_provider_failures_are_safe_and_actionable(monkeypatch, status):
    import httpx
    import keyring
    from backend.services.matching import OhMyLama, GeminiError
    monkeypatch.setattr(keyring, 'get_password', lambda *_: 'fixture-secret')
    monkeypatch.setattr(httpx.Client, 'post', lambda *a, **kw: httpx.Response(status,
        json={'error': {'message': 'do not reflect fixture-secret'}}))
    ai = OhMyLama()
    with pytest.raises(GeminiError) as error:
        ai.generate('test', {'type': 'OBJECT'}, 'gpt-6-luna')
    assert str(status) in str(error.value)
    assert 'fixture-secret' not in str(error.value)
    assert not ai.available
    if status == 402:
        assert 'баланс' in str(error.value).lower()


def test_openai_compatible_payload_and_json_output(monkeypatch):
    import httpx
    import keyring
    from backend.services.matching import OhMyLama, PARSE
    monkeypatch.setattr(keyring, 'get_password', lambda *_: 'fixture-secret')
    def post(self, url, **kw):
        assert url == 'https://ohmylama.ru/v1/chat/completions'
        assert kw['headers']['Authorization'] == 'Bearer fixture-secret'
        body = kw['json']
        assert body['model'] == 'gpt-6-luna'
        schema = body['response_format']['json_schema']['schema']
        assert schema['type'] == 'object' and schema['additionalProperties'] is False
        assert 'null' in schema['properties']['positions']['items']['properties']['quantity']['type']
        return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': '{"positions": []}'}}]})
    monkeypatch.setattr(httpx.Client, 'post', post)
    ai = OhMyLama()
    assert ai.generate('test', PARSE, 'gpt-6-luna') == {'positions': []}
    assert ai.available


def test_matching_routes_to_selected_provider(startup):
    from test_requests import FakeGemini
    client, _ = startup
    fake = FakeGemini()
    client.app.state.ohmylama = fake
    assert client.put('/api/settings', json={'ai_provider': 'ohmylama', 'ai_model': 'gpt-6-luna'}).status_code == 200
    request = client.post('/api/requests', json={'raw_text': 'Ротбанд'}).json()['data']
    result = client.post(f"/api/requests/{request['request_id']}/match")
    assert result.status_code == 200
    assert fake.calls == 2
    assert client.get('/api/health').json()['data']['ai']['provider'] == 'ohmylama'
