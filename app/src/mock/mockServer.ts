/**
 * Встроенный Mock-сервер (§3.1, §3.2 ТЗ)
 * Полноценная реализация контракта API для Этапа 2 без истории цен.
 */

import type { ApiResponse } from "../types/api";
import type {
  AppSettings,
  ClientRequest,
  CreateInvoicePayload,
  DashboardStats,
  Invoice,
  InvoicePosition,
  LogEntry,
  Material,
  MaterialAlias,
  RequestPricing,
  RequestPricingResult,
  Supplier,
  SystemHealth,
  ImportReport,
} from "../types/models";
import type { ImportRow } from "../features/import/productImport";
import { matchKey } from "../features/import/productImport";
import {
  MOCK_DASHBOARD_STATS,
  MOCK_INVOICES,
  MOCK_LOGS,
  MOCK_MATERIALS,
  MOCK_REQUESTS,
  MOCK_SUPPLIERS,
  MOCK_SYSTEM_HEALTH,
} from "./mockData";

export interface CategoryNode {
  name: string;
  count: number;
  subcategories: { name: string; count: number }[];
}

export const MOCK_CATEGORIES: CategoryNode[] = [
  {
    name: "Все категории",
    count: 90033,
    subcategories: [],
  },
  {
    name: "Строительные материалы и лесопиломатериалы",
    count: 24510,
    subcategories: [
      { name: "Древесно-плитные материалы / OSB", count: 1250 },
      { name: "Фанера и ЦСП", count: 3410 },
      { name: "Пиломатериалы обрезные", count: 8900 },
      { name: "Гипсокартон и ГВЛ", count: 5200 },
    ],
  },
  {
    name: "Сухие строительные смеси",
    count: 18420,
    subcategories: [
      { name: "Штукатурки гипсовые", count: 2800 },
      { name: "Штукатурки цементные", count: 3100 },
      { name: "Шпатлевки финишные", count: 4200 },
      { name: "Клеи для плитки и камня", count: 5600 },
    ],
  },
  {
    name: "Электротехнические товары",
    count: 15300,
    subcategories: [
      { name: "Кабельно-проводниковая продукция", count: 7227 },
      { name: "Автоматические выключатели и УЗО", count: 4100 },
      { name: "Кабель-каналы и гофротрубы", count: 2400 },
    ],
  },
  {
    name: "Изоляционные и фасадные материалы",
    count: 14200,
    subcategories: [
      { name: "Минеральная вата", count: 4500 },
      { name: "Экструдированный пенополистирол (XPS)", count: 3200 },
      { name: "Сетки строительные", count: 1800 },
      { name: "Гидро-пароизоляционные мембраны", count: 2600 },
    ],
  },
  {
    name: "Лакокрасочные материалы",
    count: 9800,
    subcategories: [
      { name: "Грунтовки", count: 2400 },
      { name: "Краски интерьерные", count: 3900 },
      { name: "Эмали и лаки", count: 2800 },
    ],
  },
  {
    name: "Инженерные системы и крепёж",
    count: 9300,
    subcategories: [
      { name: "Сантехника", count: 4100 },
      { name: "Трубы и фитинги", count: 2200 },
      { name: "Крепёж и метизы", count: 1800 },
      { name: "Металлопрокат", count: 1200 },
    ],
  },
  {
    name: "Чистовые отделочные материалы",
    count: 6400,
    subcategories: [
      { name: "Керамическая плитка", count: 2900 },
      { name: "Напольные покрытия", count: 2100 },
      { name: "Обои и декор", count: 1400 },
    ],
  },
  {
    name: "Прочие материалы",
    count: 3100,
    subcategories: [{ name: "Требует классификации", count: 3100 }],
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  table_density: "standard",
  rows_per_page: 50,
  default_supplier: "Петрович",
  default_price_type: "retail",
  supplier_selection_mode: "min_purchase",
  confidence_threshold_percent: 90,
  moysklad_api_url: "https://api.moysklad.ru/api/remap/1.2",
  moysklad_organization: "ООО «Снабдика»",
  moysklad_warehouse: "Основной склад СПБ",
  moysklad_vat_rate: "20%",
  gemini_model_vision: "gemini-1.5-flash",
  gemini_model_embeddings: "text-embedding-004",
  database_path: "database/snabdika.db",
  images_path: "storage/images",
  images_retention_days: 30,
  log_level: "INFO",
};

class MockServerState {
  materials: Material[] = [...MOCK_MATERIALS];
  suppliers: Supplier[] = [...MOCK_SUPPLIERS];
  requests: ClientRequest[] = [...MOCK_REQUESTS];
  invoices: Invoice[] = [...MOCK_INVOICES];
  logs: LogEntry[] = [...MOCK_LOGS];
  health: SystemHealth = { ...MOCK_SYSTEM_HEALTH };
  settings: AppSettings = { ...DEFAULT_SETTINGS };
  imports: ImportReport[] = [];
  importedFingerprints = new Set<string>();
}

let nextRequestId = 20000;
let nextInvoiceId = 30000;
let nextMaterialId = 50000;
let nextOfferId = 90000;
let nextImportId = 1;

const state = new MockServerState();

export const mockServer = {
  async getHealth(): Promise<ApiResponse<SystemHealth>> {
    return { data: { ...state.health } };
  },

  async getDashboard(): Promise<ApiResponse<DashboardStats>> {
    return { data: { ...MOCK_DASHBOARD_STATS } };
  },

  async getCategories(): Promise<ApiResponse<CategoryNode[]>> {
    return { data: MOCK_CATEGORIES };
  },

  async getMaterials(params?: {
    query?: string;
    category?: string;
    supplier_id?: number;
    has_price_conflict?: boolean;
    has_suspected_merge?: boolean;
    has_price?: "all" | "with_price" | "no_price";
    has_weight?: "all" | "with_weight" | "no_weight";
    sort_by?: "id" | "name" | "weight" | "price";
    sort_dir?: "asc" | "desc";
  }): Promise<ApiResponse<Material[]>> {
    let list = [...state.materials];

    if (params?.query) {
      const q = params.query.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.canonical_name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          (m.brand && m.brand.toLowerCase().includes(q)) ||
          m.offers.some((o) => o.supplier_code.toLowerCase().includes(q)) ||
          (m.aliases && m.aliases.some((a) => a.raw_name.toLowerCase().includes(q)))
      );
    }

    const catFilter = params?.category;
    if (catFilter && catFilter !== "Все категории") {
      list = list.filter(
        (m) => m.category === catFilter || m.subcategory.includes(catFilter)
      );
    }

    if (params?.supplier_id) {
      list = list.filter((m) =>
        m.offers.some((o) => o.supplier_id === params.supplier_id && o.price !== null && o.price > 0)
      );
    }

    if (params?.has_price_conflict) {
      list = list.filter((m) => m.flags.includes("price_conflict"));
    }

    if (params?.has_suspected_merge) {
      list = list.filter((m) => m.flags.includes("suspected_false_merge"));
    }

    if (params?.has_price === "with_price") {
      list = list.filter((m) => m.offers.some((o) => o.price !== null && o.price > 0));
    } else if (params?.has_price === "no_price") {
      list = list.filter((m) => m.offers.every((o) => o.price === null || o.price === 0));
    }

    if (params?.has_weight === "with_weight") {
      list = list.filter((m) => m.weight_kg !== null && m.weight_kg > 0);
    } else if (params?.has_weight === "no_weight") {
      list = list.filter((m) => m.weight_kg === null || m.weight_kg === 0);
    }

    if (params?.sort_by) {
      const dir = params.sort_dir === "desc" ? -1 : 1;
      list.sort((a, b) => {
        if (params.sort_by === "id") return (a.material_id - b.material_id) * dir;
        if (params.sort_by === "name") return a.canonical_name.localeCompare(b.canonical_name) * dir;
        if (params.sort_by === "weight") return ((a.weight_kg || 0) - (b.weight_kg || 0)) * dir;
        if (params.sort_by === "price") {
          const priceA = a.best_purchase?.price || 0;
          const priceB = b.best_purchase?.price || 0;
          return (priceA - priceB) * dir;
        }
        return 0;
      });
    }

    return {
      data: list,
      meta: {
        total: 90033,
        page: 1,
        page_size: 50,
        took_ms: 8,
      },
    };
  },

  async getMaterialById(id: number): Promise<ApiResponse<Material>> {
    const material = state.materials.find((m) => m.material_id === id);
    if (!material) {
      throw new Error(`Материал с ID ${id} не найден`);
    }
    return { data: { ...material } };
  },

  async patchMaterial(id: number, patch: Partial<Material>): Promise<ApiResponse<Material>> {
    const idx = state.materials.findIndex((m) => m.material_id === id);
    if (idx === -1) throw new Error(`Материал с ID ${id} не найден`);

    const updated = {
      ...state.materials[idx],
      ...patch,
      material_id: id,
    };
    state.materials[idx] = updated;

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "CATALOG",
      message: `Оператор обновил характеристики материала #${id} («${updated.canonical_name}»)`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return { data: updated };
  },

  async addMaterialAlias(materialId: number, rawName: string): Promise<ApiResponse<MaterialAlias>> {
    const material = state.materials.find((m) => m.material_id === materialId);
    if (!material) throw new Error("Материал не найден");

    if (!material.aliases) material.aliases = [];

    const newAlias: MaterialAlias = {
      alias_id: Date.now(),
      material_id: materialId,
      raw_name: rawName.trim(),
      source: "Ручной ввод оператора",
      confidence: 100,
      created_at: new Date().toLocaleDateString("ru-RU"),
    };

    material.aliases.push(newAlias);
    material.aliases_count = material.aliases.length;

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "ALIASES",
      message: `Добавлен синоним «${rawName}» для материала #${materialId}`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return { data: newAlias };
  },

  async mergeMaterials(sourceId: number, targetId: number): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const sourceIdx = state.materials.findIndex((m) => m.material_id === sourceId);
    const target = state.materials.find((m) => m.material_id === targetId);

    if (sourceIdx === -1 || !target) {
      throw new Error("Один из объединяемых материалов не найден");
    }

    const source = state.materials[sourceIdx];

    // Переносим предложения и синонимы
    if (!target.aliases) target.aliases = [];
    if (source.aliases) {
      target.aliases.push(...source.aliases);
    }
    // Добавляем каноническое имя источника как синоним
    target.aliases.push({
      alias_id: Date.now(),
      material_id: targetId,
      raw_name: source.canonical_name,
      source: `Объединение дубля #${sourceId}`,
      confidence: 100,
      created_at: new Date().toLocaleDateString("ru-RU"),
    });

    // Переносим предложения поставщиков, которых не было у целевого
    for (const offer of source.offers) {
      if (!target.offers.some((o) => o.supplier_id === offer.supplier_id && o.price_type === offer.price_type)) {
        target.offers.push({ ...offer });
      }
    }

    target.aliases_count = target.aliases.length;

    // Удаляем исходный дубль из активных материалов
    state.materials.splice(sourceIdx, 1);

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "MERGE",
      message: `Материал #${sourceId} успешно объединен в материал #${targetId}`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return {
      data: {
        success: true,
        message: `Материал #${sourceId} объединен с #${targetId}. Предложения и синонимы перенесены.`,
      },
    };
  },

  async getSuppliers(): Promise<ApiResponse<Supplier[]>> {
    return { data: state.suppliers };
  },

  async getImportReports(): Promise<ApiResponse<ImportReport[]>> {
    return { data: state.imports.map((report) => ({ ...report, items: [...report.items] })) };
  },

  async importSupplierRows(payload: { source_file: string; fingerprint: string; supplier: string; imported_at: string; rows: ImportRow[]; skipped_rows?: number; warnings?: string[] }): Promise<ApiResponse<ImportReport>> {
    const existingReport = state.imports.find((report) => report.source_file === payload.source_file && state.importedFingerprints.has(payload.fingerprint));
    if (existingReport) {
      const duplicate: ImportReport = {
        ...existingReport,
        import_id: nextImportId++,
        imported_at: payload.imported_at,
        created: 0,
        updated: 0,
        skipped: payload.rows.length + (payload.skipped_rows || 0),
        review: 0,
        duplicate_file: true,
        warnings: [...existingReport.warnings, "Этот файл уже был импортирован; повторная обработка предотвращена"],
        items: [],
      };
      state.imports.unshift(duplicate);
      return { data: duplicate };
    }

    const supplierName = payload.supplier;
    let supplier = state.suppliers.find((item) => item.name === supplierName);
    if (!supplier) {
      supplier = {
        supplier_id: Math.max(0, ...state.suppliers.map((item) => item.supplier_id)) + 1,
        name: supplierName,
        code: supplierName.toLocaleUpperCase("ru-RU").replace(/[^A-ZА-Я0-9]+/g, "_"),
        is_active: supplierName !== "НОМЕНКЛАТУРА",
        offers_count: 0,
        last_import_at: null,
      };
      state.suppliers.push(supplier);
    }

    const report: ImportReport = {
      import_id: nextImportId++,
      supplier: supplierName,
      source_file: payload.source_file,
      imported_at: payload.imported_at,
      created: 0,
      updated: 0,
      skipped: payload.skipped_rows || 0,
      review: 0,
      duplicate_file: false,
      warnings: payload.warnings || [],
      items: [],
    };

    const rowIdentifierValues = (row: ImportRow) => Object.values(row.identifiers).filter(Boolean).map((value) => value!.toLocaleLowerCase("ru-RU"));
    const isSameSupplierOffer = (offer: Material["offers"][number], row: ImportRow) => offer.supplier_id === supplier!.supplier_id && (offer.price_type === (row.price_type || "retail") || (row.price_type === null && !offer.price));

    for (const row of payload.rows) {
      const identifiers = rowIdentifierValues(row);
      const candidates = state.materials.filter((material) => material.offers.some((offer) => {
        if (offer.supplier_id !== supplier!.supplier_id) return false;
        const offerValues = [offer.supplier_code, offer.external_id, offer.uuid, offer.article, offer.ean].filter(Boolean).map((value) => String(value).toLocaleLowerCase("ru-RU"));
        return identifiers.some((value) => offerValues.includes(value));
      }));
      const aliasCandidates = state.materials.filter((material) => material.aliases?.some((alias) => alias.source === supplierName && alias.raw_name.trim().toLocaleLowerCase("ru-RU") === row.raw_name.trim().toLocaleLowerCase("ru-RU")));
      const exactCandidates = state.materials.filter((material) => {
        const candidate = {
          working_name: material.working_name || material.canonical_name,
          unit: material.unit,
          brand: material.brand,
          identifiers: {},
        };
        return matchKey(candidate) === row.match_key || (candidate.working_name.toLocaleLowerCase("ru-RU") === row.working_name.toLocaleLowerCase("ru-RU") && candidate.unit === row.unit && candidate.brand === row.brand);
      });
      const identityMatch = candidates[0] || aliasCandidates[0];
      const ambiguous = candidates.length > 1 || aliasCandidates.length > 1 || (!identityMatch && exactCandidates.length > 1);
      let material: Material | undefined = identityMatch || (!ambiguous ? exactCandidates[0] : undefined);
      let action: ImportReport["items"][number]["action"] = "updated";
      let reason = "Найдено по постоянному идентификатору";

      if (!material) {
        material = {
          material_id: nextMaterialId++,
          canonical_name: row.print_name,
          working_name: row.working_name,
          print_name: row.print_name,
          unit: row.unit || "шт.",
          weight_kg: null,
          category: row.category,
          subcategory: row.subcategory,
          brand: row.brand,
          status: ambiguous ? ("draft" as const) : ("active" as const),
          aliases_count: 1,
          offers: [],
          best_purchase: null,
          flags: ambiguous ? ["suspected_false_merge"] : [],
          aliases: [{ alias_id: Date.now() + report.items.length, material_id: nextMaterialId - 1, raw_name: row.raw_name, source: supplierName, confidence: ambiguous ? 45 : 94, created_at: new Date().toLocaleDateString("ru-RU") }],
        };
        state.materials.push(material);
        report.created += 1;
        action = ambiguous ? "review" : "created";
        reason = ambiguous ? "Есть несколько похожих записей; создан отдельный товар и помечен для проверки" : "Новый внутренний товар создан автоматически";
      } else {
        report.updated += 1;
        if (identityMatch) reason = candidates.length > 1 ? "Идентификатор совпал, но есть дополнительные кандидаты" : reason;
        else if (aliasCandidates.length) reason = "Найдено по ранее сохранённому алиасу поставщика";
        else reason = "Точное совпадение рабочего наименования и атрибутов";
        if (ambiguous) {
          material = undefined;
        }
      }

      if (!material) {
        const safeMaterial = {
          material_id: nextMaterialId++,
          canonical_name: row.print_name,
          working_name: row.working_name,
          print_name: row.print_name,
          unit: row.unit || "шт.",
          weight_kg: null,
          category: row.category,
          subcategory: row.subcategory,
          brand: row.brand,
          status: "draft" as const,
          aliases_count: 1,
          offers: [],
          best_purchase: null,
          flags: ["suspected_false_merge"],
          aliases: [{ alias_id: Date.now() + report.items.length, material_id: nextMaterialId - 1, raw_name: row.raw_name, source: supplierName, confidence: 45, created_at: new Date().toLocaleDateString("ru-RU") }],
        };
        state.materials.push(safeMaterial);
        material = safeMaterial;
        report.created += 1;
        report.review += 1;
        action = "review";
      }

      const offer = material.offers.find((item) => isSameSupplierOffer(item, row));
      const externalId = row.identifiers.external_code || row.identifiers.code || row.identifiers.article || row.identifiers.ean || "";
      if (offer) {
        offer.supplier_code = externalId || offer.supplier_code;
        offer.raw_name = row.raw_name || offer.raw_name;
        offer.working_name = row.working_name || offer.working_name;
        offer.print_name = row.print_name || offer.print_name;
        offer.external_id = row.identifiers.external_code || offer.external_id;
        offer.uuid = row.identifiers.uuid || offer.uuid;
        offer.article = row.identifiers.article || offer.article;
        offer.ean = row.identifiers.ean || offer.ean;
        offer.unit = row.unit || offer.unit;
        offer.source_file = row.source_file || offer.source_file;
        offer.imported_at = row.imported_at;
        if (row.price_provided) offer.price = row.price;
        offer.updated_at = row.imported_at;
      } else {
        material.offers.push({
          offer_id: nextOfferId++,
          supplier_id: supplier.supplier_id,
          supplier_name: supplier.name,
          price_type: row.price_type || "retail",
          price: row.price_provided ? row.price : null,
          supplier_code: externalId,
          updated_at: row.imported_at,
          in_stock: true,
          raw_name: row.raw_name,
          working_name: row.working_name,
          print_name: row.print_name,
          external_id: row.identifiers.external_code || null,
          uuid: row.identifiers.uuid || null,
          article: row.identifiers.article || null,
          ean: row.identifiers.ean || null,
          unit: row.unit,
          source_file: row.source_file,
          imported_at: row.imported_at,
        });
        supplier.offers_count += 1;
      }
      material.canonical_name = row.print_name || material.canonical_name;
      material.working_name = row.working_name || material.working_name;
      material.print_name = row.print_name || material.print_name;
      if (row.unit) material.unit = row.unit;
      material.category = row.category || material.category;
      material.subcategory = row.subcategory || material.subcategory;
      material.brand = row.brand || material.brand;
      if (!material.aliases?.some((alias) => alias.source === supplierName && alias.raw_name === row.raw_name)) {
        material.aliases = [...(material.aliases || []), { alias_id: Date.now() + report.items.length, material_id: material.material_id, raw_name: row.raw_name, source: supplierName, confidence: action === "review" ? 45 : 94, created_at: new Date().toLocaleDateString("ru-RU") }];
        material.aliases_count = material.aliases.length;
      }
      const purchase = material.offers.filter((item) => item.price_type === "purchase" && item.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0))[0];
      material.best_purchase = purchase ? { supplier_name: purchase.supplier_name, price: purchase.price! } : material.best_purchase;
      report.items.push({ row_number: row.row_number, raw_name: row.raw_name, print_name: row.print_name, supplier: supplierName, action, material_id: material.material_id, reason, source_file: row.source_file });
    }

    state.importedFingerprints.add(payload.fingerprint);
    supplier.last_import_at = payload.imported_at;
    state.imports.unshift(report);
    state.logs.unshift({ log_id: Date.now(), level: report.review ? "WARNING" : "INFO", category: "IMPORT", message: `Импорт ${supplierName}: создано ${report.created}, обновлено ${report.updated}, требуют проверки ${report.review}`, payload_json: JSON.stringify({ source_file: report.source_file, import_id: report.import_id }), created_at: new Date().toLocaleString("ru-RU") });
    return { data: report };
  },

  async getRequests(): Promise<ApiResponse<ClientRequest[]>> {
    return { data: state.requests };
  },

  async getRequestById(id: number): Promise<ApiResponse<ClientRequest>> {
    const req = state.requests.find((r) => r.request_id === id);
    if (!req) {
      throw new Error(`Запрос с ID ${id} не найден`);
    }
    const view = await this.getRequestPricing(id);
    const prices = new Map(view.data.positions.map((row) => [row.position_id, row.sale_price]));
    req.positions.forEach((position) => {
      position.sale_price = prices.get(position.position_id) ?? null;
    });
    return { data: req };
  },

  async getRequestPricing(requestId: number): Promise<ApiResponse<RequestPricingResult>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");
    const pricing: RequestPricing = req.pricing ?? {
      pricing_mode: "discount", target_percent: 0, vat_enabled: false, vat_included: false, vat_rate: 0,
    };
    const factor = pricing.vat_enabled ? 1 + pricing.vat_rate / 100 : 1;
    const ready = req.positions.filter(
      (p) => (p.retail_price ?? 0) > 0 && (p.purchase_price ?? 0) > 0 && (p.parsed_qty ?? 0) > 0
    );
    const retail = ready.reduce((sum, p) => sum + (p.retail_price ?? 0) * (p.parsed_qty ?? 0), 0);
    const cost = ready.reduce((sum, p) => sum + (p.purchase_price ?? 0) * (p.parsed_qty ?? 0), 0);
    const base =
      pricing.pricing_mode === "discount"
        ? retail * (1 - pricing.target_percent / 100)
        : cost / (1 - pricing.target_percent / 100) * (pricing.vat_included ? factor : 1);
    const positions = retail
      ? ready.map((p) => {
          const sale = Math.round((p.retail_price ?? 0) * (base / retail) * 100) / 100;
          return { position_id: p.position_id, sale_price: sale, sum_total: Math.round(sale * (p.parsed_qty ?? 0) * 100) / 100 };
        })
      : [];
    const sum = Math.round(positions.reduce((total, p) => total + p.sum_total, 0) * 100) / 100;
    const net = pricing.vat_enabled && pricing.vat_included ? Math.round((sum / factor) * 100) / 100 : sum;
    return {
      data: {
        pricing,
        positions,
        excluded: req.positions.filter((p) => !ready.includes(p)).map((p) => p.position_id),
        sum_total: sum,
        sum_without_vat: net,
        sum_vat: Math.round((sum - net) * 100) / 100,
        profit: Math.round((net - cost) * 100) / 100,
        rounding_residual: 0,
        warnings: net < cost ? ["Счёт убыточен: полная закупка превышает выручку без НДС"] : [],
        blocking_reasons: [],
      },
    };
  },

  async saveRequestPricing(
    requestId: number,
    patch: Partial<RequestPricing>
  ): Promise<ApiResponse<RequestPricingResult>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");
    req.pricing = {
      pricing_mode: "discount", target_percent: 0, vat_enabled: false, vat_included: false, vat_rate: 0,
      ...req.pricing, ...patch,
    };
    return this.getRequestPricing(requestId);
  },

  async selectVariant(
    requestId: number,
    positionId: number,
    materialId: number,
    confirmAnalog = false
  ): Promise<ApiResponse<ClientRequest["positions"][0]>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");
    const position = req.positions.find((p) => p.position_id === positionId);
    if (!position) throw new Error("Позиция не найдена");
    const ordered = [...(position.variants ?? []), ...(position.analogs ?? [])];
    const index = ordered.findIndex((v) => v.material_id === materialId);
    if (index < 0) throw new Error("Этот вариант отсутствует в подборе позиции");
    const variant = ordered[index];
    if (variant.class === "analog" && !confirmAnalog) throw new Error("Аналог требует отдельного подтверждения замены");
    const offer = variant.offers[0];
    Object.assign(position, {
      matched_material_id: variant.material_id,
      matched_material_name: variant.canonical_name,
      matched_material_unit: variant.unit,
      confidence: variant.score,
      selected_supplier_id: offer?.supplier_id ?? null,
      selected_price: offer?.price ?? null,
      status: "needs_review",
      confirmation_hash: null,
      variant_selected_at: new Date().toISOString(),
      variant_selected_by: "local-operator",
      variant_selected_rank: index + 1,
      variant_selected_class: variant.class,
    });
    return { data: position };
  },

  async updateRequestPosition(
    requestId: number,
    positionId: number,
    patch: Partial<ClientRequest["positions"][0]>
  ): Promise<ApiResponse<ClientRequest["positions"][0]>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");
    const pos = req.positions.find((p) => p.position_id === positionId);
    if (!pos) throw new Error("Позиция не найдена");

    Object.assign(pos, patch);
    return { data: pos };
  },

  async createRequest(payload: {
    client_name: string;
    doc_number: string;
    raw_text?: string;
    files?: { name: string; size: number }[];
  }): Promise<ApiResponse<ClientRequest>> {
    const requestId = ++nextRequestId;
    const positions: ClientRequest["positions"] = [];

    if (payload.raw_text) {
      const lines = payload.raw_text
        .split("\n")
        .map((l) => l.trim().replace(/^\d+[.)]\s*/, ""))
        .filter((l) => l.length > 0);

      lines.forEach((line, idx) => {
        // Улучшенный парсинг количества и единицы измерения в конце строки
        const qtyMatch =
          line.match(/(?:[-–:]\s*|\s+)(\d+(?:[.,]\d+)?)\s*(шт|лист(?:а|ов)?|меш(?:ок|ка|ков)?|рул(?:он|она|онов)?|м(?:етр|етров|²)?|упак(?:овка|овки|овок)?|кг|компл)?\s*$/i) ||
          line.match(/(\d+(?:[.,]\d+)?)\s*(шт|лист|меш|рул|м|упак|кг)/i);

        const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(",", ".")) : 1;
        let unit = "шт.";
        if (qtyMatch && qtyMatch[2]) {
          const rawUnit = qtyMatch[2].toLowerCase();
          if (rawUnit.startsWith("лист")) unit = "лист";
          else if (rawUnit.startsWith("меш")) unit = "меш.";
          else if (rawUnit.startsWith("рул")) unit = "рул.";
          else if (rawUnit.startsWith("упак")) unit = "упак.";
          else if (rawUnit.startsWith("компл")) unit = "компл.";
          else unit = rawUnit;
        }

        positions.push({
          position_id: idx + 1,
          raw_text: line,
          parsed_qty: qty,
          parsed_unit: unit,
          matched_material_id: null,
          matched_material_name: null,
          confidence: 0,
          status: "needs_review",
          reasoning: "Ожидает запуска AI-сопоставления",
          selected_supplier_id: null,
          selected_price: null,
          alternatives: [],
          flags: [],
        });
      });
    }

    const newRequest: ClientRequest = {
      request_id: requestId,
      client_name: payload.client_name,
      doc_number: payload.doc_number,
      status: positions.length > 0 ? "review" : "draft",
      positions,
      files: (payload.files || []).map((f, i) => ({
        file_id: i + 1,
        file_name: f.name,
        file_size: f.size,
        uploaded_at: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      })),
      created_at: new Date().toLocaleString("ru-RU"),
      updated_at: new Date().toLocaleString("ru-RU"),
    };

    state.requests.unshift(newRequest);

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "REQUESTS",
      message: `Создан новый запрос #${newRequest.doc_number} для контрагента «${newRequest.client_name}» (${newRequest.positions.length} поз.)`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return { data: newRequest };
  },

  async deleteRequest(requestId: number): Promise<ApiResponse<{ request_id: number; deleted: true }>> {
    const request = state.requests.find((r) => r.request_id === requestId);
    if (!request) throw new Error("Запрос не найден");
    if (state.invoices.some((invoice) => invoice.request_id === requestId)) {
      throw new Error("Нельзя удалить запрос, связанный со счётом");
    }
    state.requests = state.requests.filter((r) => r.request_id !== requestId);
    return { data: { request_id: requestId, deleted: true } };
  },

  async runMatching(requestId: number): Promise<ApiResponse<ClientRequest>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");

    req.status = "matching";

    // Сопоставляем позиции с каталогом
    req.positions.forEach((pos) => {
      const text = pos.raw_text.toLowerCase();
      let matched = state.materials.find((m) =>
        m.canonical_name.toLowerCase().split(" ").some((w) => w.length > 3 && text.includes(w))
      );

      if (!matched && text.includes("осп") || text.includes("osb")) {
        matched = state.materials.find((m) => m.canonical_name.includes("OSB"));
      } else if (!matched && text.includes("ротбанд")) {
        matched = state.materials.find((m) => m.canonical_name.includes("Ротбанд"));
      } else if (!matched && (text.includes("ввг") || text.includes("кабель"))) {
        matched = state.materials.find((m) => m.canonical_name.includes("ВВГнг"));
      } else if (!matched && text.includes("сетка")) {
        matched = state.materials.find((m) => m.canonical_name.includes("Сетка"));
      } else if (!matched && text.includes("роклайт")) {
        matched = state.materials.find((m) => m.canonical_name.includes("Роклайт"));
      }

      if (matched) {
        pos.matched_material_id = matched.material_id;
        pos.matched_material_name = matched.canonical_name;
        pos.confidence = Math.floor(88 + Math.random() * 11);
        pos.status = pos.confidence >= 95 ? "confirmed" : "needs_review";
        pos.reasoning = `Сопоставлено с «${matched.canonical_name}» по ключевым характеристикам и марке`;
        pos.flags = [...matched.flags];

        pos.alternatives = matched.offers
          .filter((o) => o.price !== null && o.price > 0)
          .map((o) => ({
            material_id: matched!.material_id,
            name: `${matched!.canonical_name} (${o.supplier_name})`,
            score: pos.confidence,
            supplier_name: o.supplier_name,
            price: o.price!,
          }));

        // Выбираем лучшую цену закупки по умолчанию (§7.6 ТЗ)
        if (pos.alternatives.length > 0) {
          const sorted = [...pos.alternatives].sort((a, b) => a.price - b.price);
          pos.selected_price = sorted[0].price;
          const bestOffer = matched.offers.find((o) => o.price === sorted[0].price);
          pos.selected_supplier_id = bestOffer ? bestOffer.supplier_id : null;
        }
      } else {
        pos.matched_material_id = null;
        pos.matched_material_name = null;
        pos.confidence = 0;
        pos.status = "not_found";
        pos.reasoning = "Материал не найден в каталоге, требуется ручной поиск оператора";
        pos.alternatives = [];
        pos.selected_price = null;
        pos.selected_supplier_id = null;
      }
    });

    req.status = "review";
    req.updated_at = new Date().toLocaleString("ru-RU");

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "AI_MATCHING",
      message: `AI-сопоставление для запроса ${req.doc_number} завершено: ${req.positions.filter((p) => p.matched_material_id).length} из ${req.positions.length} сопоставлены`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return { data: req };
  },

  async splitPosition(
    requestId: number,
    positionId: number,
    part1: { text: string; qty: number; unit: string },
    part2: { text: string; qty: number; unit: string }
  ): Promise<ApiResponse<ClientRequest>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");

    const idx = req.positions.findIndex((p) => p.position_id === positionId);
    if (idx === -1) throw new Error("Позиция не найдена");

    const newPos1: ClientRequest["positions"][0] = {
      position_id: Date.now(),
      raw_text: part1.text,
      parsed_qty: part1.qty,
      parsed_unit: part1.unit,
      matched_material_id: null,
      matched_material_name: null,
      confidence: 0,
      status: "needs_review",
      reasoning: "Получена разделением позиции",
      selected_supplier_id: null,
      selected_price: null,
      alternatives: [],
      flags: [],
    };

    const newPos2: ClientRequest["positions"][0] = {
      position_id: Date.now() + 1,
      raw_text: part2.text,
      parsed_qty: part2.qty,
      parsed_unit: part2.unit,
      matched_material_id: null,
      matched_material_name: null,
      confidence: 0,
      status: "needs_review",
      reasoning: "Получена разделением позиции",
      selected_supplier_id: null,
      selected_price: null,
      alternatives: [],
      flags: [],
    };

    req.positions.splice(idx, 1, newPos1, newPos2);
    req.updated_at = new Date().toLocaleString("ru-RU");

    return { data: req };
  },

  async addPosition(
    requestId: number,
    rawText: string,
    qty: number,
    unit: string
  ): Promise<ApiResponse<ClientRequest>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");

    const newPos: ClientRequest["positions"][0] = {
      position_id: Date.now(),
      raw_text: rawText.trim(),
      parsed_qty: qty,
      parsed_unit: unit.trim(),
      matched_material_id: null,
      matched_material_name: null,
      confidence: 0,
      status: "needs_review",
      reasoning: "Добавлена вручную оператором",
      selected_supplier_id: null,
      selected_price: null,
      alternatives: [],
      flags: [],
    };

    req.positions.push(newPos);
    req.updated_at = new Date().toLocaleString("ru-RU");
    return { data: req };
  },

  async deletePosition(requestId: number, positionId: number): Promise<ApiResponse<ClientRequest>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");

    req.positions = req.positions.filter((p) => p.position_id !== positionId);
    req.updated_at = new Date().toLocaleString("ru-RU");
    return { data: req };
  },

  async applyMassAction(
    requestId: number,
    action: "confirm_above_90" | "select_min_purchase" | "reject_not_found"
  ): Promise<ApiResponse<ClientRequest>> {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");

    if (action === "confirm_above_90") {
      req.positions.forEach((p) => {
        if (p.confidence >= 90 && p.status !== "rejected") {
          p.status = "confirmed";
        }
      });
    } else if (action === "select_min_purchase") {
      req.positions.forEach((p) => {
        if (p.alternatives && p.alternatives.length > 0) {
          const sorted = [...p.alternatives].sort((a, b) => a.price - b.price);
          p.selected_price = sorted[0].price;
        }
      });
    } else if (action === "reject_not_found") {
      req.positions.forEach((p) => {
        if (p.status === "not_found") {
          p.status = "rejected";
        }
      });
    }

    req.updated_at = new Date().toLocaleString("ru-RU");
    return { data: req };
  },

  async previewInvoice(
    requestId: number,
    vatRate: string = "20%"
  ): Promise<
    ApiResponse<{
      invoice_preview: Invoice;
      blocking_reasons: string[];
      warnings: string[];
      existing_invoice?: Invoice;
    }>
  > {
    const req = state.requests.find((r) => r.request_id === requestId);
    if (!req) throw new Error("Запрос не найден");

    const blocking_reasons: string[] = [];
    const warnings: string[] = [];

    // Защита от дублей (§7.7, §15.4 ТЗ)
    const existing = state.invoices.find(
      (inv) => inv.request_id === requestId && (inv.status === "created" || inv.status === "paid")
    );
    if (existing) {
      blocking_reasons.push(
        `Счёт по этому запросу уже создан в «МойСклад»: ${existing.number} от ${existing.doc_date} (§7.7 ТЗ)`
      );
    }

    const unconfirmed = req.positions.filter((p) => p.status !== "confirmed");
    if (unconfirmed.length > 0) {
      blocking_reasons.push(
        `Не все позиции подтверждены: ${unconfirmed.length} из ${req.positions.length} требуют подтверждения`
      );
    }

    if (req.positions.length === 0) {
      blocking_reasons.push("В запросе отсутствуют позиции для выставления счёта");
    }

    const positions: InvoicePosition[] = [];
    let sumTotal = 0;
    let sumPurchase = 0;

    req.positions.forEach((p, idx) => {
      if (p.selected_price === null || p.selected_price <= 0) {
        blocking_reasons.push(`У позиции №${idx + 1} (${p.raw_text}) не указана розничная цена продажи`);
      }

      const retailPrice = p.selected_price || 0;
      const qty = p.parsed_qty || 1;
      const rowSum = Math.round(retailPrice * qty * 100) / 100;
      sumTotal += rowSum;

      // Поставщик и себестоимость
      const supplierObj = state.suppliers.find((s) => s.supplier_id === p.selected_supplier_id);
      const supplierName = supplierObj ? supplierObj.name : "Петрович";

      let purchasePrice = retailPrice * 0.8;
      if (p.matched_material_id) {
        const mat = state.materials.find((m) => m.material_id === p.matched_material_id);
        if (mat) {
          const purchOffer = mat.offers.find(
            (o) => o.supplier_id === p.selected_supplier_id && o.price_type === "purchase" && o.price
          );
          if (purchOffer && purchOffer.price) {
            purchasePrice = purchOffer.price;
          } else if (mat.best_purchase?.price) {
            purchasePrice = mat.best_purchase.price;
          }
        }
      }

      const rowPurchase = Math.round(purchasePrice * qty * 100) / 100;
      sumPurchase += rowPurchase;

      const rowMarginSum = Math.round((rowSum - rowPurchase) * 100) / 100;
      const rowMarginPct = rowSum > 0 ? Math.round((rowMarginSum / rowSum) * 1000) / 10 : 0;

      if (retailPrice < purchasePrice) {
        warnings.push(
          `Позиция №${idx + 1} «${p.matched_material_name || p.raw_text}»: розничная цена (${retailPrice} ₽) ниже закупочной (${purchasePrice} ₽) — отрицательная маржа!`
        );
      }

      positions.push({
        position_id: p.position_id,
        material_id: p.matched_material_id,
        code: p.matched_material_id ? `МАТ-${p.matched_material_id}` : `ПОЗ-${p.position_id}`,
        name: p.matched_material_name || p.raw_text,
        qty: qty,
        unit: p.parsed_unit,
        price_retail: retailPrice,
        discount_percent: 0,
        price_final: retailPrice,
        sum_total: rowSum,
        vat_rate: vatRate,
        supplier: supplierName,
        price_purchase: Math.round(purchasePrice * 100) / 100,
        margin_sum: rowMarginSum,
        margin_percent: rowMarginPct,
      });
    });

    sumTotal = Math.round(sumTotal * 100) / 100;
    sumPurchase = Math.round(sumPurchase * 100) / 100;
    const isVat20 = vatRate === "20%";
    const sumWithoutVat = isVat20 ? Math.round((sumTotal / 1.2) * 100) / 100 : sumTotal;
    const sumVat = isVat20 ? Math.round((sumTotal - sumWithoutVat) * 100) / 100 : 0;

    const preview: Invoice = {
      invoice_id: 0,
      request_id: req.request_id,
      number: `СЧ-${String(state.invoices.length + 501).padStart(6, "0")}`,
      doc_date: new Date().toISOString().split("T")[0],
      client_name: req.client_name,
      organization: "ООО «Снабдика»",
      warehouse: "Основной склад СПБ",
      sum_total: sumTotal,
      sum_without_vat: sumWithoutVat,
      sum_vat: sumVat,
      sum_purchase: sumPurchase,
      vat_rate: vatRate,
      status: "draft",
      moysklad_href: null,
      error_text: null,
      positions_count: positions.length,
      positions,
      created_at: new Date().toLocaleString("ru-RU"),
    };

    return {
      data: {
        invoice_preview: preview,
        blocking_reasons,
        warnings,
        existing_invoice: existing,
      },
    };
  },

  async createInvoice(payload: CreateInvoicePayload | number): Promise<ApiResponse<Invoice>> {
    const normPayload: CreateInvoicePayload =
      typeof payload === "number"
        ? {
            request_id: payload,
            client_name: "Клиент по запросу",
            organization: "ООО «Снабдика»",
            warehouse: "Основной склад СПБ",
            doc_date: new Date().toISOString().split("T")[0],
            vat_rate: "20%",
          }
        : payload;

    const req = state.requests.find((r) => r.request_id === normPayload.request_id);
    if (!req) throw new Error("Запрос не найден");

    // Защита от дублей (§7.7, §15.4 ТЗ)
    const existing = state.invoices.find(
      (inv) => inv.request_id === normPayload.request_id && (inv.status === "created" || inv.status === "paid")
    );
    if (existing) {
      throw new Error(
        `Счёт по этому запросу уже создан в «МойСклад»: ${existing.number} (§7.7 ТЗ). Создание дубля заблокировано.`
      );
    }

    if (!normPayload.client_name?.trim()) throw new Error("Контрагент обязателен для создания счёта (§7.7 ТЗ)");
    if (!normPayload.organization?.trim()) throw new Error("Организация обязательна для создания счёта");
    if (!normPayload.warehouse?.trim()) throw new Error("Склад обязателен для создания счёта");

    const unconfirmed = req.positions.filter((p) => p.status !== "confirmed");
    if (unconfirmed.length > 0) {
      throw new Error(`Нельзя сформировать счет: ${unconfirmed.length} позиций не подтверждено (§7.8 ТЗ)`);
    }

    const previewRes = await this.previewInvoice(normPayload.request_id, normPayload.vat_rate);
    const preview = previewRes.data.invoice_preview;

    if (normPayload.simulate_error) {
      const errorInvoice: Invoice = {
        invoice_id: ++nextInvoiceId,
        request_id: normPayload.request_id,
        number: preview.number,
        doc_date: normPayload.doc_date || preview.doc_date,
        client_name: normPayload.client_name,
        organization: normPayload.organization,
        warehouse: normPayload.warehouse,
        sum_total: preview.sum_total,
        sum_without_vat: preview.sum_without_vat,
        sum_vat: preview.sum_vat,
        sum_purchase: preview.sum_purchase,
        vat_rate: normPayload.vat_rate,
        status: "error",
        moysklad_href: null,
        error_text:
          "504 Gateway Timeout: Сервис «МойСклад» временно недоступен. Документ сохранён для повторной отправки (§8.6 ТЗ).",
        positions_count: preview.positions?.length || 0,
        positions: preview.positions,
        comment: normPayload.comment,
        created_at: new Date().toLocaleString("ru-RU"),
      };
      state.invoices.unshift(errorInvoice);
      state.logs.unshift({
        log_id: Date.now(),
        level: "ERROR",
        category: "MOYSKLAD_API",
        message: `Ошибка создания счёта ${errorInvoice.number} в «МойСклад»: 504 Gateway Timeout`,
        created_at: new Date().toLocaleString("ru-RU"),
      });
      return { data: errorInvoice };
    }

    const newInvoice: Invoice = {
      invoice_id: ++nextInvoiceId,
      request_id: normPayload.request_id,
      number: preview.number,
      doc_date: normPayload.doc_date || preview.doc_date,
      client_name: normPayload.client_name,
      organization: normPayload.organization,
      warehouse: normPayload.warehouse,
      sum_total: preview.sum_total,
      sum_without_vat: preview.sum_without_vat,
      sum_vat: preview.sum_vat,
      sum_purchase: preview.sum_purchase,
      vat_rate: normPayload.vat_rate,
      status: "created",
      moysklad_href: `https://online.moysklad.ru/app/#invoiceout/edit?id=ms-${Date.now()}`,
      error_text: null,
      positions_count: preview.positions?.length || 0,
      positions: preview.positions,
      comment: normPayload.comment,
      created_at: new Date().toLocaleString("ru-RU"),
    };

    req.status = "invoiced";
    req.updated_at = new Date().toLocaleString("ru-RU");
    state.invoices.unshift(newInvoice);

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "MOYSKLAD_API",
      message: `Счёт ${newInvoice.number} успешно создан в «МойСклад» для ${newInvoice.client_name} на сумму ${newInvoice.sum_total} ₽`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return { data: newInvoice };
  },

  async retryInvoice(invoiceId: number): Promise<ApiResponse<Invoice>> {
    const inv = state.invoices.find((i) => i.invoice_id === invoiceId);
    if (!inv) throw new Error("Счёт не найден");

    inv.status = "created";
    inv.error_text = null;
    inv.moysklad_href = `https://online.moysklad.ru/app/#invoiceout/edit?id=ms-${inv.invoice_id}`;

    const req = state.requests.find((r) => r.request_id === inv.request_id);
    if (req) {
      req.status = "invoiced";
    }

    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "MOYSKLAD_API",
      message: `Повторная отправка счёта ${inv.number} в «МойСклад» выполнена успешно. Дубль предотвращен (§8.6 ТЗ).`,
      created_at: new Date().toLocaleString("ru-RU"),
    });

    return { data: inv };
  },

  async getInvoices(params?: {
    status?: string;
    query?: string;
    client_name?: string;
  }): Promise<ApiResponse<Invoice[]>> {
    let list = [...state.invoices];
    if (params?.status && params.status !== "all") {
      list = list.filter((i) => i.status === params.status);
    }
    if (params?.query) {
      const q = params.query.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.number.toLowerCase().includes(q) ||
          i.client_name.toLowerCase().includes(q) ||
          (i.comment && i.comment.toLowerCase().includes(q))
      );
    }
    if (params?.client_name) {
      list = list.filter((i) => i.client_name === params.client_name);
    }
    return { data: list };
  },

  async getInvoiceById(invoiceId: number): Promise<ApiResponse<Invoice>> {
    const inv = state.invoices.find((i) => i.invoice_id === invoiceId);
    if (!inv) throw new Error("Счёт не найден");
    return { data: inv };
  },

  async getLogs(): Promise<ApiResponse<LogEntry[]>> {
    return { data: state.logs };
  },

  async clearLogs(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    state.logs = [];
    return { data: { success: true, message: "Журнал операций успешно очищен" } };
  },

  async getSettings(): Promise<ApiResponse<AppSettings>> {
    return { data: { ...state.settings } };
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<ApiResponse<AppSettings>> {
    // Метод НЕ принимает секреты (§11.1 п. 6, §15.6 п. 5 ТЗ)
    const sanitizedPatch: Partial<AppSettings> = {};
    const allowedKeys: (keyof AppSettings)[] = [
      "table_density",
      "rows_per_page",
      "default_supplier",
      "default_price_type",
      "supplier_selection_mode",
      "confidence_threshold_percent",
      "moysklad_api_url",
      "moysklad_organization",
      "moysklad_warehouse",
      "moysklad_vat_rate",
      "gemini_model_vision",
      "gemini_model_embeddings",
      "database_path",
      "images_path",
      "images_retention_days",
      "log_level",
    ];

    allowedKeys.forEach((key) => {
      if (key in patch && (patch as Record<string, unknown>)[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sanitizedPatch as any)[key] = (patch as any)[key];
      }
    });

    state.settings = { ...state.settings, ...sanitizedPatch };
    state.logs.unshift({
      log_id: Date.now(),
      level: "INFO",
      category: "SYSTEM",
      message: "Параметры конфигурации приложения обновлены",
      created_at: new Date().toLocaleString("ru-RU"),
    });
    return { data: { ...state.settings } };
  },

  async testMoyskladConnection(): Promise<ApiResponse<{ connected: boolean; message: string }>> {
    return {
      data: {
        connected: true,
        message: "Соединение с API «МойСклад» (1.2) успешно проверено. Сервис доступен.",
      },
    };
  },

  async testGeminiConnection(): Promise<ApiResponse<{ available: boolean; message: string }>> {
    return {
      data: {
        available: true,
        message: "Соединение с Google Gemini API успешно проверено. Модели активны.",
      },
    };
  },

  async clearLocalImages(): Promise<ApiResponse<{ deleted_count: number; freed_mb: number }>> {
    return {
      data: {
        deleted_count: 12,
        freed_mb: 28.4,
      },
    };
  },
};
