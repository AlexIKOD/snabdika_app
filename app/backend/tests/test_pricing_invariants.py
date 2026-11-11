"""Money invariants for the server-side pricing formulas, checked on generated data."""
from decimal import Decimal
import pytest
from hypothesis import given, settings as hypothesis_settings, strategies as st
from backend.services.invoice_pricing import calculate, money, number, sale_prices

MONEY = st.decimals(min_value=Decimal('10'), max_value=Decimal('100000'), places=2)
QTY = st.decimals(min_value=Decimal('1'), max_value=Decimal('500'), places=2)
TARGET = st.decimals(min_value=Decimal('0'), max_value=Decimal('90'), places=2)


def lines(count, retail, qty, purchase):
    return [{'position_id': index + 1, 'parsed_qty': qty[index], 'retail_price': retail[index],
             'purchase_price': purchase[index], 'matched_material_name': 'fixture', 'parsed_unit': 'шт'}
            for index in range(count)]


@hypothesis_settings(max_examples=120, deadline=None)
@given(retail=st.lists(MONEY, min_size=1, max_size=6), qty=st.lists(QTY, min_size=1, max_size=6),
       purchase=st.lists(MONEY, min_size=1, max_size=6), target=TARGET,
       mode=st.sampled_from(['discount', 'margin']), vat=st.sampled_from([(False, False, 0), (True, False, 20),
                                                                          (True, True, 20), (True, True, 10)]))
def test_totals_always_match_the_lines(retail, qty, purchase, target, mode, vat):
    count = min(len(retail), len(qty), len(purchase))
    rows = lines(count, retail, qty, purchase)
    enabled, included, rate = vat
    result = calculate(rows, {'pricing_mode': mode, 'target_percent': target, 'vat_enabled': enabled,
                              'vat_included': included, 'vat_rate': rate})
    assert sum(row['sum_total'] for row in result['positions']) == result['sum_total']
    assert result['sum_without_vat'] + result['sum_vat'] == result['sum_total']
    assert result['profit'] == result['sum_without_vat'] - result['sum_purchase']
    assert all(row['price_final'] > 0 for row in result['positions'])
    assert all(row['sum_without_vat'] + row['sum_vat'] == row['sum_total'] for row in result['positions'])


@hypothesis_settings(max_examples=120, deadline=None)
@given(retail=st.lists(MONEY, min_size=1, max_size=6), qty=st.lists(QTY, min_size=1, max_size=6),
       purchase=st.lists(MONEY, min_size=1, max_size=6), target=TARGET,
       mode=st.sampled_from(['discount', 'margin']))
def test_target_is_reached_or_the_residual_is_reported(retail, qty, purchase, target, mode):
    count = min(len(retail), len(qty), len(purchase))
    rows = lines(count, retail, qty, purchase)
    result = calculate(rows, {'pricing_mode': mode, 'target_percent': target, 'vat_enabled': False,
                              'vat_included': False, 'vat_rate': 0})
    actual = sum(money(row['price_final'] * row['qty']) for row in result['positions'])
    assert actual - result['target_base'] == result['rounding_residual']
    # A price is expressed in kopeks, so a difference below one kopek cannot be reported or allocated.
    assert abs(actual - result['target_base']) < Decimal('0.01') + abs(result['rounding_residual'])
    if result['rounding_residual'] != 0:
        assert result['blocking_reasons']
    assert result['actual_discount'] == (1 - actual / sum(number(row['retail_price']) * number(row['parsed_qty'])
                                                          for row in rows)) * 100
    if result['sum_without_vat']:
        assert result['actual_margin'] == (result['sum_without_vat'] - result['sum_purchase']) / result['sum_without_vat'] * 100


@hypothesis_settings(max_examples=80, deadline=None)
@given(retail=st.lists(MONEY, min_size=1, max_size=4), qty=st.lists(QTY, min_size=1, max_size=4),
       purchase=st.lists(MONEY, min_size=1, max_size=4), target=TARGET)
def test_header_recalculation_is_idempotent_and_keeps_the_base(retail, qty, purchase, target):
    count = min(len(retail), len(qty), len(purchase))
    rows = lines(count, retail, qty, purchase)
    payload = {'pricing_mode': 'discount', 'target_percent': target, 'vat_enabled': False,
               'vat_included': False, 'vat_rate': 0}
    first = sale_prices(rows, payload)
    second = sale_prices(rows, payload)
    assert first['positions'] == second['positions']
    assert [row['retail_price'] for row in rows] == retail[:count]
    restored = sale_prices(rows, {**payload, 'target_percent': 0})
    # At 0 % the line price equals the base retail, except where one kopek of the document
    # remainder is moved into a line so that the invoice total stays exact.
    for row, value in zip(restored['positions'], retail[:count]):
        assert abs(row['sale_price'] - money(value)) <= Decimal('0.01')
    assert restored['sum_total'] == money(sum(retail[index] * qty[index] for index in range(count)))


def test_incomplete_line_is_excluded_and_does_not_break_others():
    rows = lines(2, [Decimal('1000'), Decimal('500')], [Decimal('1'), Decimal('1')],
                 [Decimal('700'), Decimal('0')])
    data = sale_prices(rows, {'pricing_mode': 'margin', 'target_percent': Decimal('20')})
    assert [row['position_id'] for row in data['positions']] == [1]
    assert data['excluded'] == [2]
    assert data['sum_total'] == Decimal('875.00')


@pytest.mark.parametrize('value', ['NaN', 'Infinity', '-Infinity', '1e13'])
def test_non_finite_money_is_rejected(value):
    with pytest.raises(ValueError):
        number(value)


def test_rounded_target_is_not_reported_as_a_missing_kopek():
    """Найдено property-тестом: цель 0 % при рознице 199,25 и количестве 1,02 не должна блокировать счёт."""
    rows = lines(1, [Decimal('199.25')], [Decimal('1.02')], [Decimal('10.00')])
    result = calculate(rows, {'pricing_mode': 'discount', 'target_percent': Decimal('0'),
                              'vat_enabled': False, 'vat_included': False, 'vat_rate': 0})
    assert result['rounding_residual'] == 0
    assert result['blocking_reasons'] == []
    assert result['sum_total'] == Decimal('203.24')
