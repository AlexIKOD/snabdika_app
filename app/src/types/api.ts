/**
 * Контракт обмена со слоем данных (§3 ТЗ)
 */

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    page_size?: number;
    took_ms?: number;
  };
}

export interface ApiErrorPayload {
  code:
    | "DATA_LAYER_UNAVAILABLE"
    | "SCHEMA_VERSION_MISMATCH"
    | "MOYSKLAD_UNAUTHORIZED"
    | "MOYSKLAD_RATE_LIMIT"
    | "GEMINI_UNAVAILABLE"
    | "FILE_TOO_LARGE"
    | "VALIDATION_ERROR"
    | "MATERIAL_NOT_FOUND"
    | "REQUEST_NOT_FOUND"
    | "INVOICE_ERROR"
    | "INTERNAL_ERROR";
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

export interface MaterialsQueryParams {
  query?: string;
  category?: string;
  supplier_id?: number;
  has_price_conflict?: boolean;
  has_suspected_merge?: boolean;
  has_price?: boolean;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_direction?: "asc" | "desc";
}
