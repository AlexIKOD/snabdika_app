import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InvoicesPage } from "../pages/InvoicesPage";
import { apiClient } from "../api/client";
import { TooltipProvider } from "../components/common/Tooltip";
import type { Invoice } from "../types/models";

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    invoice_id: 1, request_id: 901, number: "СЧ-0001", doc_date: "2026-10-15",
    client_name: "ООО «Строй-Трест»", sum_total: 1080, sum_without_vat: 900,
    sum_purchase: 600, status: "created", moysklad_href: null, error_text: null,
    positions_count: 2, created_at: "2026-10-15",
    ...overrides,
  };
}

const profitable = invoice({ invoice_id: 1, number: "СЧ-0001", request_id: 901, doc_date: "2026-10-15" });
const lossMaking = invoice({
  invoice_id: 2, number: "СЧ-0002", request_id: 902, doc_date: "2026-09-01",
  client_name: "ИП Иванов", sum_total: 480, sum_without_vat: 400, sum_purchase: 520,
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderRegistry(data: Invoice[]) {
  vi.spyOn(apiClient, "getInvoices").mockResolvedValue({ data });
  vi.spyOn(apiClient, "getRequests").mockResolvedValue({ data: [] });
  return render(
    <TooltipProvider><MemoryRouter initialEntries={["/invoices"]}>
      <Routes>
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/requests/new" element={<div>Страница создания документа</div>} />
      </Routes>
    </MemoryRouter></TooltipProvider>
  );
}

describe("Реестр счетов", () => {
  it("показывает источник со ссылкой на документ и не создаёт счета внутри реестра", async () => {
    renderRegistry([profitable]);

    expect(await screen.findByText("СЧ-0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "№ 901" })).toHaveAttribute("href", "/requests/901");
    expect(screen.queryByRole("button", { name: "Создать из каталога" })).toBeNull();
    expect(screen.queryByText("Счёт из нашей базы материалов")).toBeNull();
  });

  it("ведёт создание счёта на страницу входа в режиме каталога", async () => {
    renderRegistry([profitable]);
    fireEvent.click(await screen.findByRole("button", { name: "Создать счёт" }));
    expect(await screen.findByText("Страница создания документа")).toBeInTheDocument();
  });

  it("фильтрует по периоду и по убыточности", async () => {
    renderRegistry([profitable, lossMaking]);
    expect(await screen.findByText("СЧ-0002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Только убыточные" }));
    expect(screen.queryByText("СЧ-0001")).toBeNull();
    expect(screen.getByText("СЧ-0002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Только убыточные" }));
    fireEvent.change(screen.getByLabelText("Период с"), { target: { value: "2026-10-01" } });
    expect(screen.queryByText("СЧ-0002")).toBeNull();
    expect(screen.getByText("СЧ-0001")).toBeInTheDocument();
  });
});
