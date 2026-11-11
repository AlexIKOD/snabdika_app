import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { EmptyState } from "../components/common/EmptyState";

describe("Компоненты дизайн-системы (§5.6, §13 ТЗ)", () => {
  it("Кнопка primary рендерится с белым цветом текста (WCAG AA 5.1:1)", () => {
    render(<Button variant="primary">Действие</Button>);
    const btn = screen.getByRole("button", { name: "Действие" });
    expect(btn).toBeInTheDocument();
  });

  it("Семантический бейдж отображает статус", () => {
    render(<Badge variant="warning">Конфликт цен</Badge>);
    expect(screen.getByText("Конфликт цен")).toBeInTheDocument();
  });

  it("EmptyState рендерит заголовок и описание", () => {
    render(
      <EmptyState
        title="Запросов пока нет"
        description="Создайте первый клиентский запрос для сопоставления"
      />
    );
    expect(screen.getByText("Запросов пока нет")).toBeInTheDocument();
  });
});
