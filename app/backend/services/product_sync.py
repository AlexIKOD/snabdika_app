"""Idempotently mirror an internal catalog material into the MoySklad product catalog."""
from datetime import datetime, timezone
from threading import RLock

from .moysklad import ExternalError, meta

_sync_lock = RLock()


def material_unit_id(ms, unit_name):
    name = str(unit_name or '').strip()
    if not name:
        raise ValueError('У выбранного материала не заполнена единица измерения в нашей базе')
    rows = ms.get('/entity/uom', {'limit': 100, 'search': name}).get('rows', [])
    exact = [row for row in rows if str(row.get('name', '')).strip().casefold() == name.casefold()]
    if len(exact) != 1:
        raise ValueError(f'В МойСклад не найдена однозначная единица «{name}»')
    return exact[0]['id']


def _find_by_external_code(ms, external_code):
    rows = ms.get('/entity/product', {'limit': 100, 'filter': 'externalCode=' + external_code}).get('rows', [])
    matches = [row for row in rows if row.get('externalCode') == external_code]
    if len(matches) > 1:
        raise ValueError('В МойСклад найдено несколько карточек с кодом связи материала')
    return matches[0] if matches else None


def _sync_material(store, ms, catalog, material_id):
    material = catalog.material(int(material_id))
    name, unit_name = material['canonical_name'].strip(), material['unit'].strip()
    if not name:
        raise ValueError('У выбранного материала не заполнено наименование в нашей базе')
    unit_id = material_unit_id(ms, unit_name)
    external_code = f'snabdika-material-{int(material_id)}'
    linked = store.catalog_moysklad_link(int(material_id))
    found = _find_by_external_code(ms, external_code)
    if linked and found and linked['moysklad_id'] != found.get('id'):
        raise ValueError('Связь материала с МойСклад конфликтует с зарезервированным кодом карточки')
    if linked and not found:
        # A manually deleted card can be recreated; the deterministic external code makes retries safe.
        try:
            found = ms.entity('product', linked['moysklad_id'])
        except ExternalError as error:
            if error.status != 404:
                raise
    if not found:
        found = ms.request('POST', '/entity/product', {
            'name': name,
            'externalCode': external_code,
            'uom': meta('uom', unit_id),
        })
    identifier = found['id']
    product = ms.entity('product', identifier)
    actual_unit = (product.get('uom') or {}).get('meta', {}).get('href', '').rstrip('/').split('/')[-1]
    if actual_unit != unit_id:
        raise ValueError('Единица существующей карточки МойСклад отличается от единицы материала в нашей базе')
    if product.get('name') != name:
        raise ValueError('Наименование связанной карточки МойСклад отличается от материала в нашей базе')
    if product.get('externalCode') != external_code:
        raise ValueError('Не удалось проверить код связи карточки МойСклад с материалом')
    store.save_catalog_moysklad_link({
        'material_id': int(material_id),
        'moysklad_id': identifier,
        'unit_id': unit_id,
        'external_code': external_code,
        'canonical_name': name,
        'synced_at': datetime.now(timezone.utc).isoformat(),
    })
    return {'moysklad_id': identifier, 'unit_id': unit_id, 'name': name, 'unit': unit_name,
            'external_code': external_code}


def ensure_material_product(store, ms, catalog, material_id):
    """Create once, recover uncertain POST outcomes by deterministic externalCode, then persist the link."""
    with _sync_lock:
        return _sync_material(store, ms, catalog, material_id)
