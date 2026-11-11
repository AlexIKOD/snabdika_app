/**
 * Текст ошибки для пользователя: без префикса «Error:» и без сетевого жаргона.
 * Сырые подробности остаются только в ErrorState → «Технические подробности».
 */
export function errorText(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).replace(/^\w*Error:\s*/, "").trim();
  if (!raw || /^HTTP 5\d\d$/.test(raw)) return "Локальный сервис не ответил. Повторите попытку.";
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return "Нет связи с локальным сервисом. Проверьте, что приложение запущено.";
  if (/^HTTP 404$/.test(raw)) return "Запись не найдена: возможно, она уже удалена.";
  if (/^HTTP 4\d\d$/.test(raw)) return "Запрос отклонён сервисом. Проверьте введённые данные.";
  return raw;
}
