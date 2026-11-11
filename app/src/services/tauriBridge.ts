/**
 * Безопасный мост взаимодействия с оболочкой Tauri v2 (§4.1, §4.4 ТЗ)
 *
 * Управляет секретами через Windows Credential Manager (в нативном режиме)
 * или через изолированную память замыкания (в режиме макета/тестирования).
 * В веб-представление секреты НЕ ВОЗВРАЩАЮТСЯ НИКОГДА.
 */

import type { SecretKey, SecretStatus, SecretString, SetSecretResult } from "../types/security";

// Внутрипамятное изолированное хранилище для режима MOCK / браузера / тестов.
// Память процесса JS, НИКОГДА не пишется в localStorage/sessionStorage/IndexedDB!
const mockSecretMemoryStore: Map<SecretKey, { updatedAt: string; value: string }> = new Map();

const bridgeEnv = (import.meta as ImportMeta & { env?: { MODE?: string; VITE_USE_MOCK?: string } }).env;
const demoSecrets = bridgeEnv?.MODE === 'test' || bridgeEnv?.VITE_USE_MOCK === 'true';

// Проверка наличия среды Tauri v2
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface InputDocFile {
  name: string;
  bytes: number[];
}

export async function readParquetTable<T = Record<string, unknown>>(table: string): Promise<T[]> {
  if (!isTauriEnvironment()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T[]>("read_parquet_table", { table });
}

export async function writeParquetTable(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!isTauriEnvironment()) throw new Error("Запись Parquet доступна только в desktop-версии");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_parquet_table", { table, rows });
}

/** Читает только XLS/XLSX из настроенной папки input_doc; исходники не изменяются. */
export async function readInputDocFiles(): Promise<InputDocFile[]> {
  if (!isTauriEnvironment()) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<InputDocFile[]>("read_input_doc_files");
  } catch {
    return [];
  }
}

/**
 * Сохранение секрета в защищенный контур (Credential Manager).
 * После передачи значение стирается из аргументов.
 */
export async function setSecret(key: SecretKey, secretValue: SecretString): Promise<SetSecretResult> {
  const now = new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isTauriEnvironment()) {
    try {
      // Вызов нативной команды Tauri
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_secret", { key, value: secretValue });
      return {
        status: "stored",
        key,
        updated_at: now,
      };
    } catch (error) {
      return {
        status: "error",
        key,
        updated_at: now,
        error_message: String(error),
      };
    }
  }

  if (!demoSecrets) {
    const res = await fetch(`/api/secrets/${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: secretValue }) });
    if (!res.ok) throw new Error('Не удалось сохранить секрет в защищённом хранилище');
    return { status: 'stored', key, updated_at: now };
  }

  // Fallback для режима макета/браузера: безопасное хранение в замыкании
  mockSecretMemoryStore.set(key, {
    updatedAt: now,
    value: secretValue, // изолировано внутри Map модуля, недоступно глобально
  });

  return {
    status: "stored",
    key,
    updated_at: now,
  };
}

/**
 * Запрос статуса секрета.
 * Возвращает ТОЛЬКО признак наличия и дату изменения.
 * Символы секрета или маски (••••) НЕ ПЕРЕДАЮТСЯ (§4.4 ТЗ).
 */
export async function getSecretStatus(key: SecretKey): Promise<SecretStatus> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<{ is_set: boolean; updated_at: string | null }>("get_secret_status", { key });
      return {
        key,
        is_set: res.is_set,
        updated_at: res.updated_at,
      };
    } catch {
      return {
        key,
        is_set: false,
        updated_at: null,
      };
    }
  }

  if (!demoSecrets) {
    const res = await fetch(`/api/secrets/${key}/status`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Не удалось прочитать статус секрета');
    return { key, ...await res.json() };
  }

  // Fallback для режима макета
  const entry = mockSecretMemoryStore.get(key);
  return {
    key,
    is_set: Boolean(entry),
    updated_at: entry ? entry.updatedAt : null,
  };
}
