import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequestDetailPage } from "../pages/RequestDetailPage";
import { apiClient } from "../api/client";
import { TooltipProvider } from "../components/common/Tooltip";
import type { ClientRequest, RequestPosition } from "../types/models";

const position: RequestPosition = {
  position_id: 1,
  raw_text: "Ротбанд кнауф 30 кг 20 мешков",
  parsed_qty: 20,
  parsed_unit: "мешок",
  matched_material_id: 29832,
  matched_material_name: "Ротбанд Кнауф 30 кг",
  matched_material_unit: "мешок",
  quantity_confirmed: true,
  unit_confirmed: true,
  confidence: 96,
  status: "needs_review",
  reasoning: "Совпали бренд, фасовка и единица",
  selected_supplier_id: 1,
  selected_price: 380,
  retail_price: 450,
  purchase_price: 380,
  retail_source: "Согласовано с клиентом",
  purchase_source: "Прайс: СтройБаза",
  alternatives: [{ material_id: 29832, name: "Ротбанд", score: 96, supplier_name: "СтройБаза", supplier_id: 1, price: 380 }],
  flags: [],
};

const request: ClientRequest = {
  request_id: 901,
  client_name: "ООО «Строй-Трест»",
  doc_number: "ЗК-901",
  status: "review",
  positions: [position],
  files: [],
  created_at: "2026-10-21",
  updated_at: "2026-10-21",
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage(data: ClientRequest = request) {
  vi.spyOn(apiClient, "getRequestById").mockResolvedValue({ data });
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/requests/901"]}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/requests" element={<div>Список заявок</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  );
}

describe("Таблица позиций документа", () => {
  it("показывает позиции плотными строками с товаром, ценами и маржой", async () => {
    renderPage();

    expect(await screen.findByText("Ротбанд кнауф 30 кг 20 мешков")).toBeInTheDocument();
    expect(screen.getByText("Ротбанд Кнауф 30 кг")).toBeInTheDocument();
    expect(screen.getByText(/15,56%/)).toBeInTheDocument();
    expect(screen.queryByText("Сопоставлено:")).toBeNull();
  });

  it("раскрывает строку с обоснованием и альтернативами", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Подробнее о поз. 1" }));

    expect(await screen.findByText("Совпали бренд, фасовка и единица")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Разделить строку" })).toBeInTheDocument();
  });

  it("при наличии вопросов показывает их один раз, без дубля пояснения ИИ", async () => {
    const withQuestions = { ...position, reasoning: "Подбор по каталогу. Уточните фасовку.",
      review_questions: ["Уточните фасовку."] };
    renderPage({ ...request, positions: [withQuestions] });
    fireEvent.click(await screen.findByRole("button", { name: "Подробнее о поз. 1" }));
    expect(await screen.findByText("Уточните фасовку.")).toBeInTheDocument();
    expect(screen.queryByText(/Подбор по каталогу/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Вопросы проверки/)).not.toBeInTheDocument();
  });

  it("сохраняет изменённое количество и возвращает строку в проверку", async () => {
    const update = vi.spyOn(apiClient, "updateRequestPosition").mockResolvedValue({
      data: { ...position, parsed_qty: 25, status: "needs_review" },
    });
    renderPage();

    const qty = await screen.findByLabelText("Количество, поз. 1");
    fireEvent.change(qty, { target: { value: "25" } });
    fireEvent.blur(qty);

    await waitFor(() => expect(update).toHaveBeenCalledWith(901, 1, expect.objectContaining({ parsed_qty: 25 })));
    expect(await within(screen.getByRole("table")).findByText("Требует проверки")).toBeInTheDocument();
  });

  it("подтверждает строку одной кнопкой и показывает ошибку валидации в строке", async () => {
    const update = vi
      .spyOn(apiClient, "updateRequestPosition")
      .mockResolvedValueOnce({ data: { ...position, status: "needs_review" } })
      .mockResolvedValueOnce({ data: { ...position, status: "needs_review" } })
      .mockRejectedValueOnce(new Error("Проверьте количество по исходной заявке"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Подтвердить поз. 1" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
    expect(update.mock.calls[1][2]).toEqual({ quantity_confirmed: true, unit_confirmed: true });
    expect(update.mock.calls[2][2]).toEqual({ status: "confirmed" });
    expect(await screen.findByText(/Проверьте количество по исходной заявке/)).toBeInTheDocument();
  });

  it("добавляет товар из каталога в текущий документ", async () => {
    const add = vi.spyOn(apiClient, "addPosition").mockResolvedValue({ data: request });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Добавить из каталога" }));
    expect(add).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
