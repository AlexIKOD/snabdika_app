import * as XLSX from "xlsx";

export type ImportSupplier = "СТК Строй" | "СибЭлКом" | "Кнауф Дом" | "Петрович" | "НОМЕНКЛАТУРА";
export type ImportPriceType = "purchase" | "retail" | null;

export interface ImportRow {
  row_number: number;
  supplier: ImportSupplier;
  raw_name: string;
  working_name: string;
  print_name: string;
  category: string;
  subcategory: string;
  unit: string | null;
  brand: string | null;
  identifiers: {
    uuid?: string;
    code?: string;
    external_code?: string;
    article?: string;
    ean?: string;
  };
  price: number | null;
  price_type: ImportPriceType;
  price_provided: boolean;
  source_file: string;
  imported_at: string;
  match_key: string;
  fingerprint: string;
}

export interface ColumnMapping {
  header_row: number;
  name?: string;
  unit?: string;
  price?: string;
  identifier?: string;
  identifiers: string[];
  ignored: string[];
}

export interface ImportPreview {
  supplier: ImportSupplier;
  source_file: string;
  fingerprint: string;
  sheet_name: string;
  mapping: ColumnMapping;
  rows: ImportRow[];
  skipped_rows: number;
  warnings: string[];
}

const SUPPLIER_ALIASES: Array<[ImportSupplier, RegExp[]]> = [
  ["СТК Строй", [/стк/, /stk/, /stroy/]],
  ["СибЭлКом", [/сибэлком/, /сибэл/, /кабел/]],
  ["Кнауф Дом", [/knauf/, /кнауф/]],
  ["Петрович", [/петрович/, /petrovich/]],
  ["НОМЕНКЛАТУРА", [/номенклатур/]],
];

const TYPE_RULES: Array<[RegExp, string, string]> = [
  [/держател.*кабел/i, "Держатель кабеля", "Крепёж и метизы"],
  [/лоток\s+(?:перфорирован|кабельн)|кабельн.*лоток/i, "Лоток кабельный", "Кабель-каналы и гофротрубы"],
  [/устройств.*перемотк.*кабел|перемотк.*кабел/i, "Устройство для перемотки кабеля", "Кабельно-проводниковая продукция"],
  [/воздухоотводчик/i, "Воздухоотводчик", "Отопление и водоснабжение"],
  [/вентиль\s+(?:для\s+)?подключен.*смесител|вентиль\b/i, "Вентиль", "Сантехника"],
  [/\b(?:ввг|ппг|пвс|кг|мкэш|nyм|nym|пугв|шввп|шнур)\b/i, "Кабель", "Кабельно-проводниковая продукция"],
  [/\b(?:бра|спот|mini\s+disc|parete\s+led)\b/i, "Светильник", "Светильники"],
  [/кабель-?канал/i, "Кабель-канал", "Кабель-каналы и гофротрубы"],
  [/гофр|труба.*пвх|труба.*канализац/i, "Труба", "Трубы и фитинги"],
  [/кабел/i, "Кабель", "Кабельно-проводниковая продукция"],
  [/провод/i, "Провод", "Кабельно-проводниковая продукция"],
  [/осб|osp|osb|осп|дсп|двп|фанер|плит[аы]/i, "Плита", "Древесно-плитные материалы"],
  [/гипсокартон|гкл|гвл|гсп|цсп/i, "Лист", "Гипсокартон и листовые материалы"],
  [/утепл|роклайт|минват|пенополистирол|xps|pir/i, "Утеплитель", "Теплоизоляция"],
  [/штукатур/i, "Штукатурка", "Штукатурки"],
  [/шпатл|шпаклев/i, "Шпатлёвка", "Шпатлёвки"],
  [/кле[йя]/i, "Клей", "Клеи"],
  [/монтажн.*пен|\bпен[аы]/i, "Пена монтажная", "Монтажная пена и герметики"],
  [/герметик/i, "Герметик", "Монтажная пена и герметики"],
  [/грунтов/i, "Грунтовка", "Грунтовки"],
  [/краск/i, "Краска", "Краски"],
  [/эмал/i, "Эмаль", "Эмали и лаки"],
  [/лак\b/i, "Лак", "Эмали и лаки"],
  [/керамогранит/i, "Керамогранит", "Керамическая плитка"],
  [/плитк/i, "Плитка", "Керамическая плитка"],
  [/ламинат/i, "Ламинат", "Напольные покрытия"],
  [/сифон/i, "Сифон", "Сантехника"],
  [/подводк/i, "Подводка для воды", "Сантехника"],
  [/смесител/i, "Смеситель", "Сантехника"],
  [/кран/i, "Кран", "Сантехника"],
  [/муфт/i, "Муфта", "Трубы и фитинги"],
  [/тройник/i, "Тройник", "Трубы и фитинги"],
  [/угол/i, "Уголок", "Трубы и фитинги"],
  [/саморез|дюбел|анкер|болт|винт|гайк|шайб/i, "Крепёж", "Крепёж и метизы"],
  [/арматур|профил|металлопрокат/i, "Металлопрокат", "Металлопрокат"],
];

const BRAND_RULES = [
  "Knauf", "Кнауф", "Ceresit", "Технониколь", "Роклайт", "Кроношпан", "Kronospan",
  "Quick Deck", "Quick-Step", "Tytan", "DKC", "IEK", "Grohe", "Cersanit", "Orio",
  "Орио", "TIM", "Тим", "Rehau", "Рехау", "Walraven", "Litokol", "Capricorn",
];

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();
}

function normalizedHeader(value: unknown): string {
  return text(value).toLocaleLowerCase("ru-RU").replace(/[\s._:()№#"'«»/\\-]+/g, "");
}

function normalizeDecimal(value: string): string {
  return value.replace(/(\d)\.(\d)/g, "$1,$2");
}

export function parsePrice(value: unknown): number | null {
  const raw = text(value).replace(/\u00a0/g, " ");
  if (!raw || /по согласован|нет данных|—|-/i.test(raw)) return null;
  const clean = raw.replace(/руб(?:лей|ля)?/gi, "").replace(/[^\d,.-]/g, "").replace(/\.$/, "").replace(/\.(?=\d{3}(?:\D|$))/g, "");
  if (!clean) return null;
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");
  let numeric = clean;
  if (comma >= 0 && dot >= 0) {
    numeric = comma > dot ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  } else if (comma >= 0) {
    numeric = clean.replace(/,/g, ".");
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectSupplier(fileName: string, rows: unknown[][]): ImportSupplier {
  const sample = `${fileName} ${rows.slice(0, 15).flat().map(text).join(" ")}`.toLocaleLowerCase("ru-RU");
  return SUPPLIER_ALIASES.find(([, patterns]) => patterns.some((pattern) => pattern.test(sample)))?.[0] ?? "Петрович";
}

function findHeaderRow(rows: unknown[][], supplier: ImportSupplier): number {
  const required = supplier === "СибЭлКом" ? ["кодтовара", "наименованиеэлемента"] : ["наименование", "номенклатура", "товар", "код"];
  let bestIndex = 0;
  let bestScore = 0;
  rows.slice(0, 100).forEach((row, index) => {
    const headers = row.map(normalizedHeader).filter(Boolean);
    const score = required.reduce((sum, token) => sum + (headers.some((header) => header.includes(token)) ? 1 : 0), 0) +
      (headers.some((header) => /цена|стоимость|закупочн/.test(header)) ? 1 : 0) +
      (headers.some((header) => /единиц|едизм|артикул|uuid|штрихкод|ean/.test(header)) ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 2 ? bestIndex : rows.findIndex((row) => row.some((cell) => /наименование|код товара|номенклатура/i.test(text(cell)))) || 0;
}

function chooseColumn(headers: string[], patterns: RegExp[]): string | undefined {
  return headers.find((header) => patterns.some((pattern) => pattern.test(normalizedHeader(header))));
}

function mapColumns(headers: string[], supplier: ImportSupplier): ColumnMapping {
  const name = chooseColumn(headers, [/^наименование$/, /номенклатура$/, /наименованиеэлемента/, /товар$/]);
  const unit = chooseColumn(headers, [/единиц/, /^ед$/, /едизм/]);
  const price = supplier === "СТК Строй"
    ? chooseColumn(headers, [/закупочн/])
    : supplier === "Кнауф Дом"
      ? chooseColumn(headers, [/ценапродажи/])
      : chooseColumn(headers, [/цена(?!.*валют)/, /региональная.*цена/]);
  const identifiers = headers.filter((header) => /uuid|код|артикул|внешнийкод|штрихкод|ean/.test(normalizedHeader(header)));
  const ignored = headers.filter((header) => /остат|резерв|валют|картин|групп|тип$/.test(normalizedHeader(header)));
  return {
    header_row: 0,
    name,
    unit,
    price,
    identifier: identifiers[0],
    identifiers,
    ignored,
  };
}

function findValue(row: Record<string, unknown>, headers: string[], patterns: RegExp[]): string {
  const header = chooseColumn(headers, patterns);
  return header ? text(row[header]) : "";
}

function inferType(source: string): [string, string] {
  return TYPE_RULES.find(([pattern]) => pattern.test(source))?.slice(1) as [string, string] ?? ["Товар", "Прочие строительные материалы"];
}

function inferBrand(source: string): string | null {
  const found = BRAND_RULES.find((brand) => source.toLocaleLowerCase("ru-RU").includes(brand.toLocaleLowerCase("ru-RU")));
  return found ?? null;
}

function normalizeDimensions(value: string, type: string): string {
  const result = normalizeDecimal(value)
    .replace(/(\d)\s*[xх×*]\s*(?=\d)/gi, "$1х")
    .replace(/\b([dD])\s*(\d+(?:,\d+)?)(?!\s*(?:мм|см|м)\b)/g, "$1$2мм")
    .replace(/(?<![\w,])((?:\d+(?:,\d+)?)(?:х\d+(?:,\d+)?)+)(?![\d,])(?:\s*(мм²|мм|см|м²|м))?/gi, (_match, dimensions: string, existingUnit?: string) => {
      if (type === "Кабель" || type === "Провод") return `${dimensions}мм²`;
      return existingUnit ? `${dimensions} ${existingUnit}` : `${dimensions} мм`;
    });
  return result;
}

export function normalizeProductName(rawName: string, _unit: string | null): { working_name: string; print_name: string; category: string; subcategory: string; brand: string | null } {
  const raw = text(rawName).replace(/^\d+[.)]?\s+/, "");
  const [type, subcategory] = inferType(raw);
  const category = subcategory === "Прочие строительные материалы" ? "Прочие материалы" :
    ["Кабельно-проводниковая продукция", "Кабель-каналы и гофротрубы", "Сантехника", "Трубы и фитинги", "Крепёж и метизы", "Металлопрокат"].includes(subcategory)
      ? "Инженерные системы и крепёж"
      : ["Керамическая плитка", "Напольные покрытия"].includes(subcategory)
        ? "Чистовые отделочные материалы"
        : ["Теплоизоляция"].includes(subcategory)
          ? "Изоляционные и фасадные материалы"
          : ["Штукатурки", "Шпатлёвки", "Клеи", "Монтажная пена и герметики"].includes(subcategory)
            ? "Сухие строительные смеси"
            : ["Грунтовки", "Краски", "Эмали и лаки"].includes(subcategory)
              ? "Лакокрасочные материалы"
              : "Строительные материалы и лесопиломатериалы";
  const normalized = normalizeDimensions(raw, type)
    .replace(/\bупаковка\b/gi, "упак.")
    .replace(/\bмешок\b/gi, "меш.")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
  let body = normalized;
  if (type === "Лоток кабельный") body = body.replace(/^лоток\s*/i, "");
  if (type === "Держатель кабеля") body = body.replace(/^держатель\s+кабеля\s*/i, "");
  if (type === "Устройство для перемотки кабеля") body = body.replace(/^устройство\s+перемотки\s+кабеля\s*/i, "");
  if (type === "Воздухоотводчик") body = body.replace(/^автоматический\s+воздухоотводчик\s*/i, "");
  const startsWithType = new RegExp(`^${type.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(body);
  const printName = `${startsWithType ? "" : `${type} `}${body}`.replace(/\s+([,).])/g, "$1").trim();
  const withoutParentheses = printName.replace(/\([^)]*\)/g, "").replace(/\b(?:гост|ту)\s*[^ ]+/gi, "").replace(/\s{2,}/g, " ").trim();
  const workingName = withoutParentheses.length > 96 ? withoutParentheses.slice(0, 96).trim() : withoutParentheses;
  return {
    working_name: workingName || `${type} ${raw}`,
    print_name: printName || raw,
    category,
    subcategory,
    brand: inferBrand(raw),
  };
}

function buildIdentifiers(row: Record<string, unknown>, headers: string[]): ImportRow["identifiers"] {
  const result: ImportRow["identifiers"] = {};
  const value = (patterns: RegExp[]) => findValue(row, headers, patterns) || undefined;
  result.uuid = value([/uuid/]);
  result.code = value([/^код$/, /кодтовара/]);
  result.external_code = value([/внешнийкод/]);
  result.article = value([/артикул/]);
  result.ean = value([/штрихкод/, /ean/]);
  return Object.fromEntries(Object.entries(result).filter(([, item]) => item)) as ImportRow["identifiers"];
}

export function matchKey(row: Pick<ImportRow, "working_name" | "unit" | "brand" | "identifiers">): string {
  const id = row.identifiers.uuid || row.identifiers.external_code || row.identifiers.code || row.identifiers.article || row.identifiers.ean || "";
  return `${row.working_name}|${row.unit || ""}|${row.brand || ""}|${id}`.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}|]/gu, "");
}

export async function fingerprintBuffer(buffer: ArrayBuffer, fileName: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${fileName}:${hash}`;
  }
  return `${fileName}:${buffer.byteLength}`;
}

export function parseWorkbook(buffer: ArrayBuffer, fileName: string, supplierOverride?: ImportSupplier, importedAt = new Date().toISOString(), priceTypeOverride?: Exclude<ImportPriceType, null>, fingerprintOverride?: string): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
  const supplier = supplierOverride || detectSupplier(fileName, rows);
  const headerRow = supplier === "НОМЕНКЛАТУРА" ? 0 : findHeaderRow(rows, supplier);
  const headers = (rows[headerRow] || []).map(text);
  const mapping = mapColumns(headers, supplier);
  mapping.header_row = headerRow;
  const warnings: string[] = [];
  if (!mapping.name) warnings.push("Не найдена колонка с наименованием товара");
  if (!mapping.unit && supplier !== "СибЭлКом") warnings.push("Единица измерения не распознана; потребуется проверка");
  if (!mapping.price && supplier !== "НОМЕНКЛАТУРА") warnings.push("Цена не распознана; предложения будут созданы без цены");
  const importedRows: ImportRow[] = [];
  let skippedRows = 0;
  const fingerprint = fingerprintOverride || `${fileName}:${buffer.byteLength}`;
  rows.slice(headerRow + 1).forEach((values, offset) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const rawName = findValue(row, headers, [/^наименование$/, /номенклатура$/, /наименованиеэлемента/, /товар$/]).replace(/^\d+[.)]?\s+/, "");
    if (!rawName || rawName === "-" || /^\.?\)$/.test(rawName) || /^(остатки|резерв|группы|итого)$/i.test(rawName)) {
      skippedRows += 1;
      return;
    }
    const unit = findValue(row, headers, [/единиц/, /^ед$/, /едизм/]) || null;
    const naming = normalizeProductName(rawName, unit);
    const identifiers = buildIdentifiers(row, headers);
    const priceValue = supplier === "Петрович"
      ? parsePrice(findValue(row, headers, [/региональная.*цена/, /розничнаяцена/]))
      : parsePrice(mapping.price ? row[mapping.price] : null);
    const priceType: ImportPriceType = supplier === "СТК Строй" || (supplier === "Петрович" && (priceTypeOverride === "purchase" || /себестоимость/i.test(fileName))) ? "purchase" : supplier === "НОМЕНКЛАТУРА" ? null : priceTypeOverride || "retail";
    const importRow: ImportRow = {
      row_number: headerRow + offset + 2,
      supplier,
      raw_name: rawName,
      working_name: naming.working_name,
      print_name: naming.print_name,
      category: naming.category,
      subcategory: naming.subcategory,
      unit,
      brand: naming.brand,
      identifiers,
      price: priceValue,
      price_type: priceType,
      price_provided: priceValue !== null,
      source_file: fileName,
      imported_at: importedAt,
      match_key: "",
      fingerprint,
    };
    importRow.match_key = matchKey(importRow);
    importedRows.push(importRow);
  });
  return { supplier, source_file: fileName, fingerprint, sheet_name: sheetName, mapping, rows: importedRows, skipped_rows: skippedRows, warnings };
}
