[К README](../README.md) · [Архитектура →](architecture.md)

# Начало работы

Актуализировано 22 октября 2026 года. Доступны браузерный режим с локальным
Python-сервисом, демонстрационный режим без внешних API и оболочка Tauri.

## Инструменты

| Назначение | Требования |
| --- | --- |
| Интерфейс | Node.js и npm; Vite 5 декларирует Node `^18.0.0 \|\| >=20.0.0` |
| Локальный сервис | Python 3.11+ с зависимостями из `backend/requirements-dev.txt` |
| Windows-оболочка | Rust с MSVC toolchain, C++ Build Tools, Windows SDK, WebView2 |
| Тесты | Node.js для frontend; Python для backend-тестов |

Команды выполняются из каталога `app`, если не указано другое.
Версии зависимостей интерфейса фиксирует [package-lock.json](../app/package-lock.json).

## Рабочий режим

```powershell
Set-Location app
npm ci
npm run dev
```

Vite слушает `127.0.0.1:5173` и через плагин `devBackend` сам запускает
`python -m backend.main`, дожидаясь ответа `/api/health`. Запросы `/api`
проксируются с одноразовым ключом `x-snab-key`. Адрес:
[http://127.0.0.1:5173](http://127.0.0.1:5173).

Если Python установлен не как `python`, укажите путь в `SNABDIKA_PYTHON`.

## Демонстрационный режим

```powershell
$env:VITE_USE_MOCK = 'true'
npm run dev
```

Frontend переключается на `mockServer`: данные и ответы интеграций
демонстрационные, внешние API не вызываются. Этот режим удобен для осмотра
интерфейса и не подтверждает работу «МойСклад» или модели.

## Оболочка Tauri

```powershell
Remove-Item Env:\VITE_USE_MOCK -ErrorAction SilentlyContinue
npm run tauri:dev
```

Tauri запускает и останавливает дочерний сервис, а native-команда `local_api`
обращается к loopback с ключом, который остаётся в Rust. Для сборки нужен
MSVC Developer Command Prompt (`vcvars64.bat`).

## Сборка и проверки

```powershell
npm test          # vitest, последний прогон: 70 проверок в 16 файлах
npm run lint      # eslint
npm run build     # tsc --noEmit + vite build
npm run tauri:build
```

Backend-тесты:

```powershell
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
```

Подробности и ограничения — в [тестировании](testing.md).

## Конфигурация и секреты

| Настройка | Использование |
| --- | --- |
| `VITE_USE_MOCK=true` | Демонстрационный режим frontend; не секрет |
| `MODE=test` | В тестах включает mock-ветку API-клиента |
| `SNABDIKA_PYTHON` | Путь к интерпретатору Python для dev-сервера |
| `SNABDIKA_LOCAL_KEY` | Ключ локальной авторизации; в dev генерируется автоматически |
| `SNABDIKA_LOG_LEVEL=DEBUG` | Подробный журнал сервиса |

Токен «МойСклад», ключи Gemini и OhMyLama хранятся в Windows Credential
Manager (service `Snabdika`). В настройках приложения отображается только
факт наличия и дата изменения; маски и значения не показываются. В dev
существующий `.env` читается backend только при отсутствии секрета в хранилище.

Адрес API «МойСклад» фиксирован: `https://api.moysklad.ru/api/remap/1.2`.

## Первая проверка

1. Откройте `/#/` — на главной панели видны счётчики каталога, заявок и счетов.
2. Откройте `/#/materials` — таблица каталога заполнена, поиск и фильтры работают.
3. Откройте `/#/requests` → «Новый документ» → вставьте текст и создайте заявку.
4. В позициях укажите цены и подтвердите строку — счётчик готовности изменится.

## См. также

- [Архитектура](architecture.md) — слои и границы модулей.
- [Интерфейс](interface.md) — разделы и сценарии работы.
- [Тестирование](testing.md) — команды и актуальные результаты.
