import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequestDetailPage } from "../pages/RequestDetailPage";
import { apiClient } from "../api/client";
import { TooltipProvider } from "../components/common/Tooltip";
import type { ClientRequest, RequestPosition, RequestPricingResult } from "../types/models";

const pricing = { pricing_mode: "discount" as const, target_percent: 0, vat_enabled: false,
  vat_included: false, vat_rate: 0 };

const position: RequestPosition = {
  position_id: 1,
  raw_text: "Ротбанд 30 кг",
  parsed_qty: 1,
  parsed_unit: "шт",
  matched_material_id: 29832,
  matched_material_name: "Ротбанд Кнауф 30 кг",
  matched_material_unit: "шт",
  quantity_confirmed: true,
  unit_confirmed: true,
  confidence: 96,
  status: "needs_review",
  reasoning: null,
  selected_supplier_id: 1,
  selected_price: 700,
  retail_price: 1000,
  purchase_price: 700,
  retail_source: "Согласовано с клиентом",
  purchase_source: "Прайс: СтройБаза",
  alternatives: [{ material_id: 29832, name: "Ротбанд", score: 96, supplier_name: "СтройБаза", supplier_id: 1, price: 700 }],
  flags: [],
  variants: [
    { material_id: 29832, canonical_name: "Ротбанд Кнауф 30 кг", unit: "шт", class: "exact", score: 96,
      matched_fields: ["ротбанд", "30"], conflicting_fields: [],
      offers: [{ supplier_id: 1, supplier_name: "СтройБаза", price: 700 }] },
  ],
  analogs: [
    { material_id: 37599, canonical_name: "Ротбанд 10 кг", unit: "шт", class: "analog", score: 60,
      matched_fields: ["ротбанд"], conflicting_fields: ["10"],
      offers: [{ supplier_id: 2, supplier_name: "Петрович", price: 300 }] },
  ],
};

const request: ClientRequest = {
  request_id: 901, client_name: "ООО «Строй-Трест»", doc_number: "ЗК-901", status: "review",
  positions: [position], pricing, files: [], created_at: "2026-10-21", updated_at: "2026-10-21",
};

function view(target: number, salePrice: number): RequestPricingResult {
  return {
    pricing: { ...pricing, target_percent: target },
    positions: [{ position_id: 1, sale_price: salePrice, sum_total: salePrice }],
    excluded: [], sum_total: salePrice, sum_without_vat: salePrice, sum_vat: 0,
    profit: salePrice - 700, rounding_residual: 0, warnings: [], blocking_reasons: [],
  };
}

function renderPage(data: ClientRequest = request) {
  vi.spyOn(apiClient, "getRequestById").mockResolvedValue({ data });
  vi.spyOn(apiClient, "getRequestPricing").mockResolvedValue({ data: view(0, 1000) });
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/requests/901"]}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  );
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Настройки расчёта в шапке заявки", () => {
  it("пересчитывает цены на сервере и показывает их в колонке «Продажа»", async () => {
    const save = vi.spyOn(apiClient, "saveRequestPricing").mockResolvedValue({ data: view(10, 900) });
    renderPage();
    const percent = await screen.findByLabelText("Скидка, %");
    fireEvent.change(percent, { target: { value: "10" } });
    fireEvent.blur(percent);
    await waitFor(() => expect(save).toHaveBeenCalledWith(901, { target_percent: 10 }));
    expect(await screen.findByLabelText("Цена к счёту, поз. 1")).toHaveTextContent("900,00 ₽");
    expect(screen.getByLabelText("Розница, поз. 1")).toHaveValue(1000);
    expect(screen.getByLabelText("Себестоимость, поз. 1")).toHaveValue(700);
  });

  it("строка без себестоимости показывает прочерк вместо цены к счёту", async () => {
    const withoutCost = { ...position, purchase_price: null, sale_price: null };
    vi.spyOn(apiClient, "getRequestById").mockResolvedValue({ data: { ...request, positions: [withoutCost] } });
    vi.spyOn(apiClient, "getRequestPricing").mockResolvedValue({
      data: { ...view(0, 0), positions: [], excluded: [1], sum_total: 0, sum_without_vat: 0, profit: 0 },
    });
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={["/requests/901"]}>
          <Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes>
        </MemoryRouter>
      </TooltipProvider>
    );
    const cell = await screen.findByText("—", { selector: "td span.text-warning" });
    expect(cell).toHaveAttribute("title", expect.stringContaining("розница"));
  });
});

describe("Варианты подбора", () => {
  it("показывает группы и передаёт класс аналога только по отдельному действию", async () => {
    const select = vi.spyOn(apiClient, "selectVariant").mockResolvedValue({ data: position });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Подробнее о поз. 1" }));
    expect(await screen.findByText("Точные совпадения")).toBeInTheDocument();
    expect(screen.getByText("Аналоги: замена требует отдельного подтверждения")).toBeInTheDocument();
    const analog = screen.getByRole("button", { name: /Ротбанд 10 кг/ });
    fireEvent.click(analog);
    await waitFor(() => expect(select).toHaveBeenCalledWith(901, 1, 37599, true));
    const exact = screen.getByRole("button", { name: /Ротбанд Кнауф 30 кг/ });
    fireEvent.click(exact);
    await waitFor(() => expect(select).toHaveBeenCalledWith(901, 1, 29832, false));
  });
});

describe("Подтверждение строк", () => {
  it("подтверждает отмеченные галочками строки, а без отметок — только нажатую", async () => {
    const second = { ...position, position_id: 2, raw_text: "Кабель 3х2,5" };
    const update = vi.spyOn(apiClient, "updateRequestPosition")
      .mockImplementation(async (_request, positionId) => ({ data: { ...position, position_id: positionId } }));
    renderPage({ ...request, positions: [position, second] });

    fireEvent.click(await screen.findByRole("button", { name: "Подтвердить поз. 1" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(901, 1, { status: "confirmed" }));
    expect(update.mock.calls.filter((call) => call[1] === 2)).toHaveLength(0);

    update.mockClear();
    fireEvent.click(screen.getByLabelText("Выбрать поз. 1"));
    fireEvent.click(screen.getByLabelText("Выбрать поз. 2"));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить поз. 1" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(901, 1, { status: "confirmed" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(901, 2, { status: "confirmed" }));
  });
});
