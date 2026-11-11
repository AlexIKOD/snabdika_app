import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequestCreatePage } from "../pages/RequestCreatePage";
import { apiClient } from "../api/client";
import { TooltipProvider } from "../components/common/Tooltip";
import type { ClientRequest, Material, RequestPosition } from "../types/models";

const created = (request_id: number) => ({ data: { request_id } as ClientRequest });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage() {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/requests/new"]}>
        <Routes>
          <Route path="/requests/new" element={<RequestCreatePage />} />
          <Route path="/requests/:id" element={<div>Позиции документа</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  );
}

describe("Страница входа: создание документа", () => {
  it("создаёт заявку из текста и открывает её позиции", async () => {
    const create = vi.spyOn(apiClient, "createRequest").mockResolvedValue(created(42));
    renderPage();

    fireEvent.change(screen.getByLabelText(/Контрагент/), { target: { value: "ООО «Строй-Трест»" } });
    fireEvent.change(screen.getByLabelText(/Текст заявки/), { target: { value: "Ротбанд 30 кг 20 мешков" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать заявку" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].client_name).toBe("ООО «Строй-Трест»");
    expect(create.mock.calls[0][0].raw_text).toBe("Ротбанд 30 кг 20 мешков");
    expect(await screen.findByText("Позиции документа")).toBeInTheDocument();
  });

  it("ИИ-режим создаёт документ без клиента", async () => {
    const create = vi.spyOn(apiClient, "createRequest").mockResolvedValue(created(43));
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /ИИ-подбор/ }));
    fireEvent.change(screen.getByLabelText(/Описание потребности/), {
      target: { value: "саморезы по дереву 3.5х35, 1000 шт" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Создать заявку/ }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].client_name).toBe("");
    expect(await screen.findByText("Позиции документа")).toBeInTheDocument();
  });

  it("создаёт заявку по одному тексту: контрагент не обязателен", () => {
    renderPage();
    const submit = screen.getByRole("button", { name: "Создать заявку" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Текст заявки/), { target: { value: "Ротбанд 30 кг" } });
    expect(submit).toBeEnabled();
    expect(screen.getByLabelText(/Контрагент/)).toHaveValue("");
  });

  it("собирает документ из каталога с количеством и открывает его", async () => {
    const material: Material = {
      material_id: 7, canonical_name: "Ротбанд Кнауф 30 кг", unit: "мешок",
      weight_kg: 30, category: "СМЕСИ", subcategory: "", brand: "Knauf", status: "active",
      aliases_count: 0, offers: [], flags: [],
      best_purchase: { supplier_name: "СтройБаза", price: 380 },
    };
    vi.spyOn(apiClient, "getMaterials").mockResolvedValue({ data: [material] });
    const draft = {
      request_id: 77, source: "catalog_invoice" as const, client_name: "", doc_number: "Из каталога",
      status: "draft" as const, files: [], created_at: "", updated_at: "",
      positions: [{ position_id: 11, matched_material_id: 7 } as RequestPosition],
    };
    const createDraft = vi.spyOn(apiClient, "createCatalogInvoiceDraft").mockResolvedValue({ data: draft });
    const patch = vi.spyOn(apiClient, "updateRequestPosition").mockResolvedValue({ data: draft.positions[0] });

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Собрать из каталога/ }));
    fireEvent.change(screen.getByLabelText(/Поиск по внутренней базе/), { target: { value: "Ротбанд" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Ротбанд Кнауф 30 кг");
    fireEvent.click(screen.getByRole("button", { name: /Добавить Ротбанд Кнауф 30 кг/ }));
    fireEvent.change(screen.getByLabelText(/Количество, мешок/), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /Создать заявку/ }));

    await waitFor(() => expect(createDraft).toHaveBeenCalledWith([7]));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(77, 11, { parsed_qty: 20 }));
    expect(await screen.findByText("Позиции документа")).toBeInTheDocument();
  });

  it("не добавляет материал в корзину дважды", async () => {
    const material: Material = {
      material_id: 7, canonical_name: "Ротбанд Кнауф 30 кг", unit: "мешок",
      weight_kg: 30, category: "СМЕСИ", subcategory: "", brand: "Knauf", status: "active",
      aliases_count: 0, offers: [], flags: [], best_purchase: null,
    };
    vi.spyOn(apiClient, "getMaterials").mockResolvedValue({ data: [material] });

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Собрать из каталога/ }));
    fireEvent.change(screen.getByLabelText(/Поиск по внутренней базе/), { target: { value: "Ротбанд" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    const add = await screen.findByRole("button", { name: /Добавить Ротбанд Кнауф 30 кг/ });
    fireEvent.click(add);
    expect(screen.getByRole("button", { name: /Добавить Ротбанд Кнауф 30 кг/ })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Состав (1)" })).toBeInTheDocument();
  });
});
