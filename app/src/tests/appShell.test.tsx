import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../App";

afterEach(() => cleanup());

describe("Оболочка приложения: новые маршруты раздела «Заявки»", () => {
  it("открывает страницу создания документа и переключает способы", async () => {
    window.location.hash = "#/requests/new";
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Новая заявка" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Распознать заявку/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /Собрать из каталога/ }));
    expect(screen.getByLabelText("Поиск по внутренней базе")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /ИИ-подбор/ }));
    expect(screen.getByLabelText(/Описание потребности/)).toBeInTheDocument();
  });

  it("открывает реестр счетов без композера каталога", async () => {
    window.location.hash = "#/invoices";
    render(<App />);

    expect(await screen.findByText("Счета покупателям")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать из каталога" })).toBeNull();
    expect(screen.getByRole("button", { name: "Создать счёт" })).toBeInTheDocument();
    expect(screen.getByLabelText("Период с")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Только убыточные" })).toBeInTheDocument();
  });

  it("показывает раздел «Заявки» в навигации", async () => {
    window.location.hash = "#/requests";
    render(<App />);

    expect(await screen.findByRole("link", { name: "Заявки" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Запросы клиентов" })).toBeNull();
  });
});
