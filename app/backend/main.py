import json
import logging
import os
import secrets
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.gzip import GZipMiddleware
from .store import Store, dumps
from .services.moysklad import Moysklad, ExternalError
from .services.invoice_assembly import build_preview, fingerprint, check_product, validate_confirmation, SIGNIFICANT
from .services.invoice_pricing import DEFAULT_PRICING, sale_prices
from .services.invoice_submission import reserve, submit, read_operation
from .services.catalog import Catalog, CatalogUnavailable
from .services.product_sync import ensure_material_product
from .services.matching import Gemini, OhMyLama, GeminiError, match_positions, price_fields, OHMYLAMA_URL


def public(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        numeric = {'sum_total', 'sum_without_vat', 'sum_vat', 'sum_purchase', 'profit', 'actual_discount',
                   'actual_margin', 'markup', 'rounding_residual', 'target_base', 'price_retail', 'price_final',
                   'price_purchase', 'margin_sum', 'margin_percent', 'qty', 'discount_percent', 'sale_price'}
        return {k: float(v) if k in numeric and isinstance(v, str) else public(v)
                for k, v in value.items() if k not in ('payload', 'preview', 'source_hashes', 'post_started')}
    if isinstance(value, list):
        return [public(v) for v in value]
    return value


def create_app(path=None, ms=None, auth=None):
    store = Store(path or Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Snabdika' / 'invoices.sqlite3')
    ms = ms or Moysklad()
    auth = auth or os.environ.get('SNABDIKA_LOCAL_KEY') or secrets.token_urlsafe(32)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=1)
    catalog = Catalog()
    app.state.store, app.state.ms, app.state.auth = store, ms, auth
    app.state.gemini = Gemini()
    app.state.ohmylama = OhMyLama()
    with store.connect() as db:
        db.execute("UPDATE operations SET state='outcome_unknown' WHERE state='sending'")

    @app.middleware('http')
    async def local_only(request: Request, call_next):
        if request.headers.get('host', '').split(':')[0] not in ('127.0.0.1', 'localhost', 'testserver'):
            return JSONResponse({'detail': 'Недопустимый host'}, status_code=403)
        if not secrets.compare_digest(request.headers.get('x-snab-key', ''), auth):
            return JSONResponse({'detail': 'Нет локальной авторизации'}, status_code=401)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid(_request, error):
        logging.warning('validation_rejected reason=%s', str(error))
        return JSONResponse({'detail': str(error)}, status_code=422)

    @app.exception_handler(ExternalError)
    async def external(_request, error):
        return JSONResponse({'detail': str(error)}, status_code=502)

    @app.exception_handler(CatalogUnavailable)
    async def unavailable(_request, error):
        return JSONResponse({'detail': str(error)}, status_code=503)

    @app.exception_handler(GeminiError)
    async def ai_error(_request, error):
        logging.warning('[FIX] matching_rejected reason=%s', str(error))
        return JSONResponse({'detail': str(error)}, status_code=502)

    @app.exception_handler(LookupError)
    async def not_found(_request, error):
        return JSONResponse({'detail': str(error)}, status_code=404)

    def response(data):
        return {'data': public(data)}

    defaults = {'table_density': 'standard', 'rows_per_page': 50, 'default_supplier': '',
                'default_price_type': 'retail', 'supplier_selection_mode': 'min_purchase',
                'confidence_threshold_percent': 90, 'moysklad_api_url': 'https://api.moysklad.ru/api/remap/1.2',
                'moysklad_organization': '', 'moysklad_warehouse': '', 'moysklad_vat_rate': 'Без НДС',
                'gemini_model_vision': 'gemini-2.5-flash', 'gemini_model_embeddings': '',
                'ai_provider': 'gemini', 'ai_base_url': OHMYLAMA_URL, 'ai_model': 'gpt-6-luna',
                'database_path': store.path, 'images_path': '', 'images_retention_days': 30, 'log_level': 'INFO'}

    @app.get('/api/settings')
    def settings():
        with store.connect() as db:
            row = db.execute('SELECT data FROM settings WHERE id=1').fetchone()
        return response({**defaults, **(json.loads(row['data']) if row else {})})

    @app.put('/api/settings')
    def save_settings(body: dict):
        if any(k not in defaults or type(v) is not type(defaults[k]) for k, v in body.items()):
            raise ValueError('Недопустимое поле настроек')
        if body.get('moysklad_api_url', defaults['moysklad_api_url']) != defaults['moysklad_api_url']:
            raise ValueError('Адрес API МойСклад фиксирован')
        if body.get('ai_base_url', OHMYLAMA_URL) != OHMYLAMA_URL:
            raise ValueError('Адрес API OhMyLama фиксирован')
        if body.get('ai_provider', 'gemini') not in ('gemini', 'ohmylama'):
            raise ValueError('Недопустимый AI-провайдер')
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT data FROM settings WHERE id=1').fetchone()
            value = {**(json.loads(row['data']) if row else {}), **body}
            db.execute('INSERT OR REPLACE INTO settings VALUES (1, ?)', (dumps(value),))
        return response({**defaults, **value})

    @app.get('/api/secrets/{key}/status')
    def secret_status(key: str):
        import keyring
        if key not in ('moysklad_token', 'gemini_api_key', 'ohmylama_api_key'):
            raise ValueError('Недопустимый ключ')
        return {'is_set': bool(keyring.get_password('Snabdika', key)), 'updated_at': None}

    @app.post('/api/secrets/{key}')
    def save_secret(key: str, body: dict):
        import keyring
        if key not in ('moysklad_token', 'gemini_api_key', 'ohmylama_api_key') or not isinstance(body.get('value'), str) or not body['value'].strip():
            raise ValueError('Недопустимый секрет')
        keyring.set_password('Snabdika', key, body['value'].strip())
        return {'status': 'stored'}

    @app.get('/api/health')
    def health():
        try:
            summary, files, layer = catalog.summary(), catalog.file_status(), True
        except CatalogUnavailable:
            summary, files, layer = None, [], False
        connected = getattr(ms, 'connected', False)
        config = settings()['data']
        engine = app.state.ohmylama if config['ai_provider'] == 'ohmylama' else app.state.gemini
        with store.connect() as db:
            database_version = str(db.execute('PRAGMA user_version').fetchone()[0])
        return response({'status': 'healthy' if layer else 'degraded', 'data_layer': layer, 'database_version': database_version,
                         'database_path': store.path, 'parquet_status': files, 'catalog': summary,
                         'moysklad': {'connected': connected, 'status_text': 'Последний запрос успешен' if connected else 'Соединение не проверено или недоступно'},
                         'gemini': {'available': app.state.gemini.available, 'status_text': 'Последний запрос успешен' if app.state.gemini.available else 'Соединение не проверено или недоступно'},
                         'ai': {'provider': config['ai_provider'], 'model': config['ai_model'] if config['ai_provider'] == 'ohmylama' else config['gemini_model_vision'],
                                'available': engine.available, 'status_text': 'Последний запрос успешен' if engine.available else 'Соединение не проверено или недоступно'},
                         'app_version': '0.1.0'})

    @app.get('/api/materials')
    def materials(query: str = '', category: str = '', supplier_id: int | None = None,
                  has_price: Literal['all', 'with_price', 'no_price'] = 'all',
                  has_weight: Literal['all', 'with_weight', 'no_weight'] = 'all',
                  has_price_conflict: bool = False, has_suspected_merge: bool = False,
                  sort_by: Literal['id', 'name', 'weight', 'price'] = 'name', sort_dir: Literal['asc', 'desc'] = 'asc',
                  page: int = Query(1, ge=1), page_size: int = Query(200, ge=1, le=1000)):
        rows = catalog.materials(query, category, supplier_id, has_price, has_weight,
                                 has_price_conflict, has_suspected_merge, sort_by, sort_dir)
        start = (page - 1) * page_size
        return JSONResponse({'data': rows[start:start + page_size], 'meta': {
            'total': len(rows), 'catalog_total': len(catalog.rows), 'page': page, 'page_size': page_size}})

    @app.get('/api/materials/{identifier}')
    def material(identifier: int):
        return response(catalog.material(identifier))

    @app.get('/api/dictionaries/categories')
    def categories():
        return response(catalog.categories())

    @app.get('/api/suppliers')
    def suppliers():
        catalog.load()
        return response(catalog.suppliers)

    @app.get('/api/imports')
    def imports():
        catalog.load()
        return response([{'import_id': int(r['import_id']), 'supplier': r.get('supplier') or '',
                          'source_file': r.get('source_file') or '', 'imported_at': r.get('imported_at') or '',
                          'created': int(r.get('created') or 0), 'updated': int(r.get('updated') or 0),
                          'skipped': int(r.get('rows_skipped') or 0), 'review': int(r.get('needs_review') or 0),
                          'duplicate_file': False, 'warnings': [], 'items': []} for r in catalog.logs])

    @app.get('/api/logs')
    def logs():
        catalog.load()
        return response([{'log_id': int(r['import_id']), 'level': 'INFO', 'category': 'IMPORT',
                          'message': f"Импорт {r.get('source_file', '')}: создано {r.get('created', 0)}, обновлено {r.get('updated', 0)}",
                          'created_at': r.get('imported_at') or ''} for r in catalog.logs])

    @app.get('/api/dashboard')
    def dashboard():
        catalog.load()
        with store.connect() as db:
            requests = [json.loads(r['data']) for r in db.execute('SELECT data FROM requests')]
            invoices = [json.loads(r['data']) for r in db.execute("SELECT data FROM operations WHERE state='created'")]
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(days=7)).isoformat()
        recent = [r for r in invoices if r['created_at'] >= cutoff]
        return response({'materials_count': len(catalog.rows), 'materials_diff_7d': 0,
            'offers_count': sum(s['offers_count'] for s in catalog.suppliers), 'suppliers_active_count': len(catalog.suppliers),
            'requests_in_progress': sum(r['status'] not in ('archived', 'invoiced') for r in requests),
            'requests_need_attention': sum(any(p['status'] != 'confirmed' and not p.get('invoiced_operation_id') for p in r['positions']) for r in requests if r['status'] != 'archived'),
            'invoices_7d_count': len(recent), 'invoices_7d_sum': sum(Decimal(str(r['sum_total'])) for r in recent),
            'materials_without_price_count': sum(not any((o['price'] or 0) > 0 for o in r['offers']) for r in catalog.rows),
            'materials_without_weight_count': sum(not (r['weight_kg'] or 0) > 0 for r in catalog.rows),
            'price_conflicts_count': sum('price_conflict' in r['flags'] for r in catalog.rows),
            'suspected_merges_count': sum('suspected_false_merge' in r['flags'] for r in catalog.rows)})

    @app.get('/api/requests')
    def requests():
        with store.connect() as db:
            return response([json.loads(r['data']) for r in db.execute('SELECT data FROM requests ORDER BY id DESC')])

    @app.post('/api/requests')
    def create_request(body: dict):
        now = datetime.now().isoformat()
        data = {'client_name': str(body.get('client_name', '')), 'doc_number': str(body.get('doc_number', '')),
                'positions': [], 'files': [], 'pricing': dict(DEFAULT_PRICING),
                'created_at': now, 'updated_at': now, 'status': 'draft'}
        for i, text in enumerate(str(body.get('raw_text', '')).splitlines()):
            if text.strip():
                data['positions'].append(new_position(i + 1, {'raw_text': text, 'parsed_qty': 1, 'parsed_unit': 'шт',
                    'quantity_confirmed': False, 'unit_confirmed': False}))
        with store.connect() as db:
            cursor = db.execute('INSERT INTO requests(data) VALUES (?)', (dumps(data),))
            data['request_id'] = cursor.lastrowid
            store.save_request(data, db)
        return response(data)

    @app.get('/api/requests/{identifier}')
    def get_request(identifier: int):
        data = store.request(identifier)
        try:
            view = sale_prices(data['positions'], data['pricing'])
        except ValueError:
            view = {'positions': []}
        prices = {row['position_id']: row['sale_price'] for row in view['positions']}
        for position in data['positions']:
            position['sale_price'] = prices.get(position['position_id'])
        return response(data)

    def pricing_view(data):
        return {'pricing': data['pricing'], **sale_prices(data['positions'], data['pricing'])}

    @app.get('/api/requests/{identifier}/pricing')
    def read_pricing(identifier: int):
        with store.connect() as db:
            return response(pricing_view(store.request(identifier, db)))

    @app.post('/api/requests/{identifier}/pricing')
    def save_pricing(identifier: int, body: dict):
        if set(body) - set(DEFAULT_PRICING):
            raise ValueError('Недопустимое поле настроек расчёта')
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data = store.request(identifier, db)
            settings = {**data['pricing'], **body}
            view = {'pricing': settings, **sale_prices(data['positions'], settings)}
            data['pricing'] = settings
            data['updated_at'] = datetime.now().isoformat()
            store.save_request(data, db)
        return response(view)

    @app.delete('/api/requests/{identifier}')
    def delete_request(identifier: int):
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data = store.request(identifier, db)
            linked = db.execute('SELECT 1 FROM claims WHERE request_id=?', (identifier,)).fetchone()
            operation = any(json.loads(r['data']).get('request_id') == identifier for r in db.execute('SELECT data FROM operations'))
            if linked or operation or any(p.get('invoiced_operation_id') for p in data['positions']):
                raise ValueError('Запрос связан со счётом: удаление недоступно, чтобы сохранить историю операции')
            # A saved preview must not survive deletion and later reuse of a SQLite row ID.
            for row in db.execute('SELECT id,data FROM previews').fetchall():
                if json.loads(row['data']).get('request_id') == identifier:
                    db.execute('DELETE FROM previews WHERE id=?', (row['id'],))
            db.execute('DELETE FROM requests WHERE id=?', (identifier,))
        logging.info('[FIX] request_deleted request=%s', identifier)
        return response({'request_id': identifier, 'deleted': True})

    @app.post('/api/requests/{identifier}/match')
    def run_matching(identifier: int):
        original = store.request(identifier)
        if not original['positions']:
            raise ValueError('В запросе нет позиций. Добавьте товары кнопкой «Добавить позицию». Название клиента не участвует в поиске.')
        with store.connect() as db:
            claimed = {r['position_id'] for r in db.execute('SELECT position_id FROM claims WHERE request_id=?', (identifier,))}
        positions = [p for p in original['positions'] if p['position_id'] not in claimed and
                     p['status'] not in ('confirmed', 'rejected') and not p.get('invoiced_operation_id')]
        if not positions:
            raise ValueError('Нет позиций для сопоставления. Подтверждённые и выставленные позиции не изменяются.')
        if len(positions) > 50:
            raise ValueError('За один запуск можно сопоставить до 50 неподтверждённых позиций')
        logging.info('[FIX] matching_started request=%s positions=%s', identifier, len(positions))
        config = settings()['data']
        engine = app.state.ohmylama if config['ai_provider'] == 'ohmylama' else app.state.gemini
        model = config['ai_model'] if config['ai_provider'] == 'ohmylama' else config['gemini_model_vision']
        updates = match_positions(positions, catalog, engine, model)
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = store.request(identifier, db)
            if current != original:
                raise ValueError('Запрос изменён во время сопоставления. Обновите карточку и повторите запуск.')
            if any(r['position_id'] in updates for r in db.execute('SELECT position_id FROM claims WHERE request_id=?', (identifier,))):
                raise ValueError('Позиции закреплены за счётом во время сопоставления')
            for position in current['positions']:
                if position['position_id'] not in updates:
                    continue
                for field in ('confirmed_at', 'confirmed_by', 'moysklad_id', 'unit_id', 'assortment_type',
                              'pack_id', 'pack_quantity', 'retail_price', 'purchase_price', 'retail_source', 'purchase_source',
                              'variant_selected_at', 'variant_selected_by', 'variant_selected_rank', 'variant_selected_class'):
                    position.pop(field, None)
                position.update(updates[position['position_id']])
                position['revision'] += 1
            current['status'] = 'review'
            current['updated_at'] = datetime.now().isoformat()
            store.save_request(current, db)
        logging.info('[FIX] matching_completed request=%s positions=%s', identifier, len(updates))
        return response(current)

    @app.post('/api/requests/{identifier}/positions')
    def add_position(identifier: int, body: dict):
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data = store.request(identifier, db)
            data['positions'].append(new_position(max([p['position_id'] for p in data['positions']] + [0]) + 1, body))
            store.save_request(data, db)
        return response(data)

    @app.patch('/api/requests/{identifier}/positions/{pid}')
    def patch_position(identifier: int, pid: int, body: dict):
        original = store.request(identifier)
        original_position = next((row for row in original['positions'] if row['position_id'] == pid), None)
        if not original_position:
            raise ValueError('Позиция не найдена')
        allowed = (set(SIGNIFICANT) - {'moysklad_id', 'assortment_type', 'unit_id'}) | {
            'matched_material_name', 'matched_material_unit', 'confidence', 'reasoning', 'review_questions',
            'alternatives', 'status', 'pack_quantity'}
        patch = {k: v for k, v in body.items() if k in allowed}
        if 'parsed_qty' in patch and patch['parsed_qty'] != original_position.get('parsed_qty') and 'quantity_confirmed' not in patch:
            patch['quantity_confirmed'] = False
        if 'parsed_unit' in patch and patch['parsed_unit'] != original_position.get('parsed_unit') and 'unit_confirmed' not in patch:
            patch['unit_confirmed'] = False
        if 'matched_material_id' in patch and patch['matched_material_id'] != original_position.get('matched_material_id') and 'unit_confirmed' not in patch:
            patch['unit_confirmed'] = False
        if patch.get('matched_material_id'):
            material = catalog.material(int(patch['matched_material_id']))
            patch['matched_material_name'] = material['canonical_name']
            patch['matched_material_unit'] = material['unit']
            if patch['matched_material_id'] != original_position.get('matched_material_id'):
                # A manual pick replaces the AI list for this line only; the request text stays untouched.
                patch.update(variants=[], analogs=[], variant_selected_at=datetime.now().isoformat(),
                             variant_selected_by='local-operator', variant_selected_rank=None,
                             variant_selected_class='manual')
        changed = any(original_position.get(k) != patch[k] for k in SIGNIFICANT if k in patch)
        candidate = {**original_position, **patch}
        if changed:
            candidate['status'] = 'needs_review'
            candidate['confirmation_hash'] = None
        elif patch.get('status') == 'confirmed':
            with store.connect() as db:
                if db.execute('SELECT 1 FROM claims WHERE request_id=? AND position_id=?', (identifier, pid)).fetchone():
                    raise ValueError('Позиция закреплена за операцией счёта')
            material = validate_confirmation(candidate, catalog)
            candidate['matched_material_name'] = material['canonical_name']
            candidate['matched_material_unit'] = material['unit']
            candidate['parsed_unit'] = material['unit']
            linked = ensure_material_product(store, ms, catalog, material['material_id'])
            candidate.update(moysklad_id=linked['moysklad_id'], unit_id=linked['unit_id'], assortment_type='product')
            check_product(ms, candidate, store)
            candidate['confirmation_hash'] = fingerprint(candidate)
            candidate['confirmed_at'] = datetime.now().isoformat()
            candidate['confirmed_by'] = 'local-operator'

        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data = store.request(identifier, db)
            p = next((p for p in data['positions'] if p['position_id'] == pid), None)
            if not p:
                raise ValueError('Позиция не найдена')
            if p != original_position:
                raise ValueError('Позиция изменилась во время проверки. Обновите карточку и подтвердите ещё раз.')
            if db.execute('SELECT 1 FROM claims WHERE request_id=? AND position_id=?', (identifier, pid)).fetchone():
                raise ValueError('Позиция закреплена за операцией счёта')
            p.update(candidate)
            p['revision'] += 1
            if changed:
                p['status'] = 'needs_review'
                p['confirmation_hash'] = None
            elif p['status'] != 'confirmed':
                p['confirmation_hash'] = None
            store.save_request(data, db)
            logging.info('position=%s request=%s revision=%s status=%s', pid, identifier, p['revision'], p['status'])
        return response(with_sale_price(p, data))

    @app.post('/api/requests/{identifier}/positions/{pid}/variant')
    def select_variant(identifier: int, pid: int, body: dict):
        material_id = body.get('material_id')
        if type(material_id) is not int:
            raise ValueError('Передайте товар выбранного варианта')
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data = store.request(identifier, db)
            position = next((p for p in data['positions'] if p['position_id'] == pid), None)
            if not position:
                raise ValueError('Позиция не найдена')
            if db.execute('SELECT 1 FROM claims WHERE request_id=? AND position_id=?', (identifier, pid)).fetchone():
                raise ValueError('Позиция закреплена за операцией счёта')
            ordered = (position.get('variants') or []) + (position.get('analogs') or [])
            index = next((i for i, v in enumerate(ordered) if v['material_id'] == material_id), None)
            if index is None:
                raise ValueError('Этот вариант отсутствует в подборе позиции')
            variant = ordered[index]
            if variant['class'] == 'analog' and body.get('confirm_analog') is not True:
                raise ValueError('Аналог требует отдельного подтверждения замены')
            material = catalog.material(material_id)
            offers = variant.get('offers') or []
            position.update(matched_material_id=material_id, matched_material_name=material['canonical_name'],
                matched_material_unit=material['unit'], confidence=variant['score'],
                selected_supplier_id=offers[0]['supplier_id'] if offers else None,
                selected_price=offers[0]['price'] if offers else None,
                alternatives=[{**offer, 'material_id': material_id, 'name': material['canonical_name'],
                               'score': variant['score']} for offer in offers],
                status='needs_review', confirmation_hash=None,
                variant_selected_at=datetime.now().isoformat(), variant_selected_by='local-operator',
                variant_selected_rank=index + 1, variant_selected_class=variant['class'],
                **price_fields(material, offers))
            position['revision'] += 1
            store.save_request(data, db)
        logging.info('[FIX] variant_selected request=%s position=%s material=%s rank=%s class=%s',
                     identifier, pid, material_id, index + 1, variant['class'])
        return response(with_sale_price(position, data))

    @app.delete('/api/requests/{identifier}/positions/{pid}')
    def delete_position(identifier: int, pid: int):
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM claims WHERE request_id=? AND position_id=?', (identifier, pid)).fetchone():
                raise ValueError('Позиция закреплена за счётом')
            data = store.request(identifier, db)
            data['positions'] = [p for p in data['positions'] if p['position_id'] != pid]
            store.save_request(data, db)
        return response(data)

    @app.get('/api/moysklad/dictionaries/{kind}')
    def dictionary(kind: str, query: str = ''):
        return response(ms.dictionary(kind, query))

    @app.get('/api/moysklad/products/{identifier}')
    def product(identifier: str):
        return response(ms.entity('product', identifier))

    @app.get('/api/moysklad/metadata/{kind}')
    def metadata(kind: str):
        if kind not in ('counterparty', 'product', 'invoiceout'):
            raise ValueError('Недопустимый тип метаданных')
        data = ms.get('/entity/' + kind + '/metadata')
        data['attributes'] = ms.get('/entity/' + kind + '/metadata/attributes')
        return response(data)

    @app.post('/api/moysklad/dictionaries/{kind}')
    def create_dictionary(kind: str, body: dict):
        if kind not in ('counterparty', 'store'):
            raise ValueError('Создание доступно для контрагента и склада')
        name = str(body.get('name', '')).strip()
        if not name or len(name) > 255:
            raise ValueError('Введите наименование')
        payload = {'name': name}
        for key in ('inn', 'kpp', 'email', 'phone', 'description', 'companyType'):
            if key in body:
                payload[key] = str(body[key])
        # Attribute IDs and types must come from actual metadata, never from arbitrary URLs.
        if body.get('attributes'):
            attributes = ms.get('/entity/' + kind + '/metadata/attributes')['rows']
            by_id = {a['id']: a for a in attributes}
            payload['attributes'] = []
            for field in body['attributes']:
                definition = by_id.get(field.get('id'))
                if not definition or definition['type'] not in ('string', 'text', 'double', 'long', 'boolean', 'time'):
                    raise ValueError('Неизвестное или неподдерживаемое служебное поле')
                payload['attributes'].append({'meta': definition['meta'], 'value': field['value']})
        return response(ms.request('POST', '/entity/' + kind, payload))

    @app.post('/api/requests/{identifier}/invoice/preview')
    def preview(identifier: int, body: dict):
        required = {'position_ids', 'organization_id', 'agent_id', 'store_id', 'doc_date', 'merge'}
        if not required.issubset(body):
            raise ValueError('Заполните все параметры счёта')
        if not isinstance(body['position_ids'], list) or not all(type(i) is int for i in body['position_ids']):
            raise ValueError('Передайте список ID исходных строк')
        if not isinstance(body['doc_date'], str):
            raise ValueError('Некорректная дата')
        if not isinstance(body.get('merge'), bool):
            raise ValueError('Укажите флаг merge')
        return response(build_preview(store, ms, identifier, body))

    @app.post('/api/invoices/catalog-drafts')
    def catalog_draft(body: dict):
        ids = body.get('material_ids')
        if (not isinstance(ids, list) or not ids or
                not all(type(i) is int for i in ids) or len(set(ids)) != len(ids)):
            raise ValueError('Выберите один или несколько материалов без повторов')
        materials = [catalog.material(i) for i in ids]
        positions = []
        for i, material in enumerate(materials, 1):
            position = new_position(i, {'raw_text': material['canonical_name'],
                'parsed_qty': None, 'parsed_unit': material['unit']})
            position.update(matched_material_id=material['material_id'],
                matched_material_name=material['canonical_name'], matched_material_unit=material['unit'],
                review_questions=['Какое количество требуется? Подтвердите единицу из карточки материала.',
                    'Какова продажная цена и её источник? Укажите отдельно полную закупку и её источник.'])
            positions.append(position)
        now = datetime.now().isoformat()
        data = {'source': 'catalog_invoice', 'client_name': '', 'doc_number': 'Из каталога',
            'positions': positions, 'files': [], 'pricing': dict(DEFAULT_PRICING),
            'created_at': now, 'updated_at': now, 'status': 'draft'}
        with store.connect() as db:
            cursor = db.execute('INSERT INTO requests(data) VALUES (?)', (dumps(data),))
            data['request_id'] = cursor.lastrowid
            store.save_request(data, db)
        logging.info('[FIX] catalog_invoice_draft request=%s material_ids=%s', data['request_id'], ids)
        return response(data)

    @app.post('/api/invoices')
    def create_invoice(body: dict):
        return response(submit(store, ms, reserve(store, body.get('preview_id'))))

    @app.get('/api/invoices')
    def invoices(status: str = '', query: str = '', client_name: str = ''):
        with store.connect() as db:
            ids = [r['id'] for r in db.execute('SELECT id FROM operations ORDER BY id DESC')]
        rows = [read_operation(store, i) for i in ids]
        return response([r for r in rows if (not status or r['status'] == status) and
                         query.lower() in (r['number'] + r['client_name']).lower() and client_name.lower() in r['client_name'].lower()])

    @app.get('/api/invoices/{identifier}')
    def invoice(identifier: int):
        return response(read_operation(store, identifier))

    @app.post('/api/invoices/{identifier}/retry')
    def retry(identifier: int):
        return response(submit(store, ms, identifier))

    @app.get('/api/integrations/moysklad/test')
    def connection():
        ms.dictionary('organization')
        return response({'connected': True, 'message': 'МойСклад доступен'})

    @app.get('/api/integrations/gemini/test')
    def gemini_connection():
        app.state.gemini.generate('Верни JSON {"ok": true}.',
            {'type': 'OBJECT', 'required': ['ok'], 'properties': {'ok': {'type': 'BOOLEAN'}}},
            settings()['data']['gemini_model_vision'])
        return response({'available': True, 'message': 'Gemini доступен: тестовый запрос выполнен'})

    @app.get('/api/integrations/ohmylama/test')
    def ohmylama_connection():
        result = app.state.ohmylama.generate('Верни JSON {"ok": true}.',
            {'type': 'OBJECT', 'required': ['ok'], 'properties': {'ok': {'type': 'BOOLEAN'}}},
            settings()['data']['ai_model'])
        if result.get('ok') is not True:
            raise GeminiError('OhMyLama вернул некорректный тестовый ответ')
        return response({'available': True, 'message': 'OhMyLama доступен: тестовый запрос выполнен'})

    return app


def with_sale_price(position, request):
    """Attach the calculated price so a saved row keeps its value without a reload."""
    try:
        view = sale_prices(request['positions'], request['pricing'])
    except ValueError:
        view = {'positions': []}
    prices = {row['position_id']: row['sale_price'] for row in view['positions']}
    return {**position, 'sale_price': prices.get(position['position_id'])}


def new_position(identifier, body):
    return {'position_id': identifier, 'raw_text': str(body.get('raw_text', '')),
            'parsed_qty': body.get('parsed_qty', 1), 'parsed_unit': body.get('parsed_unit', 'шт'),
            'quantity_confirmed': bool(body.get('quantity_confirmed', False)),
            'unit_confirmed': bool(body.get('unit_confirmed', False)),
            'matched_material_id': None, 'matched_material_name': None, 'matched_material_unit': None, 'confidence': 0,
            'status': 'needs_review', 'reasoning': None, 'review_questions': [], 'selected_supplier_id': None,
            'selected_price': None, 'alternatives': [], 'flags': [], 'variants': [], 'analogs': [], 'revision': 1}


def run():
    import uvicorn
    from logging.handlers import RotatingFileHandler
    log_dir = Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Snabdika' / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=os.environ.get('SNABDIKA_LOG_LEVEL', 'INFO'), handlers=[
        RotatingFileHandler(log_dir / 'invoices.log', maxBytes=2_000_000, backupCount=2, encoding='utf-8'),
        logging.StreamHandler(),
    ])
    logging.getLogger('httpx').setLevel(logging.WARNING)
    app = create_app()
    # Native parent owns stdin; closing it terminates the child even after a parent crash.
    if os.environ.get('SNABDIKA_PARENT_PIPE') == '1':
        import threading
        import sys
        def watch_parent():
            sys.stdin.buffer.read()
            os._exit(0)
        threading.Thread(target=watch_parent, daemon=True).start()
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('SNABDIKA_PORT', '8765')), access_log=False)


if __name__ == '__main__':
    run()
