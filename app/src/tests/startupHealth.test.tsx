import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { DataStatusPage } from "../pages/DataStatusPage";
import { MaterialsPage } from "../pages/MaterialsPage";
import { apiClient } from "../api/client";
import type { SystemHealth } from "../types/models";

const health: SystemHealth = {
  status: "warning", data_layer: true, database_version: "7", database_path: "test.sqlite",
  parquet_status: [], app_version: "2.3.4",
  moysklad: { connected: false, status_text: "Проверка не выполнена" },
  gemini: { available: false, status_text: "Доступность не проверена" },
  catalog: { materials_count: 321, offers_count: 654, updated_at: "2026-10-22" },
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Отображение проверенного состояния приложения", () => {
  it("показывает реальные числа и не подтверждает непроверенные интеграции", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue({ data: health });
    render(<MemoryRouter><AppLayout /></MemoryRouter>);
    expect(await screen.findByText("321")).toBeInTheDocument();
    expect(screen.getByText("654")).toBeInTheDocument();
    expect(screen.getByText("Версия 2.3.4")).toBeInTheDocument();
    expect(screen.getByText(/обновлена 22.10.2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "МойСклад: не проверено" }).querySelector(".status-dot--success")).toBeNull();
    expect(screen.getByRole("button", { name: "Gemini: не проверено" }).querySelector(".status-dot--success")).toBeNull();
  });

  it("при недоступном health не показывает вымышленные данные или зелёные статусы", async () => {
    vi.spyOn(apiClient, "getHealth").mockRejectedValue(new Error("offline"));
    const { container } = render(<MemoryRouter><AppLayout /></MemoryRouter>);
    expect(await screen.findByText("База: состояние неизвестно")).toBeInTheDocument();
    expect(container.querySelector(".status-dot--success")).toBeNull();
    expect(screen.queryByText("90 033")).toBeNull();
  });

  it("сбрасывает подтвержденный статус, если повторная проверка не удалась", async () => {
    vi.spyOn(apiClient, "getHealth")
      .mockResolvedValueOnce({ data: { ...health, moysklad: { connected: true, status_text: "API проверен" } } })
      .mockRejectedValueOnce(new Error("offline"));
    const { container } = render(<MemoryRouter><AppLayout /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "МойСклад: доступен" })).toBeInTheDocument();
    expect(container.querySelector(".status-dot--success")).not.toBeNull();
    fireEvent.focus(window);
    expect(await screen.findByText("База: состояние неизвестно")).toBeInTheDocument();
    expect(container.querySelector(".status-dot--success")).toBeNull();
  });

  it("не считает недоступную БД подключенной и не придумывает полноту", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue({ data: { ...health, data_layer: false } });
    render(<DataStatusPage />);
    expect(await screen.findByText("Недоступна")).toHaveClass("badge--danger");
    expect(screen.getByText("Полнота данных не проверена")).toBeInTheDocument();
    expect(screen.queryByText("96%")).toBeNull();
    expect(screen.queryByText("Изображения")).toBeNull();
  });

  it("показывает полноту только из ответа health", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue({ data: { ...health, catalog: { ...health.catalog!, completeness: { materials: 12, offers: 34, aliases: 56 } } } });
    render(<DataStatusPage />);
    expect(await screen.findByText("12,0%")).toBeInTheDocument();
    expect(screen.getByText("34,0%")).toBeInTheDocument();
    expect(screen.getByText("56,0%")).toBeInTheDocument();
  });

  it("использует количество каталога из категорий", async () => {
    vi.spyOn(apiClient, "getCategories").mockResolvedValue({ data: [{ name: "Все категории", count: 321, subcategories: [] }] });
    vi.spyOn(apiClient, "getMaterials").mockResolvedValue({ data: [] });
    render(<MemoryRouter><MaterialsPage /></MemoryRouter>);
    expect(await screen.findByText("из 321 материалов")).toBeInTheDocument();
    expect(screen.queryByText("из 90 033 материалов")).toBeNull();
  });
});
