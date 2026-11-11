import pytest

from backend.services.invoice_submission import reconcile


@pytest.mark.parametrize('vat_enabled', [False, True])
def test_missing_vat_included_is_accepted_only_when_vat_disabled(vat_enabled):
    expected = {'organization': {'meta': {'href': 'org'}}, 'agent': {'meta': {'href': 'agent'}},
                'store': {'meta': {'href': 'store'}}, 'applicable': False,
                'vatEnabled': vat_enabled, 'vatIncluded': False, 'syncId': 'test', 'positions': []}
    document = {k: v for k, v in expected.items() if k != 'vatIncluded'}
    document.update(id='test', name='TEST', sum=0, vatSum=0)

    class Readback:
        def get(self, path, params=None):
            return {'rows': [], 'meta': {'size': 0}} if path.endswith('/positions') else document

    data = {'payload': expected, 'sum_total': 0, 'sum_vat': 0}
    if vat_enabled:
        with pytest.raises(ValueError, match='vatIncluded'):
            reconcile(Readback(), data, document)
    else:
        assert reconcile(Readback(), data, document)['number'] == 'TEST'
