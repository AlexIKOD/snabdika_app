/**
 * Клиент локального HTTP API (§3.1, §3.2 ТЗ)
 * С поддержкой всех методов Этапа 2 и прозрачным макетным режимом.
 */

import { mockServer, type CategoryNode } from "../mock/mockServer";
import type { ApiResponse } from "../types/api";
import type {
  AppSettings,
  ClientRequest,
  CreateInvoicePayload,
  DashboardStats,
  Invoice,
  LogEntry,
  Material,
  MaterialAlias,
  Supplier,
  SystemHealth,
  ImportReport,
  InvoiceSettings, InvoicePreview, MoyskladEntity, RequestPricing, RequestPricingResult,
} from "../types/models";
import type { ImportRow } from "../features/import/productImport";
import { localApiFetch } from "../services/localApi";
import { isTauriEnvironment } from "../services/tauriBridge";
import { addParquetAlias, importParquetRows, patchParquetMaterial } from "../services/parquetCatalog";

const runtimeEnv = (import.meta as ImportMeta & { env?: { MODE?: string; VITE_USE_MOCK?: string } }).env;
const USE_MOCK = runtimeEnv?.MODE === "test" || runtimeEnv?.VITE_USE_MOCK === "true";
const USE_PARQUET = !USE_MOCK && isTauriEnvironment();

export const apiClient = {
  async createCatalogInvoiceDraft(materialIds: number[]): Promise<ApiResponse<ClientRequest>> {
    const res = await localApiFetch('/api/invoices/catalog-drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material_ids: materialIds }),
    });
    return res.json();
  },

  async getHealth(): Promise<ApiResponse<SystemHealth>> {
    if (USE_MOCK) return mockServer.getHealth();
    const res = await localApiFetch("/api/health", { cache: "no-store" });
    return res.json();
  },

  async getDashboard(): Promise<ApiResponse<DashboardStats>> {
    if (USE_MOCK) return mockServer.getDashboard();
    const res = await localApiFetch("/api/dashboard", { cache: "no-store" });
    return res.json();
  },

  async getCategories(): Promise<ApiResponse<CategoryNode[]>> {
    if (USE_MOCK) return mockServer.getCategories();
    const res = await localApiFetch("/api/dictionaries/categories", { cache: "no-store" });
    return res.json();
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
    page?: number;
    page_size?: number;
  }): Promise<ApiResponse<Material[]>> {
    if (USE_MOCK) return mockServer.getMaterials(params);
    const search = new URLSearchParams();
    if (params?.page) search.set("page", String(params.page));
    if (params?.page_size) search.set("page_size", String(params.page_size));
    if (params?.query) search.set("query", params.query);
    if (params?.category) search.set("category", params.category);
    if (params?.supplier_id) search.set("supplier_id", String(params.supplier_id));
    if (params?.has_price_conflict) search.set("has_price_conflict", "true");
    if (params?.has_suspected_merge) search.set("has_suspected_merge", "true");
    if (params?.has_price) search.set("has_price", params.has_price);
    if (params?.has_weight) search.set("has_weight", params.has_weight);
    if (params?.sort_by) search.set("sort_by", params.sort_by);
    if (params?.sort_dir) search.set("sort_dir", params.sort_dir);
    const res = await localApiFetch(`/api/materials?${search.toString()}`, { cache: "no-store" });
    return res.json();
  },

  async getMaterialById(id: number): Promise<ApiResponse<Material>> {
    if (USE_MOCK) return mockServer.getMaterialById(id);
    const res = await localApiFetch(`/api/materials/${id}`, { cache: "no-store" });
    return res.json();
  },

  async patchMaterial(id: number, patch: Partial<Material>): Promise<ApiResponse<Material>> {
    if (USE_MOCK) return mockServer.patchMaterial(id, patch);
    if (USE_PARQUET) return patchParquetMaterial(id, patch);
    const res = await localApiFetch(`/api/materials/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    return res.json();
  },

  async addMaterialAlias(materialId: number, rawName: string): Promise<ApiResponse<MaterialAlias>> {
    if (USE_MOCK) return mockServer.addMaterialAlias(materialId, rawName);
    if (USE_PARQUET) return addParquetAlias(materialId, rawName);
    const res = await localApiFetch(`/api/materials/${materialId}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_name: rawName }),
      cache: "no-store",
    });
    return res.json();
  },

  async mergeMaterials(sourceId: number, targetId: number): Promise<ApiResponse<{ success: boolean; message: string }>> {
    if (USE_MOCK) return mockServer.mergeMaterials(sourceId, targetId);
    const res = await localApiFetch(`/api/materials/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
      cache: "no-store",
    });
    return res.json();
  },

  async getSuppliers(): Promise<ApiResponse<Supplier[]>> {
    if (USE_MOCK) return mockServer.getSuppliers();
    const res = await localApiFetch("/api/suppliers", { cache: "no-store" });
    return res.json();
  },

  async getImportReports(): Promise<ApiResponse<ImportReport[]>> {
    if (USE_MOCK) return mockServer.getImportReports();
    const res = await localApiFetch("/api/imports", { cache: "no-store" });
    return res.json();
  },

  async importSupplierRows(payload: {
    source_file: string;
    fingerprint: string;
    supplier: string;
    imported_at: string;
    rows: ImportRow[];
    skipped_rows?: number;
    warnings?: string[];
  }): Promise<ApiResponse<ImportReport>> {
    if (USE_MOCK) return mockServer.importSupplierRows(payload);
    if (USE_PARQUET) {
      const result = await importParquetRows(payload.rows);
      return { data: { import_id: Date.now(), supplier: payload.supplier, source_file: payload.source_file, imported_at: payload.imported_at, created: result.created, updated: result.updated, skipped: result.skipped + (payload.skipped_rows || 0), review: 0, duplicate_file: false, warnings: payload.warnings || [], items: [] } };
    }
    const res = await localApiFetch("/api/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return res.json();
  },

  async getRequests(): Promise<ApiResponse<ClientRequest[]>> {
    if (USE_MOCK) return mockServer.getRequests();
    const res = await localApiFetch("/api/requests", { cache: "no-store" });
    return res.json();
  },

  async getRequestById(id: number): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.getRequestById(id);
    const res = await localApiFetch(`/api/requests/${id}`, { cache: "no-store" });
    return res.json();
  },

  async createRequest(payload: {
    client_name: string;
    doc_number: string;
    raw_text?: string;
    files?: { name: string; size: number }[];
  }): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.createRequest(payload);
    const res = await localApiFetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return res.json();
  },

  async deleteRequest(requestId: number): Promise<ApiResponse<{ request_id: number; deleted: true }>> {
    if (USE_MOCK) return mockServer.deleteRequest(requestId);
    const res = await localApiFetch(`/api/requests/${requestId}`, { method: "DELETE", cache: "no-store" });
    return res.json();
  },

  async runMatching(requestId: number): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.runMatching(requestId);
    const res = await localApiFetch(`/api/requests/${requestId}/match`, {
      method: "POST",
      cache: "no-store",
    });
    return res.json();
  },

  async splitPosition(
    requestId: number,
    positionId: number,
    part1: { text: string; qty: number; unit: string },
    part2: { text: string; qty: number; unit: string }
  ): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.splitPosition(requestId, positionId, part1, part2);
    const res = await localApiFetch(`/api/requests/${requestId}/positions/${positionId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ part1, part2 }),
      cache: "no-store",
    });
    return res.json();
  },

  async addPosition(
    requestId: number,
    rawText: string,
    qty: number,
    unit: string
  ): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.addPosition(requestId, rawText, qty, unit);
    const res = await localApiFetch(`/api/requests/${requestId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: rawText, parsed_qty: qty, parsed_unit: unit,
        quantity_confirmed: true, unit_confirmed: true }),
      cache: "no-store",
    });
    return res.json();
  },

  async deletePosition(requestId: number, positionId: number): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.deletePosition(requestId, positionId);
    const res = await localApiFetch(`/api/requests/${requestId}/positions/${positionId}`, {
      method: "DELETE",
      cache: "no-store",
    });
    return res.json();
  },

  async applyMassAction(
    requestId: number,
    action: "confirm_above_90" | "select_min_purchase" | "reject_not_found"
  ): Promise<ApiResponse<ClientRequest>> {
    if (USE_MOCK) return mockServer.applyMassAction(requestId, action);
    const res = await localApiFetch(`/api/requests/${requestId}/mass-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      cache: "no-store",
    });
    return res.json();
  },

  async updateRequestPosition(
    requestId: number,
    positionId: number,
    patch: Partial<ClientRequest["positions"][0]>
  ): Promise<ApiResponse<ClientRequest["positions"][0]>> {
    if (USE_MOCK) return mockServer.updateRequestPosition(requestId, positionId, patch);
    const res = await localApiFetch(`/api/requests/${requestId}/positions/${positionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    return res.json();
  },

  async getRequestPricing(requestId: number): Promise<ApiResponse<RequestPricingResult>> {
    if (USE_MOCK) return mockServer.getRequestPricing(requestId);
    const res = await localApiFetch(`/api/requests/${requestId}/pricing`, { cache: "no-store" });
    return res.json();
  },

  async saveRequestPricing(requestId: number, patch: Partial<RequestPricing>): Promise<ApiResponse<RequestPricingResult>> {
    if (USE_MOCK) return mockServer.saveRequestPricing(requestId, patch);
    const res = await localApiFetch(`/api/requests/${requestId}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    return res.json();
  },

  async selectVariant(
    requestId: number,
    positionId: number,
    materialId: number,
    confirmAnalog = false
  ): Promise<ApiResponse<ClientRequest["positions"][0]>> {
    if (USE_MOCK) return mockServer.selectVariant(requestId, positionId, materialId, confirmAnalog);
    const res = await localApiFetch(`/api/requests/${requestId}/positions/${positionId}/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: materialId, confirm_analog: confirmAnalog }),
      cache: "no-store",
    });
    return res.json();
  },

  async getMoyskladDictionary(kind: string, query = ""): Promise<ApiResponse<MoyskladEntity[]>> {
    const res = await localApiFetch(`/api/moysklad/dictionaries/${kind}?query=${encodeURIComponent(query)}`);
    return res.json();
  },
  async getMoyskladProduct(id: string): Promise<ApiResponse<MoyskladEntity>> {
    return (await localApiFetch(`/api/moysklad/products/${encodeURIComponent(id)}`)).json();
  },
  async getMoyskladMetadata(kind: string): Promise<ApiResponse<Record<string, unknown>>> {
    return (await localApiFetch(`/api/moysklad/metadata/${kind}`)).json();
  },
  async createMoyskladCounterparty(body: Record<string, unknown>): Promise<ApiResponse<MoyskladEntity>> {
    return (await localApiFetch('/api/moysklad/dictionaries/counterparty', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
  },
  async previewInvoice(requestId: number, options?: string | InvoiceSettings): Promise<ApiResponse<InvoicePreview>> {
    if (USE_MOCK) return mockServer.previewInvoice(requestId, typeof options === "string" ? options : undefined);
    const res = await localApiFetch(`/api/requests/${requestId}/invoice/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options),
    });
    return res.json();
  },
  async createInvoice(payload: CreateInvoicePayload | number): Promise<ApiResponse<Invoice>> {
    if (USE_MOCK) return mockServer.createInvoice(payload);
    const body = typeof payload === "number" ? { request_id: payload } : payload;
    const res = await localApiFetch(`/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return res.json();
  },

  async retryInvoice(invoiceId: number): Promise<ApiResponse<Invoice>> {
    if (USE_MOCK) return mockServer.retryInvoice(invoiceId);
    const res = await localApiFetch(`/api/invoices/${invoiceId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    return res.json();
  },

  async getInvoices(params?: {
    status?: string;
    query?: string;
    client_name?: string;
  }): Promise<ApiResponse<Invoice[]>> {
    if (USE_MOCK) return mockServer.getInvoices(params);
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.query) query.append("query", params.query);
    if (params?.client_name) query.append("client_name", params.client_name);
    const res = await localApiFetch(`/api/invoices?${query.toString()}`, { cache: "no-store" });
    return res.json();
  },

  async getInvoiceById(invoiceId: number): Promise<ApiResponse<Invoice>> {
    if (USE_MOCK) return mockServer.getInvoiceById(invoiceId);
    const res = await localApiFetch(`/api/invoices/${invoiceId}`, { cache: "no-store" });
    return res.json();
  },

  async getLogs(): Promise<ApiResponse<LogEntry[]>> {
    if (USE_MOCK) return mockServer.getLogs();
    const res = await localApiFetch("/api/logs", { cache: "no-store" });
    return res.json();
  },

  async clearLogs(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    if (USE_MOCK) return mockServer.clearLogs();
    const res = await localApiFetch("/api/logs", { method: "DELETE", cache: "no-store" });
    return res.json();
  },

  async getSettings(): Promise<ApiResponse<AppSettings>> {
    if (USE_MOCK) return mockServer.getSettings();
    const res = await localApiFetch("/api/settings", { cache: "no-store" });
    return res.json();
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<ApiResponse<AppSettings>> {
    if (USE_MOCK) return mockServer.updateSettings(patch);
    const res = await localApiFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    return res.json();
  },

  async testMoyskladConnection(): Promise<ApiResponse<{ connected: boolean; message: string }>> {
    if (USE_MOCK) return mockServer.testMoyskladConnection();
    const res = await localApiFetch("/api/integrations/moysklad/test", { cache: "no-store" });
    return res.json();
  },

  async testGeminiConnection(): Promise<ApiResponse<{ available: boolean; message: string }>> {
    if (USE_MOCK) return mockServer.testGeminiConnection();
    const res = await localApiFetch("/api/integrations/gemini/test", { cache: "no-store" });
    return res.json();
  },

  async clearLocalImages(): Promise<ApiResponse<{ deleted_count: number; freed_mb: number }>> {
    if (USE_MOCK) return mockServer.clearLocalImages();
    const res = await localApiFetch("/api/storage/images/cleanup", { method: "POST", cache: "no-store" });
    return res.json();
  },
};
