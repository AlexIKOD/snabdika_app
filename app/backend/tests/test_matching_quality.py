"""Regression checks for catalog evidence, independent of live model variability."""
from types import SimpleNamespace
import pytest
from backend.services.matching import candidates, source_signature, match_positions, variant_key


def catalog():
    rows = [
        dict(material_id=1, canonical_name='Товар 125', working_name='', print_name='',
             brand='Бренд', status='active', offers=[dict(article='ABC-12', raw_name='Товар 125')]),
        dict(material_id=2, canonical_name='Товар 12', working_name='', print_name='',
             brand='Бренд', status='active', offers=[dict(article='ABC-125', raw_name='Товар 12')]),
    ]
    return SimpleNamespace(rows=rows, aliases={1: [], 2: []}, load=lambda: None)


def test_exact_article_is_searchable_without_substring_matches():
    assert [r['material_id'] for r in candidates(catalog(), ['ABC-12'])] == [1]


def test_numeric_query_does_not_match_longer_number():
    assert [r['material_id'] for r in candidates(catalog(), ['Товар 12'])] == [2]


def test_separate_brand_is_searchable():
    assert len(candidates(catalog(), ['Бренд'])) == 2


def test_equally_specific_candidates_prefer_both_prices_over_unpriced_duplicate():
    c = catalog()
    c.rows[1]['canonical_name'] = c.rows[0]['canonical_name']
    c.rows[1]['offers'] = [{'price_type': 'purchase', 'price': 625.13},
                          {'price_type': 'retail', 'price': 585}]
    c.rows[0]['offers'] = []
    assert candidates(c, ['Товар 125'])[0]['material_id'] == 2


def test_specific_query_keeps_broad_fallback_from_adding_other_sizes():
    assert [r['material_id'] for r in candidates(catalog(), ['Товар 12', 'Товар'])] == [2]


def test_original_article_survives_model_query_shortening():
    assert [r['material_id'] for r in candidates(catalog(), ['Товар'], 'Бренд ABC-125')] == [2]


def test_exact_article_is_not_displaced_by_thirty_broad_matches():
    c = catalog()
    for mid in range(3, 40):
        c.rows.append(dict(c.rows[0], material_id=mid, offers=[]))
        c.aliases[mid] = []
    assert [r['material_id'] for r in candidates(c, ['Товар'], 'ABC-125')] == [2]


def test_source_dedup_preserves_modifications_and_dimensions():
    assert source_signature('Шпатлевка гипсовая Бренд 25 кг') == source_signature('Бренд шпаклевка гипсовая 25кг')
    assert source_signature('Плита Бренд 100х200х10 мм') != source_signature('Плита Бренд 200х100х10 мм')
    assert source_signature('Товар 1 м 2 шт') != source_signature('Товар 1 шт 2 м')
    assert source_signature('Паста Профи 18 кг') != source_signature('Паста Профи 5 кг')


@pytest.mark.parametrize('questions', [[], ['Совпадений нет.']])
def test_empty_result_always_requests_product_clarification(questions):
    class EmptyAI:
        def generate(self, prompt, schema, model):
            if 'queries' in schema['properties']['positions']['items']['properties']:
                return {'positions': [{'position_id': 1, 'queries': ['UNKNOWN'], 'quantity': None, 'unit': None}]}
            return {'positions': [{'position_id': 1, 'suggestions': [], 'questions': questions[:]}]}
    row = match_positions([{'position_id': 1, 'raw_text': 'UNKNOWN'}], catalog(), EmptyAI(), 'fixture')[1]
    assert row['matched_material_id'] is None
    assert any('Уточните артикул, бренд' in q for q in row['review_questions'])


def variant_catalog():
    def offer(identifier, supplier, kind, price, name):
        return dict(article=f'A{identifier}', raw_name=name, supplier_id=identifier,
                    supplier_name=supplier, price_type=kind, price=price, supplier_code='',
                    source_file=f'{supplier}.xlsx')
    rows = [
        dict(material_id=1, canonical_name='Ротбанд 30 кг', working_name='', print_name='', brand='Кнауф',
             status='active', unit='шт', flags=[], offers=[
                 offer(1, 'Поставщик А', 'purchase', 700, 'Ротбанд 30 кг'),
                 offer(2, 'Поставщик Б', 'retail', 900, 'Ротбанд 30 кг')]),
        dict(material_id=2, canonical_name='Ротбанд 10 кг', working_name='', print_name='', brand='Кнауф',
             status='active', unit='шт', flags=[], offers=[offer(1, 'Поставщик А', 'purchase', 400, 'Ротбанд 10 кг')]),
    ]
    return SimpleNamespace(rows=rows, aliases={1: [], 2: []}, load=lambda: None)


class RankedAI:
    def __init__(self, suggestions):
        self.suggestions = suggestions
        self.calls = 0

    def generate(self, prompt, schema, model):
        self.calls += 1
        if 'queries' in schema['properties']['positions']['items']['properties']:
            return {'positions': [{'position_id': 1, 'queries': ['Ротбанд'], 'quantity': 1, 'unit': 'шт'}]}
        return {'positions': [{'position_id': 1, 'suggestions': self.suggestions, 'questions': []}]}


def match(suggestions):
    return match_positions([{'position_id': 1, 'raw_text': 'Ротбанд 30 кг'}],
                           variant_catalog(), RankedAI(suggestions), 'fixture')[1]


def test_variants_keep_every_modification_and_mark_the_class():
    row = match([{'material_id': 2, 'score': 60, 'class': 'probable'},
                 {'material_id': 1, 'score': 95, 'class': 'exact'}])
    assert [v['material_id'] for v in row['variants']] == [1, 2]
    assert [v['class'] for v in row['variants']] == ['exact', 'probable']
    assert row['matched_material_id'] == 1
    assert row['analogs'] == []
    assert row['variants'][0]['offers'][0]['supplier_name'] == 'Поставщик А'
    assert row['variants'][0]['offers'][0]['article'] == 'A1'


def test_variant_shows_numbers_that_differ_from_the_request_line():
    row = match([{'material_id': 2, 'score': 60, 'class': 'probable'}])
    variant = row['variants'][0]
    assert '30' in variant['conflicting_fields']
    assert 'ротбанд' in variant['matched_fields']


def test_analog_is_a_separate_group_and_is_not_selected():
    row = match([{'material_id': 2, 'score': 70, 'class': 'analog'}])
    assert row['variants'] == []
    assert [v['material_id'] for v in row['analogs']] == [2]
    assert row['matched_material_id'] is None
    assert row['status'] == 'needs_review'
    assert any('аналог' in question.casefold() for question in row['review_questions'])


def test_same_modification_from_two_cards_is_one_variant():
    first = variant_catalog().rows[0]
    duplicate = dict(first, material_id=99)
    assert variant_key(first) == variant_key(duplicate)
    assert variant_key(first) != variant_key(variant_catalog().rows[1])


def test_match_prefills_both_prices_from_the_chosen_supplier():
    row = match([{'material_id': 1, 'score': 95, 'class': 'exact'}])
    assert row['purchase_price'] == 700
    assert row['purchase_source'] == 'Прайс: Поставщик А'
    # Retail comes only from the same supplier; Поставщик Б sells retail, А does not.
    assert 'retail_price' not in row
    assert row['alternatives'][0]['price_type'] == 'purchase'
