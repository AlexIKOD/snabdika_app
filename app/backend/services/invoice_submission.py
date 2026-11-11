import json
import logging
from collections import Counter
from uuid import uuid4
from ..store import dumps
from .invoice_assembly import fingerprint, check_product
from .invoice_pricing import number, money
from .moysklad import ExternalError, uuid

log = logging.getLogger(__name__)


def read_operation(store, identifier):
    with store.connect() as db:
        row = db.execute('SELECT * FROM operations WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise ValueError('Операция не найдена')
        data = json.loads(row['data'])
        return {**data, 'invoice_id': row['id'], 'operation_id': row['operation_id'],
                'operation_state': row['state'], 'status': 'created' if row['state'] == 'created' else 'error'}


def reserve(store, preview_id):
    preview_id = uuid(preview_id)
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT id FROM operations WHERE preview_id=?', (preview_id,)).fetchone()
        if existing:
            return existing['id']
        row = db.execute('SELECT data FROM previews WHERE id=?', (preview_id,)).fetchone()
        if not row:
            raise ValueError('Предпросмотр не найден')
        preview = json.loads(row['data'])
        if preview['blocking_reasons']:
            raise ValueError('; '.join(preview['blocking_reasons']))
        req = store.request(preview['request_id'], db)
        for pid, saved in preview['source_hashes'].items():
            p = next((p for p in req['positions'] if str(p['position_id']) == pid), None)
            if not p or p['status'] != 'confirmed' or p['revision'] != preview['source_revisions'][pid] or fingerprint(p) != saved:
                raise ValueError('Предпросмотр устарел; выполните новый расчёт')
            if db.execute('SELECT 1 FROM claims WHERE request_id=? AND position_id=?', (req['request_id'], int(pid))).fetchone():
                raise ValueError('Позиция уже включена в другую операцию')
        operation = str(uuid4())
        payload = {**preview['payload'], 'syncId': operation, 'externalCode': 'snabdika-' + operation}
        data = {**preview['invoice_preview'], 'payload': payload, 'preview': preview,
                'error_text': None, 'moysklad_id': None, 'post_started': False}
        cursor = db.execute('INSERT INTO operations(preview_id,operation_id,state,data) VALUES (?,?,?,?)',
                            (preview_id, operation, 'ready', dumps(data)))
        for pid in preview['source_hashes']:
            db.execute('INSERT INTO claims VALUES (?,?,?)', (req['request_id'], int(pid), operation))
        return cursor.lastrowid


def line_key(row):
    return (row['assortment']['meta']['href'].split('/')[-1], number(row['quantity']), number(row['price']),
            number(row.get('discount', 0)), row.get('vat', 0), row.get('vatEnabled', False),
            row.get('pack', {}).get('id'))


def reconcile(ms, data, document):
    identifier = document['id']
    document = ms.get('/entity/invoiceout/' + identifier)
    rows, offset = [], 0
    while True:
        page = ms.get('/entity/invoiceout/' + identifier + '/positions', {'limit': 100, 'offset': offset})
        rows.extend(page['rows'])
        if len(rows) >= page['meta']['size']:
            break
        offset += len(page['rows'])
        if not page['rows']:
            raise ValueError('Не получены все позиции счёта')
    expected = data['payload']
    for key in ('organization', 'agent', 'store'):
        if document[key]['meta']['href'] != expected[key]['meta']['href']:
            raise ValueError('Реквизиты созданного документа не совпали')
    for key in ('applicable', 'vatEnabled', 'vatIncluded', 'syncId'):
        # MoySklad omits this field for invoices without VAT.
        if key == 'vatIncluded' and not expected['vatEnabled'] and key not in document:
            continue
        if document.get(key) != expected[key]:
            raise ValueError('Не совпало поле документа: ' + key)
    if Counter(map(line_key, rows)) != Counter(map(line_key, expected['positions'])):
        raise ValueError('Состав, цена, количество или налог не совпали')
    if money(number(document['sum']) / 100) != money(data['sum_total']):
        raise ValueError('Итог МойСклад не совпал с предпросмотром')
    if money(number(document.get('vatSum', 0)) / 100) != money(data['sum_vat']):
        raise ValueError('НДС МойСклад не совпал с предпросмотром')
    return {'moysklad_id': identifier, 'number': document['name'],
            'moysklad_href': document.get('meta', {}).get('uuidHref') or
                'https://online.moysklad.ru/app/#invoiceout/edit?id=' + identifier,
            'readback_sum': document['sum'], 'readback_vat_sum': document.get('vatSum', 0)}


def submit(store, ms, identifier):
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM operations WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise ValueError('Операция не найдена')
        if row['state'] in ('created', 'sending'):
            return read_operation(store, identifier)
        previous = row['state']
        data = json.loads(row['data'])
        db.execute('UPDATE operations SET state=? WHERE id=?', ('sending', identifier))
    stage = 'search'
    try:
        # Always search before a possible POST; an uncertain operation never posts again.
        found = ms.get('/entity/invoiceout', {'filter': 'syncId=' + row['operation_id'], 'limit': 100})['rows']
        if len(found) > 1:
            raise ValueError('Найдено несколько документов с маркером операции')
        if found:
            document = found[0]
        elif data['post_started'] or previous == 'outcome_unknown':
            raise ExternalError(0, 'outcome_unknown_no_repost')
        else:
            stage = 'validation'
            req = store.request(data['request_id'])
            for p in req['positions']:
                if str(p['position_id']) in data['preview']['source_hashes']:
                    if p['status'] != 'confirmed' or fingerprint(p) != data['preview']['source_hashes'][str(p['position_id'])]:
                        raise ValueError('Исходные позиции изменились')
                    check_product(ms, p, store)
            for kind, key in (('organization', 'organization_id'), ('store', 'store_id'), ('counterparty', 'agent_id')):
                ms.entity(kind, data['settings'][key])
            data['post_started'] = True
            with store.connect() as db:
                db.execute('UPDATE operations SET data=? WHERE id=?', (dumps(data), identifier))
            stage = 'post'
            document = ms.request('POST', '/entity/invoiceout', data['payload'])
        stage = 'readback'
        result = reconcile(ms, data, document)
        data.update(result)
        data['error_text'] = None
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            req = store.request(data['request_id'], db)
            for p in req['positions']:
                if str(p['position_id']) in data['preview']['source_hashes']:
                    p['invoiced_operation_id'] = row['operation_id']
            req['status'] = 'invoiced' if all(p.get('invoiced_operation_id') for p in req['positions']) else 'review'
            store.save_request(req, db)
            db.execute('UPDATE operations SET state=?,data=? WHERE id=?', ('created', dumps(data), identifier))
        log.info('operation=%s state=created invoice=%s', row['operation_id'], data['moysklad_id'])
    except (ExternalError, ValueError) as exc:
        state = 'outcome_unknown' if data['post_started'] else 'error'
        # Definite rejection permits retry with the same immutable operation.
        if stage == 'post' and isinstance(exc, ExternalError) and exc.status in (400, 401, 403, 404, 412, 429):
            data['post_started'] = False
            state = 'error'
        data['error_text'] = str(exc)
        with store.connect() as db:
            db.execute('UPDATE operations SET state=?,data=? WHERE id=?', (state, dumps(data), identifier))
        log.warning('operation=%s state=%s', row['operation_id'], state)
    return read_operation(store, identifier)
