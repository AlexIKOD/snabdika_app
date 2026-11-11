import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { mockServer } from "../mock/mockServer";
import { normalizeProductName, parsePrice, parseWorkbook } from "../features/import/productImport";
import type { ImportRow } from "../features/import/productImport";

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet0");
  return XLSX.write(book, { type: "array", bookType: "xlsx" });
}

describe("импорт прайс-листов и единая номенклатура", () => {
  it("нормализует размеры и формирует рабочее/печатное имя без выдуманных характеристик", () => {
    const result = normalizeProductName("OSB-3 9x1250x2500 мм Кроношпан", "л.");
    expect(result.print_name).toContain("Плита");
    expect(result.print_name).toContain("9х1250х2500 мм");
    expect(result.print_name).not.toContain("9x");
    expect(result.working_name).not.toContain("ГОСТ");
    expect(result.brand).toBe("Кроношпан");
  });

  it("разбирает запятую, точку и разделители тысяч в цене", () => {
    expect(parsePrice("1,076.00")).toBe(1076);
    expect(parsePrice("1 076,50 руб.")).toBe(1076.5);
    expect(parsePrice("По согласованию")).toBeNull();
  });

  it("находит заголовок после служебных строк и применяет правило СТК Строй", () => {
    const data = workbookBuffer([
      ["Прайс поставщика"],
      ["Дата", "15.09.2026"],
      ["UUID", "Код", "Наименование", "Единица измерения", "Цена продажи", "Закупочная цена", "Резерв", "Штрихкод EAN13"],
      ["uuid-1", "A-1", "Плита OSB-3 9x1250x2500 мм", "л.", "999", "711,70", "100", "4600000000001"],
    ]);
    const preview = parseWorkbook(data, "20260915_stk-stroy.xlsx");
    expect(preview.supplier).toBe("СТК Строй");
    expect(preview.mapping.price).toBe("Закупочная цена");
    expect(preview.rows[0].price).toBe(711.7);
    expect(preview.rows[0].identifiers.uuid).toBe("uuid-1");
  });

  it("автоматически создаёт товар, повторный файл не дублирует его, а новая цена обновляет только цену", async () => {
    const base: ImportRow = {
      row_number: 1,
      supplier: "СибЭлКом",
      raw_name: "Кабель ВВГнг(А)-LS 3x2,5 мм",
      working_name: "Кабель ВВГнг(А)-LS 3х2,5 мм²",
      print_name: "Кабель ВВГнг(А)-LS 3х2,5 мм²",
      category: "Инженерные системы и крепёж",
      subcategory: "Кабельно-проводниковая продукция",
      unit: "м",
      brand: null,
      identifiers: { code: `TEST-${Date.now()}` },
      price: 100,
      price_type: "retail",
      price_provided: true,
      source_file: "test-sibelkom.xlsx",
      imported_at: "2026-09-23T10:00:00.000Z",
      match_key: "test",
      fingerprint: `test-${Date.now()}`,
    };
    const first = await mockServer.importSupplierRows({ source_file: base.source_file, fingerprint: base.fingerprint, supplier: base.supplier, imported_at: base.imported_at, rows: [base], skipped_rows: 2 });
    expect(first.data.created).toBe(1);
    expect(first.data.updated).toBe(0);
    expect(first.data.skipped).toBe(2);

    const duplicate = await mockServer.importSupplierRows({ source_file: base.source_file, fingerprint: base.fingerprint, supplier: base.supplier, imported_at: base.imported_at, rows: [base] });
    expect(duplicate.data.duplicate_file).toBe(true);
    expect(duplicate.data.skipped).toBe(1);

    const updated = { ...base, fingerprint: `${base.fingerprint}-new`, price: 125, source_file: "test-sibelkom-new.xlsx", imported_at: "2026-09-23T11:00:00.000Z" };
    const second = await mockServer.importSupplierRows({ source_file: updated.source_file, fingerprint: updated.fingerprint, supplier: updated.supplier, imported_at: updated.imported_at, rows: [updated] });
    expect(second.data.updated).toBe(1);
    const catalog = await mockServer.getMaterials({ query: base.identifiers.code });
    expect(catalog.data.some((material) => material.offers.some((offer) => offer.price === 125))).toBe(true);
  });
});
