import json
import sqlite3
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from .services.invoice_pricing import DEFAULT_PRICING


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      default=lambda x: str(x) if isinstance(x, Decimal) else x, allow_nan=False)


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS operations (
                    id INTEGER PRIMARY KEY, preview_id TEXT UNIQUE NOT NULL,
                    operation_id TEXT UNIQUE NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS claims (
                    request_id INTEGER, position_id INTEGER, operation_id TEXT NOT NULL,
                    PRIMARY KEY(request_id, position_id));
                CREATE TABLE IF NOT EXISTS catalog_moysklad_links (
                    material_id INTEGER PRIMARY KEY,
                    moysklad_id TEXT NOT NULL UNIQUE,
                    unit_id TEXT NOT NULL,
                    external_code TEXT NOT NULL UNIQUE,
                    canonical_name TEXT NOT NULL,
                    synced_at TEXT NOT NULL);
                PRAGMA user_version=2;
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def request(self, identifier, db=None):
        if db is None:
            with self.connect() as conn:
                return self.request(identifier, conn)
        row = db.execute('SELECT data FROM requests WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise ValueError('Заявка не найдена')
        request = json.loads(row['data'])
        request.setdefault('pricing', dict(DEFAULT_PRICING))
        for position in request.get('positions', []):
            position.setdefault('variants', [])
            position.setdefault('analogs', [])
            position.setdefault('quantity_confirmed', False)
            position.setdefault('unit_confirmed', False)
            position.setdefault('matched_material_unit', None)
            questions = position.setdefault('review_questions', [])
            reasoning = position.get('reasoning') or ''
            if not any('количество не указано' in question.casefold() for question in questions) and 'количество не указано' in reasoning.casefold():
                questions.append('Количество не указано в тексте: проверьте его перед подтверждением.')
            if not any('единица заказа не указана' in question.casefold() for question in questions) and 'единица заказа не указана' in reasoning.casefold():
                questions.append('Единица заказа не указана в тексте: проверьте её перед подтверждением.')
        return request

    def save_request(self, request, db):
        db.execute('UPDATE requests SET data=? WHERE id=?', (dumps(request), request['request_id']))

    def catalog_moysklad_link(self, material_id, db=None):
        if db is None:
            with self.connect() as conn:
                return self.catalog_moysklad_link(material_id, conn)
        row = db.execute('SELECT * FROM catalog_moysklad_links WHERE material_id=?', (material_id,)).fetchone()
        return dict(row) if row else None

    def save_catalog_moysklad_link(self, link, db=None):
        if db is None:
            with self.connect() as conn:
                return self.save_catalog_moysklad_link(link, conn)
        db.execute('''INSERT INTO catalog_moysklad_links
            (material_id, moysklad_id, unit_id, external_code, canonical_name, synced_at)
            VALUES (:material_id, :moysklad_id, :unit_id, :external_code, :canonical_name, :synced_at)
            ON CONFLICT(material_id) DO UPDATE SET moysklad_id=excluded.moysklad_id,
            unit_id=excluded.unit_id, external_code=excluded.external_code,
            canonical_name=excluded.canonical_name, synced_at=excluded.synced_at''', link)
