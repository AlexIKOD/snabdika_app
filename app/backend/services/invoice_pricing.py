"""Decimal calculations. Prices in RUB, output prices rounded to kopeks."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CENT = Decimal('0.01')
HUNDRED = Decimal(100)
DEFAULT_PRICING = {'pricing_mode': 'discount', 'target_percent': 0, 'vat_enabled': False,
                   'vat_included': False, 'vat_rate': 0}


def number(value):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError('Некорректное число') from None
    if not result.is_finite() or abs(result) > Decimal('1e12'):
        raise ValueError('Недопустимое или неконечное число')
    return result


def money(value):
    return number(value).quantize(CENT, rounding=ROUND_HALF_UP)


def validate(settings):
    mode = settings.get('pricing_mode', 'discount')
    target = number(settings.get('target_percent', 0))
    if mode not in ('discount', 'margin') or not 0 <= target < 100:
        raise ValueError('Выберите режим и процент от 0 до менее 100')
    enabled, included = settings.get('vat_enabled', False), settings.get('vat_included', False)
    rate = number(settings.get('vat_rate', 0))
    if rate not in (0, 5, 7, 10, 20, 22) or (not enabled and rate != 0):
        raise ValueError('Не разрешена ставка НДС')
    if not enabled and included:
        raise ValueError('Без НДС не может включать налог в цену')
    return mode, target, enabled, included, rate


def line_ready(line):
    for key in ('retail_price', 'purchase_price', 'parsed_qty'):
        try:
            if number(line.get(key)) <= 0:
                return False
        except ValueError:
            return False
    return True


def sale_prices(lines, settings):
    """Sale price per position from the request header; the base retail price stays untouched."""
    validate(settings)
    ready = [line for line in lines if line_ready(line)]
    excluded = [line['position_id'] for line in lines if not line_ready(line)]
    if not ready:
        return {'positions': [], 'excluded': excluded, 'sum_total': Decimal(0), 'sum_without_vat': Decimal(0),
                'sum_vat': Decimal(0), 'profit': Decimal(0), 'rounding_residual': Decimal(0),
                'warnings': [], 'blocking_reasons': []}
    result = calculate(ready, settings)
    positions = [{'position_id': line['position_id'], 'sale_price': row['price_final'],
                  'sum_total': row['sum_total']} for line, row in zip(ready, result['positions'])]
    return {'positions': positions, 'excluded': excluded, 'sum_total': result['sum_total'],
            'sum_without_vat': result['sum_without_vat'], 'sum_vat': result['sum_vat'],
            'profit': result['profit'], 'rounding_residual': result['rounding_residual'],
            'warnings': result['warnings'], 'blocking_reasons': result['blocking_reasons']}


def calculate(lines, settings):
    mode, target, enabled, included, rate = validate(settings)
    factor = 1 + rate / 100 if enabled else Decimal(1)
    retail = sum(number(x['retail_price']) * number(x['parsed_qty']) for x in lines)
    cost = sum(money(number(x['purchase_price']) * number(x['parsed_qty'])) for x in lines)
    desired_base = retail * (1 - target / 100) if mode == 'discount' else cost / (1 - target / 100) * (factor if included else 1)
    prices = [money(number(line['retail_price']) * desired_base / retail) for line in lines]
    # Allocate the document remainder to a line only when its unit price can express it exactly.
    remaining = money(desired_base) - sum(money(price * number(line['parsed_qty'])) for price, line in zip(prices, lines))
    for index, line in enumerate(lines):
        if remaining == 0:
            break
        candidate = money(prices[index] + remaining / number(line['parsed_qty']))
        actual_delta = money(candidate * number(line['parsed_qty'])) - money(prices[index] * number(line['parsed_qty']))
        if candidate > 0 and actual_delta == remaining:
            prices[index] = candidate
            remaining = 0
    result = []
    for line, price in zip(lines, prices):
        qty = number(line['parsed_qty'])
        base = number(line['retail_price'])
        if price <= 0:
            raise ValueError('Округление даёт нулевую цену; измените параметры')
        total_base = money(price * qty)
        net = money(total_base / factor) if included else total_base
        vat = total_base - net if included else money(total_base * (factor - 1))
        gross = net + vat
        purchase = money(number(line['purchase_price']) * qty)
        profit = net - purchase
        result.append({**line, 'price_final': price, 'sum_total': gross, 'sum_without_vat': net,
                       'sum_vat': vat, 'sum_purchase': purchase, 'margin_sum': profit,
                       'margin_percent': profit / net * 100 if net else Decimal(0),
                       'price_retail': base, 'price_purchase': number(line['purchase_price']),
                       'qty': qty, 'name': line.get('matched_material_name'), 'unit': line.get('parsed_unit'),
                       'code': line.get('moysklad_id'), 'material_id': line.get('matched_material_id'),
                       'supplier': str(line.get('selected_supplier_id') or ''), 'discount_percent': 0,
                       'vat_rate': str(rate) + '%' if enabled else 'Без НДС'})
    net = sum(x['sum_without_vat'] for x in result)
    gross = sum(x['sum_total'] for x in result)
    actual_base = sum(money(x['price_final'] * x['qty']) for x in result)
    actual_discount = (1 - actual_base / retail) * 100
    margin = (net - cost) / net * 100 if net else Decimal(0)
    # Both sides are compared at kopek precision: the target itself is rounded to a price.
    residual = actual_base - money(desired_base)
    warnings = []
    if net < cost:
        warnings.append('Счёт убыточен: полная закупка превышает выручку без НДС')
    blockers = []
    if residual:
        blockers.append(f'Цель не достигнута при точности цены 0,01 ₽. Остаток: {residual} ₽; измените параметры и пересчитайте')
    return {'positions': result, 'sum_total': gross, 'sum_without_vat': net, 'sum_vat': gross - net,
            'sum_purchase': cost, 'profit': net - cost, 'actual_discount': actual_discount,
            'actual_margin': margin, 'markup': (net - cost) / cost * 100,
            'target_base': money(desired_base), 'rounding_residual': residual,
            'warnings': warnings, 'blocking_reasons': blockers}
