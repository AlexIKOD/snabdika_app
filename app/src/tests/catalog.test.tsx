import { describe, it, expect } from "vitest";
import { apiClient } from "../api/client";

describe("Этап 2: Каталог, фильтрация, карточка материала (§7.2, §7.3 ТЗ)", () => {
  it("Получение категорий рубрикатора каталога", async () => {
    const res = await apiClient.getCategories();
    expect(res.data.length).toBeGreaterThan(0);
    const root = res.data[0];
    expect(root.name).toBe("Все категории");
    expect(root.count).toBe(90033);
  });

  it("Фильтрация номенклатуры по поисковому запросу", async () => {
    const res = await apiClient.getMaterials({ query: "OSB" });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].canonical_name).toContain("OSB");
  });

  it("Фильтрация по конфликту цен (розница < закупки)", async () => {
    const res = await apiClient.getMaterials({ has_price_conflict: true });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.every((m) => m.flags.includes("price_conflict"))).toBe(true);
  });

  it("Фильтрация по подозрению на ложное объединение (>50% расхождение цен)", async () => {
    const res = await apiClient.getMaterials({ has_suspected_merge: true });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.every((m) => m.flags.includes("suspected_false_merge"))).toBe(true);
  });

  it("Редактирование канонической карточки материала (PATCH /api/materials/:id)", async () => {
    const patch = {
      canonical_name: "Плита OSB-3 влагостойкая 9х1250х2500 мм (Модифицировано)",
      brand: "Kronospan Premium",
    };
    const res = await apiClient.patchMaterial(1245, patch);
    expect(res.data.canonical_name).toBe(patch.canonical_name);
    expect(res.data.brand).toBe(patch.brand);

    // Проверяем, что изменения зафиксированы в карточке
    const fetched = await apiClient.getMaterialById(1245);
    expect(fetched.data.canonical_name).toBe(patch.canonical_name);
  });

  it("Добавление синонима к материалу (POST /api/materials/:id/aliases)", async () => {
    const newAlias = "ОСП влагостойкая плита 9 мм Krono";
    const res = await apiClient.addMaterialAlias(1245, newAlias);
    expect(res.data.raw_name).toBe(newAlias);
    expect(res.data.confidence).toBe(100);

    const fetched = await apiClient.getMaterialById(1245);
    expect(fetched.data.aliases?.some((a) => a.raw_name === newAlias)).toBe(true);
  });

  it("Требование пользователя: карточка НЕ содержит истории цен", async () => {
    const fetched = await apiClient.getMaterialById(1245);
    const rec = fetched.data as unknown as Record<string, unknown>;
    expect(rec.price_history).toBeUndefined();
  });
});
