import hashlib
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from ..store import dumps
from .invoice_pricing import calculate, number, DEFAULT_PRICING
from .moysklad import meta

log = logging.getLogger(__name__)
SIGNIFICANT = ('parsed_qty', 'parsed_unit', 'quantity_confirmed', 'unit_confirmed',
               'matched_material_id', 'selected_supplier_id',
               'purchase_price', 'retail_price', 'moysklad_id', 'assortment_type', 'pack_id',
               'unit_id', 'pack_quantity', 'retail_source', 'purchase_source', 'selected_price')


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def fingerprint(position):
    return digest({key: position.get(key) for key in SIGNIFICANT})


def normalize_unit(value):
    return ''.join(str(value or '').casefold().replace('ё', 'е').split()).rstrip('.')


def validate_confirmation(position, catalog):
    if not position.get('matched_material_id'):
        raise ValueError('Сначала выберите товар из нашей базы материалов')
    if position.get('quantity_confirmed') is not True:
        raise ValueError('Проверьте количество по исходной заявке и отметьте «Количество сверено»')
    if position.get('unit_confirmed') is not True:
        raise ValueError('Проверьте единицу по исходной заявке и отметьте «Единица сверена»')
    try:
        quantity = number(position.get('parsed_qty'))
    except ValueError:
        raise ValueError('Укажите корректное количество в счёте') from None
    if quantity <= 0:
        raise ValueError('Количество должно быть больше нуля')
    if not str(position.get('parsed_unit') or '').strip():
        raise ValueError('Укажите единицу измерения в счёте')
    material = catalog.material(int(position['matched_material_id']))
    local_unit = material.get('unit', '').strip()
    if not local_unit:
        raise ValueError('У выбранного материала не заполнена единица измерения в нашей базе')
    if normalize_unit(position.get('parsed_unit')) != normalize_unit(local_unit):
        raise ValueError(f'Единица заявки «{position.get("parsed_unit") or "не указана"}» не совпадает с единицей материала «{local_unit}»')
    for field, label in (('retail_price', 'розничную цену'), ('purchase_price', 'полную закупку')):
        try:
            value = number(position.get(field))
        except ValueError:
            raise ValueError(f'Укажите {label} за единицу') from None
        if value <= 0:
            raise ValueError(f'Укажите {label} за единицу: значение должно быть больше нуля')
    if not isinstance(position.get('retail_source'), str) or not position['retail_source'].strip():
        raise ValueError('Укажите источник розничной цены')
    if not isinstance(position.get('purchase_source'), str) or not position['purchase_source'].strip():
        raise ValueError('Укажите источник полной закупки')
    return material


def check_product(ms, position, store=None):
    if not position.get('matched_material_id'):
        raise ValueError('Выберите товар из нашей базы материалов')
    if store:
        link = store.catalog_moysklad_link(int(position['matched_material_id']))
        if not link or link['moysklad_id'] != position.get('moysklad_id'):
            raise ValueError('Карточка счёта не связана с выбранным товаром из нашей базы')
    kind = position.get('assortment_type', 'product')
    item = ms.entity(kind, position.get('moysklad_id'))
    unit = item.get('uom')
    if not unit and kind == 'variant':
        parent = ms.entity('product', item['product']['meta']['href'].split('/')[-1])
        unit = parent.get('uom')
    if not unit or not position.get('unit_id') or unit['meta']['href'].split('/')[-1] != position['unit_id']:
        raise ValueError('Не подтверждена единица товара МойСклад')
    if position.get('pack_id'):
        pack = next((p for p in item.get('packs', []) if p['id'] == position['pack_id']), None)
        if not pack or number(pack['quantity']) != number(position.get('pack_quantity')):
            raise ValueError('Не подтверждена упаковка товара')
    for key in ('parsed_qty', 'retail_price', 'purchase_price'):
        try:
            valid = number(position.get(key)) > 0
        except ValueError:
            valid = False
        if not valid:
            raise ValueError('Количество, розница и полная закупка должны быть больше нуля')
    if not position.get('retail_source') or not position.get('purchase_source'):
        raise ValueError('Укажите источники розницы и закупки')
    return item


def build_preview(store, ms, request_id, settings):
    request = store.request(request_id)
    pricing_settings = request.get('pricing', dict(DEFAULT_PRICING))
    settings = {**settings, **pricing_settings}
    ids = settings.get('position_ids')
    if not ids or len(set(ids)) != len(ids):
        raise ValueError('Выберите непустой набор позиций без повторов')
    by_id = {p['position_id']: p for p in request['positions']}
    if any(i not in by_id for i in ids):
        raise ValueError('Все позиции должны принадлежать одной заявке')
    sources = [by_id[i] for i in ids]
    for p in sources:
        if p.get('invoiced_operation_id') or p['status'] != 'confirmed' or p.get('confirmation_hash') != fingerprint(p):
            raise ValueError('Позиция не подтверждена, изменена или уже выставлена')
        check_product(ms, p, store)
    entities = {kind: ms.entity(kind, settings[key]) for kind, key in
                (('organization', 'organization_id'), ('counterparty', 'agent_id'), ('store', 'store_id'))}
    datetime.strptime(settings['doc_date'], '%Y-%m-%d')
    groups = {}
    for p in sources:
        key = tuple(str(p.get(k)) for k in ('moysklad_id', 'assortment_type', 'unit_id', 'pack_id',
                    'retail_price', 'purchase_price', 'selected_supplier_id', 'pack_quantity')) if settings.get('merge', False) else (p['position_id'],)
        if key in groups:
            groups[key]['parsed_qty'] = str(number(groups[key]['parsed_qty']) + number(p['parsed_qty']))
            groups[key]['source_position_ids'].append(p['position_id'])
        else:
            groups[key] = {**p, 'source_position_ids': [p['position_id']]}
    pricing = calculate(list(groups.values()), settings)
    payload_positions = []
    for row in pricing['positions']:
        item = {**meta(row.get('assortment_type', 'product'), row['moysklad_id']),}
        output = {'quantity': float(row['qty']), 'price': float(row['price_final'] * 100),
                  'discount': 0, 'vat': int(settings['vat_rate']), 'vatEnabled': settings['vat_enabled'],
                  'assortment': item}
        if row.get('pack_id'):
            output['pack'] = {'id': row['pack_id']}
        payload_positions.append(output)
    invoice = {**pricing, 'invoice_id': 0, 'request_id': request_id, 'number': '',
               'doc_date': settings['doc_date'], 'created_at': datetime.now().isoformat(),
               'client_name': entities['counterparty']['name'], 'organization': entities['organization']['name'],
               'comment': settings.get('comment', ''), 'formula_version': '1-decimal-line-half-up',
               'currency': 'RUB', 'discount_source': 'application', 'warehouse': entities['store']['name'], 'positions_count': len(pricing['positions']),
               'status': 'draft', 'moysklad_href': None, 'error_text': None, 'settings': settings,
               'vat_rate': str(settings['vat_rate']) + '%' if settings['vat_enabled'] else 'Без НДС'}
    payload = {'organization': meta('organization', settings['organization_id']),
               'agent': meta('counterparty', settings['agent_id']), 'store': meta('store', settings['store_id']),
               'applicable': False, 'vatEnabled': settings['vat_enabled'], 'vatIncluded': settings['vat_included'],
               'moment': settings['doc_date'] + datetime.now(timezone(timedelta(hours=3))).strftime(' %H:%M:%S'),
               'description': settings.get('comment', ''),
               'positions': payload_positions}
    result = {'preview_id': str(uuid4()), 'invoice_preview': invoice, 'payload': payload,
              'blocking_reasons': pricing['blocking_reasons'], 'warnings': pricing['warnings'],
              'request_id': request_id, 'settings': settings,
              'source_hashes': {str(p['position_id']): fingerprint(p) for p in sources},
              'source_revisions': {str(p['position_id']): p['revision'] for p in sources},
              'excluded_position_ids': [p['position_id'] for p in request['positions'] if p['position_id'] not in ids]}
    result['composition_hash'] = digest(payload)
    with store.connect() as db:
        db.execute('INSERT INTO previews VALUES (?, ?)', (result['preview_id'], dumps(result)))
    log.info('preview=%s source_count=%s output_count=%s', result['preview_id'], len(sources), len(groups))
    return result
