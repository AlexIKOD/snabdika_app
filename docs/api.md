[← Интерфейс](interface.md) · [К README](../README.md) · [Каталог и данные →](data.md)

# HTTP API

Локальный сервис FastAPI в `app/backend`. Слушает только loopback, требует
заголовок `x-snab-key` и отклоняет запросы с чужим `Host`. OpenAPI-схема
отключена.

## Авторизация

| Заголовок | Значение |
| --- | --- |
| `x-snab-key` | Одноразовый ключ процесса; в dev генерируется Vite-плагином, в release — Rust |

Ответы при ошибке авторизации: `401` — нет ключа, `403` — недопустимый host.

## Формат ответа

Успешный ответ: `{ "data": ... }`. Список материалов дополнительно содержит
`meta` с `total`, `catalog_total`, `page`, `page_size`.

| Код | Причина |
| --- | --- |
| `422` | Ошибка валидации (`ValueError`), текст пригоден для показа |
| `404` | Документ или материал не найден |
| `502` | Ошибка внешнего API или модели |
| `503` | Каталог недоступен |

## Эндпоинты

### Служебные

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/health` | Состояние каталога, SQLite, «МойСклад» и AI-провайдера |
| `GET` | `/api/dashboard` | Счётчики главной панели |
| `GET` | `/api/settings` | Публичные настройки без секретов |
| `PUT` | `/api/settings` | Сохранение настроек; адрес API «МойСклад» фиксирован |
| `GET` | `/api/secrets/{key}/status` | Наличие секрета и дата изменения |
| `POST` | `/api/secrets/{key}` | Запись секрета в Credential Manager |
| `GET` | `/api/logs` | Записи системного журнала |

Допустимые ключи секретов: `moysklad_token`, `gemini_api_key`, `ohmylama_api_key`.

### Каталог

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/materials` | Поиск и фильтры: `query`, `category`, `supplier_id`, `has_price`, `has_weight`, `has_price_conflict`, `has_suspected_merge`, `sort_by`, `sort_dir`, `page`, `page_size` |
| `GET` | `/api/materials/{id}` | Карточка материала с предложениями и алиасами |
| `GET` | `/api/dictionaries/categories` | Дерево категорий со счётчиками |
| `GET` | `/api/suppliers` | Поставщики и число предложений |
| `GET` | `/api/imports` | Отчёты импорта |

`page_size` ограничен 1000; значение по умолчанию — 200.

### Заявки

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/requests` | Список документов, новые сверху |
| `POST` | `/api/requests` | Создание из текста: `client_name`, `doc_number`, `raw_text` |
| `GET` | `/api/requests/{id}` | Документ с позициями |
| `DELETE` | `/api/requests/{id}` | Удаление; запрещено при связанном счёте |
| `POST` | `/api/requests/{id}/match` | Сопоставление неподтверждённых позиций, до 50 за запуск |
| `POST` | `/api/requests/{id}/positions` | Добавление позиции |
| `PATCH` | `/api/requests/{id}/positions/{pid}` | Правка полей и подтверждение |
| `POST` | `/api/requests/{id}/positions/{pid}/variant` | Выбор варианта подбора: `material_id`, для аналога — `confirm_analog: true` |
| `DELETE` | `/api/requests/{id}/positions/{pid}` | Удаление позиции |
| `GET` | `/api/requests/{id}/pricing` | Цены к счёту по настройкам шапки, без сохранения |
| `POST` | `/api/requests/{id}/pricing` | Сохранение настроек расчёта и пересчёт цен к счёту |

`PATCH` принимает значимые поля (`parsed_qty`, `parsed_unit`, `retail_price`,
`purchase_price`, `retail_source`, `purchase_source`, `selected_supplier_id`,
`alternatives`, `matched_material_id`, `status`). Подтверждение выполняется
отдельным запросом `{ "status": "confirmed" }` без изменения значимых полей:
сервис проверяет материал, количество, единицу каталога, обе цены и источники,
затем связывает товар с «МойСклад».

### Варианты подбора и расчёт в шапке

`match` возвращает в каждой позиции `variants[]` (классы `exact` и `probable`) и
`analogs[]`; у варианта есть `material_id`, `canonical_name`, `unit`, `class`,
`score`, `matched_fields`, `conflicting_fields` и `offers[]` (поставщик, цена,
артикул, файл). Аналог нельзя выбрать без `confirm_analog: true`; выбор пишется
в позицию вместе с `variant_selected_at`, `variant_selected_by`,
`variant_selected_rank`, `variant_selected_class`. Ручной выбор товара из каталога
через `PATCH` очищает список вариантов этой строки и ставит класс `manual`.

Настройки расчёта — один объект на заявку: `pricing_mode` (`discount` | `margin`),
`target_percent`, `vat_enabled`, `vat_included`, `vat_rate`. `POST /pricing`
проверяет их, сохраняет и возвращает цену к счёту по каждой позиции; базовая
`retail_price` не перезаписывается. Позиции без розницы, себестоимости или
количества попадают в `excluded` и остаются без цены к счёту. Предпросмотр счёта
читает этот же объект из заявки, а не тело запроса.

### Счета

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/api/invoices/catalog-drafts` | Черновик из каталога: `material_ids` без повторов |
| `POST` | `/api/requests/{id}/invoice/preview` | Неизменяемый предпросмотр с параметрами счёта |
| `POST` | `/api/invoices` | Создание документа в «МойСклад» по `preview_id` |
| `GET` | `/api/invoices` | Реестр: `status`, `query`, `client_name` |
| `GET` | `/api/invoices/{id}` | Карточка операции |
| `POST` | `/api/invoices/{id}/retry` | Повтор отправки без создания дубля |

Параметры предпросмотра: `position_ids`, `organization_id`, `agent_id`,
`store_id`, `doc_date`, `pricing_mode` (`discount` или `margin`),
`target_percent`, `vat_enabled`, `vat_included`, `vat_rate`, `merge`.

### Интеграции

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/moysklad/dictionaries/{kind}` | Справочник: организация, склад, контрагент |
| `POST` | `/api/moysklad/dictionaries/{kind}` | Создание контрагента |
| `GET` | `/api/moysklad/products/{id}` | Карточка товара «МойСклад» |
| `GET` | `/api/moysklad/metadata/{kind}` | Метаданные сущности |
| `GET` | `/api/integrations/moysklad/test` | Проверка соединения |
| `GET` | `/api/integrations/gemini/test` | Проверка Gemini |
| `GET` | `/api/integrations/ohmylama/test` | Проверка OhMyLama |

## Пример

```http
POST /api/requests
x-snab-key: <ключ>
Content-Type: application/json

{ "client_name": "ООО «Строй-Трест»", "doc_number": "ЗК-2026-1021/431",
  "raw_text": "Ротбанд 30 кг - 20 мешков\nПрофиль 28х27 - 5 шт" }
```

```json
{ "data": { "request_id": 12, "status": "draft",
  "positions": [{ "position_id": 1, "raw_text": "Ротбанд 30 кг - 20 мешков" }] } }
```

## См. также

- [Архитектура](architecture.md) — где живут обработчики и сервисы.
- [Интерфейс](interface.md) — какие экраны вызывают эти эндпоинты.
- [Тестирование](testing.md) — backend-тесты и живые проверки.
