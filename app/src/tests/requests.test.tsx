import { describe, it, expect } from "vitest";
import { apiClient } from "../api/client";

describe("Этап 3: Клиентские запросы, AI-сопоставление и массовые действия (§7.5, §7.6 ТЗ)", () => {
  it("Создание нового запроса с парсингом многострочного текста и прикреплением файлов", async () => {
    const rawText = `1. ОСП плита 9мм 1250х2500 - 40 листов\n2. Ротбанд кнауф 30 кг 25 мешков\n3. Неизвестный крепеж 10 шт`;
    const files = [{ name: "спецификация.xlsx", size: 34500 }];

    const res = await apiClient.createRequest({
      client_name: "ООО «Тест-Строитель»",
      doc_number: "ЗК-ТЕСТ-001",
      raw_text: rawText,
      files,
    });

    expect(res.data.doc_number).toBe("ЗК-ТЕСТ-001");
    expect(res.data.positions.length).toBe(3);
    expect(res.data.positions[0].parsed_qty).toBe(40);
    expect(res.data.positions[0].parsed_unit).toBe("лист");
    expect(res.data.files.length).toBe(1);
  });

  it("Запуск AI-сопоставления (POST /api/requests/:id/match)", async () => {
    // Берем созданный запрос
    const all = await apiClient.getRequests();
    const target = all.data[0];

    const matched = await apiClient.runMatching(target.request_id);
    expect(matched.data.status).toBe("review");

    // Первые две позиции должны успешно сопоставиться с OSB и Ротбандом
    const pos1 = matched.data.positions[0];
    expect(pos1.matched_material_id).toBeDefined();
    expect(pos1.confidence).toBeGreaterThan(80);
    expect(pos1.selected_price).toBeGreaterThan(0);
    expect(pos1.alternatives.length).toBeGreaterThan(0);
  });

  it("Массовое действие: «Подтвердить все выше 90%»", async () => {
    const all = await apiClient.getRequests();
    const target = all.data[0];

    const res = await apiClient.applyMassAction(target.request_id, "confirm_above_90");
    const highConf = res.data.positions.filter((p) => p.confidence >= 90);
    expect(highConf.every((p) => p.status === "confirmed")).toBe(true);
  });

  it("Разделение строки заявки на 2 позиции (POST /api/requests/:id/positions/:posId/split)", async () => {
    const all = await apiClient.getRequests();
    const target = all.data[0];
    const initialCount = target.positions.length;
    const posToSplit = target.positions[target.positions.length - 1];

    const res = await apiClient.splitPosition(
      target.request_id,
      posToSplit.position_id,
      { text: "Дюбель 6х40", qty: 100, unit: "шт." },
      { text: "Саморез 3.5х35", qty: 200, unit: "шт." }
    );

    expect(res.data.positions.length).toBe(initialCount + 1);
    expect(res.data.positions.some((p) => p.raw_text === "Дюбель 6х40")).toBe(true);
    expect(res.data.positions.some((p) => p.raw_text === "Саморез 3.5х35")).toBe(true);
  });

  it("Добавление и удаление позиции вручную", async () => {
    const all = await apiClient.getRequests();
    const target = all.data[0];

    const added = await apiClient.addPosition(target.request_id, "Профиль направляющий 28х27", 10, "шт.");
    const newPos = added.data.positions.find((p) => p.raw_text === "Профиль направляющий 28х27");
    expect(newPos).toBeDefined();

    const deleted = await apiClient.deletePosition(target.request_id, newPos!.position_id);
    expect(deleted.data.positions.some((p) => p.position_id === newPos!.position_id)).toBe(false);
  });
});
