/**
 * Основные модели данных приложения Снабдика (§2.2, §3.4, §7 ТЗ)
 */

export interface SupplierOffer {
  offer_id: number;
  supplier_id: number;
  supplier_name: string;
  price_type: "retail" | "purchase";
  price: number | null;
  supplier_code: string;
  updated_at: string;
  in_stock: boolean;
  raw_name?: string;
  working_name?: string;
  print_name?: string;
  external_id?: string | null;
  uuid?: string | null;
  article?: string | null;
  ean?: string | null;
  unit?: string | null;
  source_file?: string;
  imported_at?: string;
}

export interface Material {
  material_id: number;
  canonical_name: string;
  working_name?: string;
  print_name?: string;
  unit: string;
  weight_kg: number | null;
  category: string;
  subcategory: string;
  brand: string | null;
  status: "active" | "confirmed" | "draft" | "archived" | "needs_review";
  aliases_count: number;
  offers: SupplierOffer[];
  best_purchase: {
    supplier_name: string;
    price: number;
  } | null;
  flags: string[];
  aliases?: MaterialAlias[];
}

export interface ImportReportItem {
  row_number: number;
  raw_name: string;
  print_name: string;
  supplier: string;
  action: "created" | "updated" | "skipped" | "review";
  material_id: number | null;
  reason: string;
  source_file: string;
}

export interface ImportReport {
  import_id: number;
  supplier: string;
  source_file: string;
  imported_at: string;
  created: number;
  updated: number;
  skipped: number;
  review: number;
  duplicate_file: boolean;
  warnings: string[];
  items: ImportReportItem[];
}

export interface MaterialAlias {
  alias_id: number;
  material_id: number;
  raw_name: string;
  source: string;
  confidence: number;
  created_at: string;
}

export interface Supplier {
  supplier_id: number;
  name: string;
  code: string;
  is_active: boolean;
  offers_count: number;
  last_import_at: string | null;
}

export interface RequestPositionAlternative {
  supplier_id?: number;
  material_id: number;
  name: string;
  score: number;
  supplier_name: string;
  price: number;
  price_type?: "retail" | "purchase";
}

export interface RequestPositionVariantOffer {
  supplier_id?: number;
  supplier_name: string;
  price: number;
  price_type?: "retail" | "purchase";
  article?: string | null;
  supplier_code?: string | null;
  source_file?: string | null;
}

/** Один товар-модификация: поставщики живут внутри варианта, а не рядом с ним. */
export interface RequestPositionVariant {
  material_id: number;
  canonical_name: string;
  unit: string;
  class: "exact" | "probable" | "analog";
  score: number;
  matched_fields: string[];
  conflicting_fields: string[];
  offers: RequestPositionVariantOffer[];
}

export interface RequestPricing {
  pricing_mode: "discount" | "margin";
  target_percent: number;
  vat_enabled: boolean;
  vat_included: boolean;
  vat_rate: number;
}

export interface RequestPricingResult {
  pricing: RequestPricing;
  positions: { position_id: number; sale_price: number; sum_total: number }[];
  excluded: number[];
  sum_total: number;
  sum_without_vat: number;
  sum_vat: number;
  profit: number;
  rounding_residual: number;
  warnings: string[];
  blocking_reasons: string[];
}

export interface RequestPosition {
  revision?: number;
  confirmation_hash?: string | null;
  confirmed_at?: string;
  invoiced_operation_id?: string;
  moysklad_id?: string;
  assortment_type?: string;
  unit_id?: string;
  pack_id?: string;
  pack_quantity?: number;
  purchase_price?: number | null;
  retail_price?: number | null;
  retail_source?: string;
  purchase_source?: string;
  position_id: number;
  raw_text: string;
  parsed_qty: number | null;
  parsed_unit: string;
  matched_material_id: number | null;
  matched_material_name: string | null;
  matched_material_unit?: string | null;
  quantity_confirmed?: boolean;
  unit_confirmed?: boolean;
  review_questions?: string[];
  confidence: number; // 0..100
  /** Цена к счёту, посчитанная сервером из настроек шапки; null — данных не хватает. */
  sale_price?: number | null;
  status: "matched" | "needs_review" | "conflict" | "not_found" | "rejected" | "confirmed";
  reasoning: string | null;
  selected_supplier_id: number | null;
  selected_price: number | null;
  alternatives: RequestPositionAlternative[];
  variants?: RequestPositionVariant[];
  analogs?: RequestPositionVariant[];
  variant_selected_at?: string | null;
  variant_selected_by?: string | null;
  variant_selected_rank?: number | null;
  variant_selected_class?: "exact" | "probable" | "analog" | "manual" | null;
  flags: string[]; // 'price_conflict' | 'suspected_false_merge'
}

export interface RequestFile {
  file_id: number;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

export interface ClientRequest {
  source?: "catalog_invoice";
  request_id: number;
  client_name: string;
  doc_number: string;
  status: "draft" | "uploaded" | "matching" | "review" | "confirmed" | "invoiced" | "archived";
  positions: RequestPosition[];
  pricing?: RequestPricing;
  files: RequestFile[];
  created_at: string;
  updated_at: string;
}

export interface InvoicePosition {
  position_id: number;
  material_id: number | null;
  code: string;
  name: string;
  qty: number;
  unit: string;
  price_retail: number;
  discount_percent: number;
  price_final: number;
  sum_total: number;
  vat_rate: string;
  supplier: string;
  price_purchase: number;
  margin_sum: number;
  margin_percent: number;
}

export interface Invoice {
  operation_id?: string;
  operation_state?: string;
  settings?: InvoiceSettings;
  profit?: number;
  actual_discount?: number;
  actual_margin?: number;
  markup?: number;
  rounding_residual?: number;
  invoice_id: number;
  request_id: number;
  number: string;
  doc_date: string;
  client_name: string;
  organization?: string;
  warehouse?: string;
  sum_total: number;
  sum_without_vat?: number;
  sum_vat?: number;
  sum_purchase?: number;
  vat_rate?: string;
  status: "draft" | "created" | "error" | "paid" | "shipped";
  moysklad_href: string | null;
  error_text: string | null;
  positions_count: number;
  positions?: InvoicePosition[];
  comment?: string;
  created_at: string;
}

export interface CreateInvoicePayload {
  preview_id?: string;
  request_id: number;
  client_name: string;
  organization: string;
  warehouse: string;
  doc_date: string;
  vat_rate: string;
  comment?: string;
  simulate_error?: boolean;
}

export interface DashboardStats {
  materials_count: number;
  materials_diff_7d: number;
  offers_count: number;
  suppliers_active_count: number;
  requests_in_progress: number;
  requests_need_attention: number;
  invoices_7d_count: number;
  invoices_7d_sum: number;
  materials_without_price_count: number;
  materials_without_weight_count: number;
  price_conflicts_count: number;
  suspected_merges_count: number;
}

export interface ParquetFileStatus {
  name: string;
  records: number;
  schema_version: string;
  updated_at: string;
}

export interface SystemHealth {
  status: "healthy" | "warning" | "degraded" | "offline";
  data_layer: boolean;
  catalog?: {
    materials_count: number;
    offers_count: number;
    updated_at: string;
    completeness?: { materials: number; offers: number; aliases: number };
  };
  database_version: string;
  database_path: string;
  parquet_status: ParquetFileStatus[];
  moysklad: {
    connected: boolean;
    status_text: string;
  };
  gemini: {
    available: boolean;
    status_text: string;
  };
  ai?: { provider: "gemini" | "ohmylama"; model: string; available: boolean; status_text: string };
  app_version: string;
}

export interface LogEntry {
  log_id: number;
  level: "INFO" | "WARNING" | "ERROR";
  category: string;
  message: string;
  payload_json?: string;
  created_at: string;
}

export interface AppSettings {
  ai_provider?: "gemini" | "ohmylama";
  ai_base_url?: string;
  ai_model?: string;
  table_density: "standard" | "compact";
  rows_per_page: number;
  default_supplier: string;
  default_price_type: "retail" | "purchase";
  supplier_selection_mode: "min_purchase" | "default_supplier" | "retail_priority";
  confidence_threshold_percent: number;
  moysklad_api_url: string;
  moysklad_organization: string;
  moysklad_warehouse: string;
  moysklad_vat_rate: string;
  gemini_model_vision: string;
  gemini_model_embeddings: string;
  database_path: string;
  images_path: string;
  images_retention_days: number;
  log_level: "DEBUG" | "INFO" | "WARNING" | "ERROR";
}

export interface InvoiceSettings {
  position_ids: number[];
  organization_id: string;
  agent_id: string;
  store_id: string;
  doc_date: string;
  pricing_mode: "discount" | "margin";
  target_percent: number;
  vat_enabled: boolean;
  vat_included: boolean;
  vat_rate: number;
  merge: boolean;
  comment: string;
}
export interface MoyskladEntity {
  id: string;
  name: string;
  meta: { href: string };
  uom?: { meta: { href: string }; name?: string };
  buyPrice?: { value: number };
  salePrices?: { value: number; priceType: { name: string; id: string } }[];
  attributes?: { id: string; name: string; value: string | number }[];
}
export interface InvoicePreview {
  preview_id?: string;
  composition_hash?: string;
  invoice_preview: Invoice;
  blocking_reasons: string[];
  warnings: string[];
  excluded_position_ids?: number[];
  existing_invoice?: Invoice;
}
