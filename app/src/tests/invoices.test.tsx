import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { apiClient } from "../api/client";
import { InvoicesPage } from "../pages/InvoicesPage";
import { TooltipProvider } from "../components/common/Tooltip";

describe("Этап 4: Счёт и «МойСклад» (§7.7, §7.8, §8.6, §15.4 ТЗ)", () => {

  it("1. Предпросмотр счёта: расчёт сумм, НДС и маржинальности (§7.7 ТЗ)", async () => {
    // Предварительно добавим dummyRequest в мок-сервер через createRequest
    const createdReq = await apiClient.createRequest({
      client_name: "ООО «ТестСтрой»",
      doc_number: "З-9991",
      raw_text: "ОСП плита 9мм - 10 листов",
    });

    // Запустим сопоставление и подтвердим позицию
    await apiClient.runMatching(createdReq.data.request_id);
    const updated = await apiClient.getRequestById(createdReq.data.request_id);
    await apiClient.updateRequestPosition(
      createdReq.data.request_id,
      updated.data.positions[0].position_id,
      { status: "confirmed", selected_price: 700.0 }
    );

    const previewRes = await apiClient.previewInvoice(createdReq.data.request_id, "20%");
    expect(previewRes.data.invoice_preview).toBeDefined();
    expect(previewRes.data.invoice_preview.sum_total).toBeGreaterThan(0);
    expect(previewRes.data.invoice_preview.sum_without_vat).toBeGreaterThan(0);
    expect(previewRes.data.invoice_preview.sum_vat).toBeGreaterThan(0);
    expect(previewRes.data.blocking_reasons).toHaveLength(0);
  });

  it("2. Блокирующие валидации: нельзя создать счёт при неподтверждённых позициях (§7.7 ТЗ)", async () => {
    const unconfirmedReq = await apiClient.createRequest({
      client_name: "ИП Черновиков",
      doc_number: "З-9992",
      raw_text: "Профиль потолочный 60х27 - 50 шт",
    });

    // Позиция пока в статусе needs_review / draft
    const previewRes = await apiClient.previewInvoice(unconfirmedReq.data.request_id);
    expect(previewRes.data.blocking_reasons.length).toBeGreaterThan(0);
    expect(previewRes.data.blocking_reasons[0]).toContain("Не все позиции подтверждены");

    // Попытка создания счёта напрямую должна выбрасывать исключение
    await expect(
      apiClient.createInvoice({
        request_id: unconfirmedReq.data.request_id,
        client_name: "ИП Черновиков",
        organization: "ООО «Снабдика»",
        warehouse: "Основной склад СПБ",
        doc_date: "2026-09-19",
        vat_rate: "20%",
      })
    ).rejects.toThrow(/не подтверждено/);
  });

  it("3. Защита от дублей: повторное создание счёта по тому же запросу блокируется (§7.7, §15.4 ТЗ)", async () => {
    const req = await apiClient.createRequest({
      client_name: "ООО «АнтиДубль»",
      doc_number: "З-9993",
      raw_text: "Штукатурка Knauf Ротбанд 30 кг - 20 мешков",
    });

    await apiClient.runMatching(req.data.request_id);
    const updated = await apiClient.getRequestById(req.data.request_id);
    await apiClient.updateRequestPosition(req.data.request_id, updated.data.positions[0].position_id, {
      status: "confirmed",
      selected_price: 520.0,
    });

    // Первое создание - успешно
    const firstInvoice = await apiClient.createInvoice({
      request_id: req.data.request_id,
      client_name: "ООО «АнтиДубль»",
      organization: "ООО «Снабдика»",
      warehouse: "Основной склад СПБ",
      doc_date: "2026-09-19",
      vat_rate: "20%",
    });
    expect(firstInvoice.data.status).toBe("created");
    expect(firstInvoice.data.number).toMatch(/^СЧ-/);
    expect(firstInvoice.data.moysklad_href).toBeTruthy();

    // Второе создание с тем же request_id должно быть заблокировано (§7.7 ТЗ)
    await expect(
      apiClient.createInvoice({
        request_id: req.data.request_id,
        client_name: "ООО «АнтиДубль»",
        organization: "ООО «Снабдика»",
        warehouse: "Основной склад СПБ",
        doc_date: "2026-09-19",
        vat_rate: "20%",
      })
    ).rejects.toThrow(/уже создан в «МойСклад»/);
  });

  it("4. Обработка ошибок API и повторная отправка без дублирования (§8.6, §15.4 ТЗ)", async () => {
    const req = await apiClient.createRequest({
      client_name: "ООО «СбойТест»",
      doc_number: "З-9994",
      raw_text: "Кабель ВВГнг-LS 3х2.5 - 100 м",
    });

    await apiClient.runMatching(req.data.request_id);
    const updated = await apiClient.getRequestById(req.data.request_id);
    await apiClient.updateRequestPosition(req.data.request_id, updated.data.positions[0].position_id, {
      status: "confirmed",
      selected_price: 95.0,
    });

    // Создаем с имитацией сбоя API МойСклад
    const failedInvoice = await apiClient.createInvoice({
      request_id: req.data.request_id,
      client_name: "ООО «СбойТест»",
      organization: "ООО «Снабдика»",
      warehouse: "Основной склад СПБ",
      doc_date: "2026-09-19",
      vat_rate: "20%",
      simulate_error: true,
    });

    expect(failedInvoice.data.status).toBe("error");
    expect(failedInvoice.data.error_text).toContain("504 Gateway Timeout");

    // Выполняем повторную отправку по сохранённому invoice_id (§8.6 ТЗ)
    const retriedInvoice = await apiClient.retryInvoice(failedInvoice.data.invoice_id);
    expect(retriedInvoice.data.status).toBe("created");
    expect(retriedInvoice.data.error_text).toBeNull();
    // Номер счёта и request_id обязаны сохраниться теми же самыми (без дубля)
    expect(retriedInvoice.data.number).toBe(failedInvoice.data.number);
    expect(retriedInvoice.data.request_id).toBe(failedInvoice.data.request_id);
  });

  it("5. Рендеринг реестра счетов и фильтрация статусов (§7.8 ТЗ)", async () => {
    render(
      <TooltipProvider>
        <BrowserRouter>
          <InvoicesPage />
        </BrowserRouter>
      </TooltipProvider>
    );

    // Дожидаемся загрузки данных реестра
    await waitFor(() => {
      expect(screen.getByText("Счета покупателям")).toBeInTheDocument();
    });

    // Должны отображаться кнопки фильтра по статусу
    expect(screen.getByRole("button", { name: "Все" })).toBeInTheDocument();
    expect(screen.getAllByText("Создан")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Ошибка отправки")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Оплачен")[0]).toBeInTheDocument();

    // Экспорт в CSV кнопка
    expect(screen.getByText("Экспорт (CSV)")).toBeInTheDocument();
  });
});
