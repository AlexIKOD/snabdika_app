"""Only this backend module handles the external credential."""
import logging
import os
from pathlib import Path
from uuid import UUID, uuid4
import httpx

BASE = 'https://api.moysklad.ru/api/remap/1.2'
log = logging.getLogger(__name__)


def uuid(value):
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise ValueError('Требуется точный UUID МойСклад') from None


def token():
    import keyring
    value = keyring.get_password('Snabdika', 'moysklad_token')
    if value:
        return value
    value = os.environ.get('MOYSKLAD_TOKEN')
    if not value and os.environ.get('SNABDIKA_DEV') == '1':
        path = Path(__file__).resolve().parents[3] / '.env'
        if path.exists():
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                if line.startswith('MOYSKLAD_TOKEN='):
                    value = line.split('=', 1)[1].strip().strip('\"\'')
    if not value:
        raise ValueError('Токен МойСклад не настроен в защищённом хранилище')
    if os.environ.get('SNABDIKA_DEV') == '1':
        keyring.set_password('Snabdika', 'moysklad_token', value)
    return value


class ExternalError(Exception):
    def __init__(self, status, code='api_error'):
        self.status, self.code = status, str(code)
        super().__init__(f'МойСклад HTTP {status}, код {code}')


class Moysklad:
    def request(self, method, path, body=None, params=None):
        self.connected = False
        correlation = str(uuid4())
        try:
            with httpx.Client(timeout=35, headers={'Authorization': 'Bearer ' + token(),
                    'Accept-Encoding': 'gzip', 'Content-Type': 'application/json'}) as client:
                response = client.request(method, BASE + path, json=body, params=params)
        except httpx.TransportError:
            raise ExternalError(0, 'transport_unknown') from None
        log.info('moysklad method=%s status=%s correlation=%s', method, response.status_code, correlation)
        if response.is_error:
            try:
                code = response.json().get('errors', [{}])[0].get('code', 'api_error')
            except (ValueError, IndexError):
                code = 'api_error'
            raise ExternalError(response.status_code, code)
        # DELETE and some metadata calls answer with an empty body.
        result = response.json() if response.content else None
        self.connected = True
        return result

    def get(self, path, params=None):
        return self.request('GET', path, params=params)

    def entity(self, kind, identifier):
        if kind not in ('organization', 'store', 'counterparty', 'product', 'variant', 'bundle', 'service'):
            raise ValueError('Недопустимый тип справочника')
        row = self.get(f'/entity/{kind}/{uuid(identifier)}')
        if row.get('archived'):
            raise ValueError('Карточка архивирована')
        return row

    def dictionary(self, kind, query=''):
        if kind not in ('organization', 'store', 'counterparty', 'product'):
            raise ValueError('Недопустимый справочник')
        return self.get('/entity/' + kind, {'limit': 100, 'search': query, 'filter': 'archived=false'})['rows']


def meta(kind, identifier):
    return {'meta': {'href': BASE + '/entity/' + kind + '/' + uuid(identifier),
                     'type': kind, 'mediaType': 'application/json'}}
