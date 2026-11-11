/**
 * Единое форматирование чисел, денег, процентов и дат.
 * Экраны не вызывают toLocaleString/toFixed напрямую — только эти функции.
 */

const moneyFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const moneyWholeFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantityFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const EMPTY = "—";

/** Деньги с копейками: «1 234,50 ₽». */
export const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? EMPTY : `${moneyFormat.format(value)} ₽`;

/** Крупные суммы без копеек: «90 461 ₽». */
export const moneyWhole = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? EMPTY : `${moneyWholeFormat.format(value)} ₽`;

/** Процент: «18,00%»; digits задаёт число знаков после запятой. */
export const percent = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? EMPTY
    : `${(digits === 2 ? percentFormat : new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })).format(value)}%`;

/** Количество: «1 250,5». */
export const quantity = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? EMPTY : quantityFormat.format(value);

/** Дата: «21.10.2026». Принимает ISO-строку, дату без времени и Date. */
export const date = (value: string | Date | null | undefined) => {
  const parsed = toDate(value);
  return parsed ? dateFormat.format(parsed) : EMPTY;
};

/** Дата и время: «21.10.2026, 23:39». */
export const dateTime = (value: string | Date | null | undefined) => {
  const parsed = toDate(value);
  return parsed ? dateTimeFormat.format(parsed) : EMPTY;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Русское склонение по числу: plural(5, "позиция", "позиции", "позиций"). */
export const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** ISO-дата для полей ввода: «2026-10-21». */
export const isoDate = (value: Date = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Размер файла для интерфейса: «1,4 МБ». */
export const fileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
};
