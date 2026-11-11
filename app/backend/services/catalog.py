"""Read the existing catalog in linear time; never replace it with demo data."""
import logging
import gc
import math
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from threading import RLock
import pyarrow.parquet as pq
import pyarrow as pa

log = logging.getLogger(__name__)
TABLES = ('catalog_materials', 'supplier_offers', 'material_aliases', 'import_logs')
COLUMNS = {
    'catalog_materials': ('material_id', 'canonical_name', 'print_name', 'working_name', 'unit', 'weight_kg',
                          'category', 'subcategory', 'brand', 'status', 'needs_review', 'suspected_false_merge'),
    'material_aliases': ('alias_id', 'material_id', 'raw_name', 'supplier', 'confidence', 'imported_at'),
}


class CatalogUnavailable(ValueError):
    pass


def numeric(value):
    if value is None or value == '':
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def text(value):
    return '' if value is None else str(value)


def flag(value):
    return value in (True, 'true', '1', 1)


def records(name, path):
    """Convert one bounded batch at a time instead of duplicating the full catalog."""
    try:
        source = pq.ParquetFile(path)
        try:
            columns = [c for c in COLUMNS[name] if c in source.schema_arrow.names] if name in COLUMNS else None
            for batch in source.iter_batches(batch_size=2048, columns=columns):
                yield from batch.to_pylist()
        finally:
            source.close()
    except (OSError, ValueError, MemoryError) as error:
        log.error('[FIX] catalog_read_failed table=%s error=%s', name, type(error).__name__)
        raise CatalogUnavailable('Не удалось прочитать таблицу каталога: ' + name) from None


class Catalog:
    def __init__(self):
        default = Path(sys.executable).parent.parent / 'database/unified_catalog' if getattr(sys, 'frozen', False) else Path(__file__).resolve().parents[3] / 'database/unified_catalog'
        self.root = Path(os.environ.get('SNABDIKA_CATALOG_DIR', default))
        self.lock = RLock()
        self.signature = None
        self.rows, self.by_id, self.suppliers, self.aliases, self.logs = [], {}, [], {}, []

    def load(self):
        with self.lock:
            try:
                paths = [self.root / (name + '.parquet') for name in TABLES]
                signature = tuple((p.stat().st_mtime_ns, p.stat().st_size) for p in paths)
                if signature == self.signature:
                    return
                raw = [records(name, path) for name, path in zip(TABLES, paths)]
            except (OSError, ValueError, MemoryError) as error:
                log.error('[FIX] catalog_unavailable error=%s', type(error).__name__)
                raise CatalogUnavailable('Не удалось прочитать каталог Parquet: ' + str(self.root)) from None
            materials, offers, aliases, logs = raw
            names, supplier_ids = [], {}
            grouped_offers, grouped_aliases = defaultdict(list), defaultdict(list)
            counts, dates = defaultdict(int), defaultdict(str)
            for o in offers:
                supplier = text(o.get('supplier'))
                if supplier and supplier not in supplier_ids:
                    names.append(supplier)
                    supplier_ids[supplier] = len(names)
                counts[supplier] += 1
                dates[supplier] = max(dates[supplier], text(o.get('imported_at')))
                grouped_offers[int(o['material_id'])].append({
                    'offer_id': int(o['offer_id']), 'supplier_id': supplier_ids.get(supplier, 0),
                    'supplier_name': supplier, 'price_type': 'purchase' if o.get('price_type') == 'purchase' else 'retail',
                    'price': numeric(o.get('current_price')), 'supplier_code': text(o.get('supplier_code')),
                    'updated_at': text(o.get('imported_at')), 'in_stock': True,
                    **{key: text(o.get(source)) or None for key, source in (
                        ('raw_name', 'raw_name'), ('working_name', 'working_name'), ('print_name', 'print_name'),
                        ('external_id', 'external_code'), ('uuid', 'uuid'), ('article', 'article'), ('ean', 'ean'),
                        ('unit', 'unit'), ('source_file', 'source_file'), ('imported_at', 'imported_at'))}})
            for a in aliases:
                grouped_aliases[int(a['material_id'])].append({
                    'alias_id': int(a['alias_id']), 'material_id': int(a['material_id']), 'raw_name': text(a.get('raw_name')),
                    'source': text(a.get('supplier')), 'confidence': numeric(a.get('confidence')) or 0,
                    'created_at': text(a.get('imported_at'))})
            rows = []
            for raw_row in materials:
                identifier = int(raw_row['material_id'])
                item_offers = grouped_offers[identifier]
                purchase = [o for o in item_offers if o['price_type'] == 'purchase' and (o['price'] or 0) > 0]
                retail = [o['price'] for o in item_offers if o['price_type'] == 'retail' and (o['price'] or 0) > 0]
                best = min(purchase, key=lambda o: o['price'], default=None)
                review = flag(raw_row.get('needs_review')) or raw_row.get('status') == 'needs_review'
                flags = ['needs_review'] if review else []
                if best and retail and min(retail) < best['price']:
                    flags.append('price_conflict')
                if flag(raw_row.get('suspected_false_merge')):
                    flags.append('suspected_false_merge')
                rows.append({'material_id': identifier,
                    'canonical_name': text(raw_row.get('canonical_name') or raw_row.get('print_name') or raw_row.get('working_name')),
                    **{key: text(raw_row.get(key)) for key in ('working_name', 'print_name', 'unit', 'category', 'subcategory')},
                    'brand': raw_row.get('brand'), 'weight_kg': numeric(raw_row.get('weight_kg')),
                    'status': 'needs_review' if review else raw_row.get('status') or 'active',
                    'aliases_count': len(grouped_aliases[identifier]), 'offers': item_offers, 'flags': flags,
                    'best_purchase': {'supplier_name': best['supplier_name'], 'price': best['price']} if best else None})
            self.rows, self.by_id = rows, {r['material_id']: r for r in rows}
            self.aliases, self.logs = grouped_aliases, list(logs)
            self.suppliers = [{'supplier_id': supplier_ids[name], 'name': name, 'code': name, 'is_active': True,
                               'offers_count': counts[name], 'last_import_at': dates[name] or None} for name in names]
            self.signature = signature
            log.info('[FIX] catalog_loaded materials=%s offers=%s suppliers=%s', len(rows), sum(counts.values()), len(names))
            del raw, materials, offers, aliases
            gc.collect()
            pa.default_memory_pool().release_unused()

    def materials(self, query='', category='', supplier_id=None, has_price='all', has_weight='all',
                  has_price_conflict=False, has_suspected_merge=False, sort_by='name', sort_dir='asc'):
        self.load()
        rows = self.rows
        if query.strip():
            query = query.strip().casefold()
            rows = [r for r in rows if any(query in text(v).casefold() for v in
                    (r['canonical_name'], r['category'], r['subcategory'], r['brand'],
                     *(o['supplier_code'] for o in r['offers']), *(o.get('article') or '' for o in r['offers'])))]
        if category:
            rows = [r for r in rows if r['category'] == category or category in r['subcategory']]
        if supplier_id is not None:
            rows = [r for r in rows if any(o['supplier_id'] == supplier_id for o in r['offers'])]
        if has_price != 'all':
            rows = [r for r in rows if any((o['price'] or 0) > 0 for o in r['offers']) == (has_price == 'with_price')]
        if has_weight != 'all':
            rows = [r for r in rows if ((r['weight_kg'] or 0) > 0) == (has_weight == 'with_weight')]
        if has_price_conflict:
            rows = [r for r in rows if 'price_conflict' in r['flags']]
        if has_suspected_merge:
            rows = [r for r in rows if 'suspected_false_merge' in r['flags']]
        keys = {'id': lambda r: r['material_id'], 'name': lambda r: r['canonical_name'].casefold(),
                'weight': lambda r: r['weight_kg'] or 0, 'price': lambda r: (r['best_purchase'] or {}).get('price', 0)}
        return sorted(rows, key=keys[sort_by], reverse=sort_dir == 'desc')

    def material(self, identifier):
        self.load()
        if identifier not in self.by_id:
            raise LookupError('Материал не найден')
        return {**self.by_id[identifier], 'aliases': self.aliases[identifier]}

    def categories(self):
        self.load()
        groups = {}
        for row in self.rows:
            category, sub = row['category'] or 'Прочие материалы', row['subcategory'] or 'Требует классификации'
            group = groups.setdefault(category, {'name': category, 'count': 0, 'subcategories': {}})
            group['count'] += 1
            group['subcategories'][sub] = group['subcategories'].get(sub, 0) + 1
        return [{'name': 'Все категории', 'count': len(self.rows), 'subcategories': []}] + [
            {**g, 'subcategories': [{'name': name, 'count': count} for name, count in g['subcategories'].items()]} for g in groups.values()]

    def summary(self):
        self.load()
        return {'materials_count': len(self.rows), 'offers_count': sum(s['offers_count'] for s in self.suppliers),
                'updated_at': max((s['last_import_at'] or '' for s in self.suppliers), default=''),
                'completeness': {
                    'materials': round(100 * sum(bool(r['canonical_name'] and r['unit']) for r in self.rows) / len(self.rows), 1) if self.rows else 0,
                    'offers': round(100 * sum(any((o['price'] or 0) > 0 for o in r['offers']) for r in self.rows) / len(self.rows), 1) if self.rows else 0,
                    'aliases': round(100 * sum(r['aliases_count'] > 0 for r in self.rows) / len(self.rows), 1) if self.rows else 0}}

    def file_status(self):
        return [{'name': name + '.parquet', 'records': pq.ParquetFile(self.root / (name + '.parquet')).metadata.num_rows,
                 'schema_version': '1', 'updated_at': datetime.fromtimestamp((self.root / (name + '.parquet')).stat().st_mtime).isoformat()}
                for name in TABLES]
