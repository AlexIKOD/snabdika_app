import type { ApiResponse } from "../types/api";
import type { ImportRow } from "../features/import/productImport";
import type { ImportReport, LogEntry, Material, MaterialAlias, Supplier } from "../types/models";
import { readParquetTable, writeParquetTable } from "./tauriBridge";

type Raw = Record<string, unknown>;

const numberValue = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const stringValue = (value: unknown): string => value === null || value === undefined ? "" : String(value);
const booleanValue = (value: unknown): boolean => value === true || value === "true" || value === 1 || value === "1";

interface Store {
  materials: Raw[];
  offers: Raw[];
  aliases: Raw[];
  logs: Raw[];
}

let storePromise: Promise<Store> | null = null;

async function loadStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Promise.all([
      readParquetTable("catalog_materials"),
      readParquetTable("supplier_offers"),
      readParquetTable("material_aliases"),
      readParquetTable("import_logs"),
    ]).then(([materials, offers, aliases, logs]) => ({ materials, offers, aliases, logs }));
  }
  return storePromise;
}

export function clearParquetCatalogCache() { storePromise = null; }

function supplierId(name: string, names: string[]): number {
  return Math.max(1, names.indexOf(name) + 1);
}

function materialFromRaw(raw: Raw, offers: Raw[], aliases: Raw[], supplierNames: string[]): Material {
  const id = numberValue(raw.material_id) || 0;
  const materialOffers = offers.filter((offer) => numberValue(offer.material_id) === id).map((offer) => ({
    offer_id: numberValue(offer.offer_id) || 0,
    supplier_id: supplierId(stringValue(offer.supplier), supplierNames),
    supplier_name: stringValue(offer.supplier),
    price_type: stringValue(offer.price_type) === "purchase" ? "purchase" as const : "retail" as const,
    price: numberValue(offer.current_price),
    supplier_code: stringValue(offer.supplier_code),
    updated_at: stringValue(offer.imported_at),
    in_stock: true,
    raw_name: stringValue(offer.raw_name),
    working_name: stringValue(offer.working_name),
    print_name: stringValue(offer.print_name),
    external_id: stringValue(offer.external_code) || null,
    uuid: stringValue(offer.uuid) || null,
    article: stringValue(offer.article) || null,
    ean: stringValue(offer.ean) || null,
    unit: stringValue(offer.unit) || null,
    source_file: stringValue(offer.source_file),
    imported_at: stringValue(offer.imported_at),
  }));
  const purchase = materialOffers.filter((offer) => offer.price_type === "purchase" && offer.price !== null && offer.price > 0);
  const best = purchase.sort((a, b) => (a.price || 0) - (b.price || 0))[0];
  const materialAliases = aliases.filter((alias) => numberValue(alias.material_id) === id).map((alias) => ({
    alias_id: numberValue(alias.alias_id) || 0,
    material_id: id,
    raw_name: stringValue(alias.raw_name),
    source: stringValue(alias.supplier),
    confidence: numberValue(alias.confidence) || 0,
    created_at: stringValue(alias.imported_at),
  } satisfies MaterialAlias));
  const needsReview = booleanValue(raw.needs_review) || stringValue(raw.status) === "needs_review";
  return {
    material_id: id,
    canonical_name: stringValue(raw.canonical_name || raw.print_name || raw.working_name),
    working_name: stringValue(raw.working_name),
    print_name: stringValue(raw.print_name),
    unit: stringValue(raw.unit),
    weight_kg: numberValue(raw.weight_kg),
    category: stringValue(raw.category),
    subcategory: stringValue(raw.subcategory),
    brand: stringValue(raw.brand) || null,
    status: needsReview ? "needs_review" : (stringValue(raw.status) as Material["status"] || "active"),
    aliases_count: materialAliases.length,
    offers: materialOffers,
    best_purchase: best ? { supplier_name: best.supplier_name, price: best.price || 0 } : null,
    flags: needsReview ? ["needs_review"] : [],
    aliases: materialAliases,
  };
}

export async function getParquetMaterials(params?: {
  query?: string; category?: string; supplier_id?: number; has_price?: "all" | "with_price" | "no_price";
  has_weight?: "all" | "with_weight" | "no_weight"; sort_by?: "id" | "name" | "weight" | "price"; sort_dir?: "asc" | "desc";
}): Promise<ApiResponse<Material[]>> {
  const data = await loadStore();
  const supplierNames = [...new Set(data.offers.map((offer) => stringValue(offer.supplier)).filter(Boolean))];
  let materials = data.materials.map((raw) => materialFromRaw(raw, data.offers, data.aliases, supplierNames));
  const query = params?.query?.trim().toLocaleLowerCase("ru-RU");
  if (query) materials = materials.filter((item) => [item.canonical_name, item.category, item.subcategory, item.brand || "", ...item.offers.map((offer) => offer.supplier_code)].some((value) => value.toLocaleLowerCase("ru-RU").includes(query)));
  const category = params?.category;
  if (category) materials = materials.filter((item) => item.category === category || item.subcategory.includes(category));
  if (params?.supplier_id) materials = materials.filter((item) => item.offers.some((offer) => offer.supplier_id === params.supplier_id));
  if (params?.has_price === "with_price") materials = materials.filter((item) => item.offers.some((offer) => (offer.price || 0) > 0));
  if (params?.has_price === "no_price") materials = materials.filter((item) => item.offers.every((offer) => (offer.price || 0) <= 0));
  if (params?.has_weight === "with_weight") materials = materials.filter((item) => (item.weight_kg || 0) > 0);
  if (params?.has_weight === "no_weight") materials = materials.filter((item) => (item.weight_kg || 0) <= 0);
  const direction = params?.sort_dir === "desc" ? -1 : 1;
  materials.sort((a, b) => {
    if (params?.sort_by === "id") return (a.material_id - b.material_id) * direction;
    if (params?.sort_by === "weight") return ((a.weight_kg || 0) - (b.weight_kg || 0)) * direction;
    if (params?.sort_by === "price") return ((a.best_purchase?.price || 0) - (b.best_purchase?.price || 0)) * direction;
    return a.canonical_name.localeCompare(b.canonical_name, "ru") * direction;
  });
  return { data: materials, meta: { total: materials.length, page: 1, page_size: materials.length, took_ms: 0 } };
}

export async function getParquetMaterial(id: number): Promise<ApiResponse<Material>> {
  const result = await getParquetMaterials({});
  const material = result.data.find((item) => item.material_id === id);
  if (!material) throw new Error(`Материал с ID ${id} не найден`);
  return { data: material };
}

export async function getParquetCategories() {
  const data = await loadStore();
  const groups = new Map<string, { name: string; count: number; subcategories: { name: string; count: number }[] }>();
  for (const row of data.materials) {
    const category = stringValue(row.category) || "Прочие материалы";
    const subcategory = stringValue(row.subcategory) || "Требует классификации";
    const item = groups.get(category) || { name: category, count: 0, subcategories: [] };
    item.count += 1;
    const sub = item.subcategories.find((entry) => entry.name === subcategory);
    if (sub) sub.count += 1; else item.subcategories.push({ name: subcategory, count: 1 });
    groups.set(category, item);
  }
  return { data: [{ name: "Все категории", count: data.materials.length, subcategories: [] }, ...groups.values()] };
}

export async function getParquetSuppliers(): Promise<ApiResponse<Supplier[]>> {
  const data = await loadStore();
  const suppliers = [...new Set(data.offers.map((offer) => stringValue(offer.supplier)).filter(Boolean))];
  return { data: suppliers.map((name, index) => ({ supplier_id: index + 1, name, code: name, is_active: true, offers_count: data.offers.filter((offer) => offer.supplier === name).length, last_import_at: null })) };
}

export async function getParquetImportReports(): Promise<ApiResponse<ImportReport[]>> {
  const data = await loadStore();
  return { data: data.logs.map((log) => ({
    import_id: numberValue(log.import_id) || 0,
    supplier: stringValue(log.supplier),
    source_file: stringValue(log.source_file),
    imported_at: stringValue(log.imported_at),
    created: numberValue(log.created) || 0,
    updated: numberValue(log.updated) || 0,
    skipped: numberValue(log.rows_skipped) || 0,
    review: numberValue(log.needs_review) || 0,
    duplicate_file: false,
    warnings: [],
    items: [],
  })) };
}

export async function getParquetLogs(): Promise<ApiResponse<LogEntry[]>> {
  const data = await loadStore();
  return { data: data.logs.map((log) => ({
    log_id: numberValue(log.import_id) || 0,
    level: "INFO",
    category: "IMPORT",
    message: `Импорт ${stringValue(log.source_file)}: создано ${stringValue(log.created)}, обновлено ${stringValue(log.updated)}`,
    created_at: stringValue(log.imported_at),
  })) };
}

export async function addParquetAlias(materialId: number, rawName: string): Promise<ApiResponse<MaterialAlias>> {
  const data = await loadStore();
  const alias: Raw = { alias_id: Math.max(0, ...data.aliases.map((item) => numberValue(item.alias_id) || 0)) + 1, material_id: materialId, supplier: "Ручной ввод оператора", raw_name: rawName.trim(), working_name: rawName.trim(), source_file: "manual", imported_at: new Date().toISOString(), confidence: 100, match_method: "manual" };
  data.aliases.push(alias);
  await writeParquetTable("material_aliases", data.aliases);
  clearParquetCatalogCache();
  return { data: { alias_id: alias.alias_id as number, material_id: materialId, raw_name: rawName.trim(), source: "Ручной ввод оператора", confidence: 100, created_at: String(alias.imported_at) } };
}

export async function patchParquetMaterial(id: number, patch: Partial<Material>): Promise<ApiResponse<Material>> {
  const data = await loadStore();
  const raw = data.materials.find((item) => numberValue(item.material_id) === id);
  if (!raw) throw new Error(`Материал с ID ${id} не найден`);
  for (const key of ["canonical_name", "working_name", "print_name", "category", "subcategory", "unit", "brand", "weight_kg"]) {
    if (key in patch) raw[key] = (patch as Raw)[key];
  }
  await writeParquetTable("catalog_materials", data.materials);
  clearParquetCatalogCache();
  return getParquetMaterial(id);
}

export async function importParquetRows(rows: ImportRow[]): Promise<{ created: number; updated: number; skipped: number }> {
  const data = await loadStore();
  let created = 0; let updated = 0;
  const byCode = new Map(data.offers.map((offer) => [stringValue(offer.supplier_code), offer]));
  let nextMaterial = Math.max(0, ...data.materials.map((row) => numberValue(row.material_id) || 0)) + 1;
  for (const row of rows) {
    const code = Object.values(row.identifiers).find(Boolean) || row.match_key;
    const existingOffer = byCode.get(code);
    let materialId: number;
    if (existingOffer) { materialId = numberValue(existingOffer.material_id) || 0; updated += 1; }
    else {
      materialId = nextMaterial++;
      data.materials.push({ material_id: materialId, working_name: row.working_name, print_name: row.print_name, canonical_name: row.print_name, unit: row.unit, weight_kg: null, category: row.category, subcategory: row.subcategory, brand: row.brand, status: "active", needs_review: false, working_key: row.match_key, created_from: row.source_file });
      created += 1;
    }
    const offer = existingOffer || { offer_id: Math.max(0, ...data.offers.map((item) => numberValue(item.offer_id) || 0)) + data.offers.length + 1 };
    Object.assign(offer, { material_id: materialId, supplier: row.supplier, supplier_key: row.supplier, supplier_code: code, price_type: row.price_type || "retail", current_price: row.price, primary_key: code, raw_name: row.raw_name, working_name: row.working_name, print_name: row.print_name, unit: row.unit, category: row.category, source_file: row.source_file, imported_at: row.imported_at, needs_review: false });
    if (!existingOffer) data.offers.push(offer);
  }
  await writeParquetTable("catalog_materials", data.materials);
  await writeParquetTable("supplier_offers", data.offers);
  clearParquetCatalogCache();
  return { created, updated, skipped: 0 };
}
