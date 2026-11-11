import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequestDetailPage } from "../pages/RequestDetailPage";
import { RequestsPage } from "../pages/RequestsPage";
import { apiClient } from "../api/client";
import type { ClientRequest } from "../types/models";
import { toast } from "sonner";
import { TooltipProvider } from "../components/common/Tooltip";

const request: ClientRequest = { request_id: 901, client_name: "Ротбанд", doc_number: "543", status: "draft",
  positions: [], files: [], created_at: "2026-10-21", updated_at: "2026-10-21" };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function detail() {
  return render(<MemoryRouter initialEntries={["/requests/901"]}><Routes>
    <Route path="/requests/:id" element={<RequestDetailPage />} />
    <Route path="/requests" element={<div>Список запросов</div>} />
  </Routes></MemoryRouter>);
}

describe("Работа с пустыми запросами и удаление", () => {
  it("не запускает сопоставление пустого запроса и объясняет, куда добавить товар", async () => {
    vi.spyOn(apiClient, "getRequestById").mockResolvedValue({ data: request });
    const match = vi.spyOn(apiClient, "runMatching");
    detail();
    const button = await screen.findByRole("button", { name: "Запустить сопоставление ИИ" });
    expect(button).toBeDisabled();
    expect(screen.queryByText("Все 0 поз. подтверждены")).toBeNull();
    expect(screen.getByText(/В заявке пока нет позиций/)).toBeInTheDocument();
    fireEvent.click(button);
    expect(match).not.toHaveBeenCalled();
  });

  it("отмена сохраняет запрос, подтверждение удаляет и возвращает список", async () => {
    vi.spyOn(apiClient, "getRequestById").mockResolvedValue({ data: request });
    const remove = vi.spyOn(apiClient, "deleteRequest").mockResolvedValue({ data: { request_id: 901, deleted: true } });
    detail();
    fireEvent.click(await screen.findByRole("button", { name: "Удалить заявку" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Отмена" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить заявку" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));
    expect(await screen.findByText("Список запросов")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(901);
  });

  it("удаление из списка не открывает строку и убирает её только после подтверждения", async () => {
    vi.spyOn(apiClient, "getRequests").mockResolvedValue({ data: [request] });
    const remove = vi.spyOn(apiClient, "deleteRequest").mockResolvedValue({ data: { request_id: 901, deleted: true } });
    render(<TooltipProvider><MemoryRouter><RequestsPage /></MemoryRouter></TooltipProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Удалить заявку 543" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(screen.queryByText("543")).toBeNull());
    expect(screen.getByText("Заявок пока нет")).toBeInTheDocument();
  });

  it("сохраняет запрос при отказе сервера из-за связанного счёта", async () => {
    vi.spyOn(apiClient, "getRequests").mockResolvedValue({ data: [request] });
    vi.spyOn(apiClient, "deleteRequest").mockRejectedValue(new Error("Нельзя удалить запрос, связанный со счётом"));
    const error = vi.spyOn(toast, "error");
    render(<TooltipProvider><MemoryRouter><RequestsPage /></MemoryRouter></TooltipProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Удалить заявку 543" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("связанный со счётом")));
    expect(screen.getByText("543")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
