import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DemoInvoicePreviewModal } from "../components/invoices/DemoInvoicePreviewModal";
import { apiClient } from "../api/client";
import type { ClientRequest, Invoice } from "../types/models";

const request: ClientRequest = {
  request_id: 7, client_name: "TEST Snabdika", doc_number: "ЗК-7", status: "confirmed",
  pricing: { pricing_mode: "discount", target_percent: 10, vat_enabled: true, vat_included: true, vat_rate: 20 },
  files: [], created_at: "", updated_at: "",
  positions: [{ position_id: 1, raw_text: "Ротбанд", parsed_qty: 2, parsed_unit: "шт",
    matched_material_id: 1, matched_material_name: "Ротбанд", confidence: 100, status: "confirmed",
    reasoning: null, selected_supplier_id: 1, selected_price: 700, alternatives: [], flags: [] }],
};

const invoice: Invoice = {
  invoice_id: 0, request_id: 7, number: "", doc_date: "2026-10-24", client_name: "TEST Snabdika",
  sum_total: 1980, sum_without_vat: 1650, sum_vat: 330, sum_purchase: 1556.08, status: "draft",
  moysklad_href: null, error_text: null, positions_count: 1, created_at: "",
  positions: [{ position_id: 1, material_id: 1, code: "1", name: "Ротбанд", qty: 2, unit: "шт",
    price_retail: 1050, discount_percent: 0, price_final: 945, sum_total: 1890, vat_rate: "20%",
    supplier: "1", price_purchase: 778.04, margin_sum: 366.96, margin_percent: 22.24 }],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Демонстрационное окно счёта", () => {
  it("показывает настройки из шапки заявки и не даёт менять НДС", async () => {
    vi.spyOn(apiClient, "previewInvoice").mockResolvedValue({
      data: { invoice_preview: invoice, blocking_reasons: [], warnings: [] },
    });
    render(<DemoInvoicePreviewModal open onOpenChange={() => {}} request={request} onInvoiceCreated={() => {}} />);
    await screen.findByText("Ротбанд");
    const blocks = document.querySelectorAll(".readonly-value");
    const pricingBlock = Array.from(blocks).find((node) => node.textContent?.includes("Скидка"));
    expect(pricingBlock?.textContent).toContain("Скидка 10%");
    expect(pricingBlock?.textContent).toContain("НДС 20%");
    expect(screen.queryByRole("button", { name: "Без НДС" })).not.toBeInTheDocument();
  });
});
