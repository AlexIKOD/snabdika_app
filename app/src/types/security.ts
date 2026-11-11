/**
 * Типы для защитного контура секретов (§4.4 ТЗ)
 *
 * Принцип: секрет не покидает доверенный контур (Windows Credential Manager / Tauri).
 * В веб-представлении секрет существует только кратковременно в виде branded type
 * во время отправки оператором, затем память очищается.
 * Отображение секретов или масок (типа ••••1234) строго запрещено.
 */

declare const SecretStringBrand: unique symbol;

/**
 * Брендированный тип для значения секрета.
 * Предотвращает случайное присваивание полям стейта или объектам,
 * сериализуемым в веб-хранилище.
 */
export type SecretString = string & { readonly [SecretStringBrand]: true };

export function createSecretString(value: string): SecretString {
  return value as SecretString;
}

export type SecretKey = "moysklad_token" | "gemini_api_key" | "ohmylama_api_key";

export interface SecretStatus {
  key: SecretKey;
  is_set: boolean;
  updated_at: string | null;
}

export interface SetSecretResult {
  status: "stored" | "error";
  key: SecretKey;
  updated_at: string;
  error_message?: string;
}
