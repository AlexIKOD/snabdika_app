/**
 * Единая точка доступа к локальному веб-хранилищу интерфейса (§4.3, §4.4 ТЗ)
 *
 * ВНИМАНИЕ:
 * Веб-хранилище (localStorage) объявлено НЕДОВЕРЕННЫМ.
 * Здесь сохраняются ИСКЛЮЧИТЕЛЬНО неконфиденциальные пользовательские настройки оформления:
 * - состояние боковой панели (свернута / развернута)
 * - плотность отображения таблиц (compact / standard)
 * - видимость и порядок колонок
 * - идентификаторы последних выбранных продавца и склада МойСклад (UUID справочников, не данные клиента)
 *
 * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО сохранять:
 * - секреты, API-ключи, токены;
 * - данные клиентов, запросов, смет, файлов;
 * - номенклатуру, цены, остатки.
 */

export interface UiPreferences {
  sidebarCollapsed: boolean;
  tableDensity: "compact" | "standard";
  catalogColumns: Record<string, boolean>;
  requestsColumns: Record<string, boolean>;
  invoiceOrganizationId: string;
  invoiceStoreId: string;
}

const STORAGE_KEY = "snabdika_ui_preferences_v1";

export const DEFAULT_PREFERENCES: UiPreferences = {
  sidebarCollapsed: false,
  tableDensity: "standard",
  catalogColumns: {
    code: true,
    name: true,
    unit: true,
    weight: true,
    category: true,
    petrovich_retail: true,
    petrovich_purchase: true,
    stk_retail: true,
    stk_purchase: true,
  },
  requestsColumns: {
    id: true,
    client: true,
    status: true,
    positions_count: true,
    created_at: true,
  },
  invoiceOrganizationId: "",
  invoiceStoreId: "",
};

export function getUiPreferences(): UiPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch (error) {
    console.warn("Не удалось прочитать настройки интерфейса из веб-хранилища:", error);
    return DEFAULT_PREFERENCES;
  }
}

export function saveUiPreferences(patch: Partial<UiPreferences>): UiPreferences {
  try {
    const current = getUiPreferences();
    const updated: UiPreferences = {
      ...current,
      ...patch,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.warn("Не удалось сохранить настройки интерфейса в веб-хранилище:", error);
    return getUiPreferences();
  }
}

export function clearUiPreferences(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Не удалось очистить настройки интерфейса:", error);
  }
}
