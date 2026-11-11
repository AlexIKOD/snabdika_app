import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequestsPage } from "../pages/RequestsPage";
import { apiClient } from "../api/client";
import type { ClientRequest, RequestPosition } from "../types/models";
import { TooltipProvider } from "../components/common/Tooltip";

function position(overrides: Partial<RequestPosition>): RequestPosition {
  return {
    position_id: 1, raw_text: "Ротбанд 30 кг", parsed_qty: 20, parsed_unit: "мешок",
    matched_material_id: 29832, matched_material_name: "Ротбанд Кнауф 30 кг",
    confidence: 96, status: "confirmed", reasoning: null,
    selected_supplier_id: null, selected_price: null, alternatives: [], flags: [],
    retail_price: 450, purchase_price: 380,
    ...overrides,
  };
}

const catalogDraft: ClientRequest = {
  request_id: 1, source: "catalog_invoice", client_name: "", doc_number: "Из каталога",
  status: "draft", files: [], created_at: "2026-10-21", updated_at: "2026-10-21",
  positions: [position({ position_id: 1 }), position({ position_id: 2, status: "needs_review", retail_price: null })],
};

const clientRequest: ClientRequest = {
  request_id: 2, client_name: "ООО «Строй-Трест»", doc_number: "ЗК-2026-1021/431",
  status: "review", files: [], created_at: "2026-10-21", updated_at: "2026-10-21",
  positions: [position({ position_id: 3 })],
};

const invoiced: ClientRequest = {
  request_id: 3, client_name: "ИП Иванов", doc_number: "ЗК-2026-1020/112",
  status: "invoiced", files: [], created_at: "2026-10-20", updated_at: "2026-10-20",
  positions: [position({ position_id: 4, invoiced_operation_id: "op-1" })],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderList(data: ClientRequest[]) {
  vi.spyOn(apiClient, "getRequests").mockResolvedValue({ data });
  return render(
    <TooltipProvider>
    <MemoryRouter>
      <RequestsPage />
    </MemoryRouter>
    </TooltipProvider>
  );
}

describe("Список «Заявки»", () => {
  it("показывает источник, готовность к счёту и сумму", async () => {
    renderList([catalogDraft, clientRequest]);

    expect(await screen.findByText("Из каталога")).toBeInTheDocument();
    expect(screen.getByText("ЗК-2026-1021/431")).toBeInTheDocument();
    expect(screen.getByText("Каталог")).toBeInTheDocument();
    expect(screen.getByText("Заявка")).toBeInTheDocument();
    expect(screen.getByText("1 из 2")).toBeInTheDocument();
    expect(screen.getByText("1 из 1")).toBeInTheDocument();
    expect(
      screen.getAllByText((content) => content.replace(/[\s\u00A0\u202F]/g, "") === "9000,00₽").length
    ).toBeGreaterThan(0);
  });

  it("скрывает выставленные документы по переключателю", async () => {
    renderList([catalogDraft, clientRequest, invoiced]);
    expect(await screen.findByText("ИП Иванов")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скрыть выставленные" }));
    expect(screen.queryByText("ИП Иванов")).toBeNull();
    expect(screen.getByText("ООО «Строй-Трест»")).toBeInTheDocument();
  });

  it("объясняет три способа создания в пустом списке", async () => {
    renderList([]);
    expect(await screen.findByText("Заявок пока нет")).toBeInTheDocument();
    expect(screen.getByText(/заявку клиента/i)).toBeInTheDocument();
    expect(screen.getByText(/соберите состав из каталога/i)).toBeInTheDocument();
    expect(screen.getByText(/подберите товары ИИ-подбором/i)).toBeInTheDocument();
  });
});
