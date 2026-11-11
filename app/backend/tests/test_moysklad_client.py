"""The shared MoySklad client must survive responses without a JSON body."""
import httpx
from backend.services import moysklad as module


def test_delete_with_empty_body_returns_none(monkeypatch):
    monkeypatch.setattr(module, 'token', lambda: 'fixture-token')
    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop('timeout', None)
        return real_client(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, content=b'', request=request)), **kwargs)

    monkeypatch.setattr(module.httpx, 'Client', factory)
    assert module.Moysklad().request('DELETE', '/entity/invoiceout/metadata/states/fixture') is None


def test_error_response_still_reports_the_code(monkeypatch):
    monkeypatch.setattr(module, 'token', lambda: 'fixture-token')
    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop('timeout', None)
        return real_client(transport=httpx.MockTransport(
            lambda request: httpx.Response(409, json={'errors': [{'code': 'state_in_use'}]}, request=request)), **kwargs)

    monkeypatch.setattr(module.httpx, 'Client', factory)
    try:
        module.Moysklad().request('DELETE', '/entity/invoiceout/metadata/states/fixture')
    except module.ExternalError as error:
        assert error.status == 409 and error.code == 'state_in_use'
    else:
        raise AssertionError('ожидалась ошибка')
