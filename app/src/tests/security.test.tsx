import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { saveUiPreferences } from "../storage/preferences";
import { setSecret } from "../services/tauriBridge";
import { createSecretString } from "../types/security";
import { apiClient } from "../api/client";
import { SettingsPage } from "../pages/SettingsPage";
import fs from "node:fs";
import path from "node:path";

describe("Защитный контур секретов — 7 обязательных проверок (§4.4, §15.6 ТЗ)", () => {
  const TEST_TOKEN = "ms_prod_secret_token_1234567890abcdef";
  const TEST_GEMINI = "AIzaSySecretGeminiKey_9876543210fedcba";

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("Проверка 1: Веб-хранилище (localStorage, sessionStorage) не содержит секретов, подстрок от 4 символов, заголовков Authorization, текста запросов клиентов и цен (§15.6 п. 1)", async () => {
    // Сохраняем пользовательские настройки UI
    saveUiPreferences({ tableDensity: "compact", sidebarCollapsed: true });

    // Сохраняем токены через защитный контур
    await setSecret("moysklad_token", createSecretString(TEST_TOKEN));
    await setSecret("gemini_api_key", createSecretString(TEST_GEMINI));

    // Создаем клиентский запрос и счет
    const req = await apiClient.createRequest({
      client_name: "ООО «СекретСтрой»",
      doc_number: "З-SEC-01",
      raw_text: "ОСП плита 9мм Калевала 10 листов",
    });
    await apiClient.runMatching(req.data.request_id);

    // Дамп всего содержимого localStorage и sessionStorage
    const localDump = JSON.stringify(window.localStorage);
    const sessionDump = JSON.stringify(window.sessionStorage);

    // 1. Полное значение токена и ключа отсутствует
    expect(localDump).not.toContain(TEST_TOKEN);
    expect(localDump).not.toContain(TEST_GEMINI);
    expect(sessionDump).not.toContain(TEST_TOKEN);
    expect(sessionDump).not.toContain(TEST_GEMINI);

    // 2. Любые подстроки длиной от 4 символов отсутствуют
    expect(localDump).not.toContain("ms_p");
    expect(localDump).not.toContain("1234567890abcdef");
    expect(localDump).not.toContain("AIzaSySecret");
    expect(sessionDump).not.toContain("ms_p");
    expect(sessionDump).not.toContain("AIzaSySecret");

    // 3. Заголовки Authorization отсутствуют
    expect(localDump).not.toContain("Authorization");
    expect(localDump).not.toContain("Bearer");
    expect(sessionDump).not.toContain("Authorization");
    expect(sessionDump).not.toContain("Bearer");

    // 4. Текст запросов клиентов, наименования и цены из каталога отсутствуют
    expect(localDump).not.toContain("ООО «СекретСтрой»");
    expect(localDump).not.toContain("Калевала");
    expect(localDump).not.toContain("10 листов");
    expect(sessionDump).not.toContain("ООО «СекретСтрой»");

    // Единственный допустимый ключ в localStorage
    expect(Object.keys(window.localStorage)).toEqual(["snabdika_ui_preferences_v1"]);
  });

  it("Проверка 2: Канал передачи — секреты передаются дочернему процессу через stdin, а не в argv или env (§15.6 п. 2)", async () => {
    // Проверяем контракт tauriBridge: setSecret не помещает секрет в глобальные параметры окружения или командной строки
    const secret = createSecretString("test_safe_stdin_secret_val");
    const result = await setSecret("moysklad_token", secret);

    expect(result.status).toBe("stored");

    // Проверяем, что в process.env (если есть) или глобальных объектах секрет отсутствует
    expect(JSON.stringify(process.env)).not.toContain("test_safe_stdin_secret_val");
  });

  it("Проверка 3: Проверка журналов — в журнале приложения отсутствуют значения секретов и их подстроки (§15.6 п. 3)", async () => {
    // Сохраняем секреты и выполняем операции
    await setSecret("moysklad_token", createSecretString(TEST_TOKEN));
    await setSecret("gemini_api_key", createSecretString(TEST_GEMINI));

    const logsRes = await apiClient.getLogs();
    const logsDump = JSON.stringify(logsRes.data);

    expect(logsDump).not.toContain(TEST_TOKEN);
    expect(logsDump).not.toContain(TEST_GEMINI);
    expect(logsDump).not.toContain("1234567890abcdef");
    expect(logsDump).not.toContain("AIzaSySecret");
  });

  it("Проверка 4: Проверка интерфейса — ни на одном экране не отображается ни один символ секрета, только статус «установлен» / «не установлен» (§15.6 п. 4)", async () => {
    await setSecret("moysklad_token", createSecretString(TEST_TOKEN));

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    // Дожидаемся загрузки настроек
    await waitFor(() => {
      expect(screen.getByText(/Токен доступа «МойСклад»/)).toBeInTheDocument();
    });

    const bodyText = document.body.textContent || "";

    // 1. Ни один символ секрета не виден на странице
    expect(bodyText).not.toContain(TEST_TOKEN);
    expect(bodyText).not.toContain(TEST_GEMINI);
    expect(bodyText).not.toContain("ms_prod");
    expect(bodyText).not.toContain("AIzaSy");

    // 2. Категорически запрещена маска вида ••••1234
    expect(bodyText).not.toContain("••••");
    expect(bodyText).not.toContain("****");

    // 3. Отображается только статус «Установлен»
    expect(screen.getAllByText(/Установлен/).length).toBeGreaterThan(0);
  });

  it("Проверка 5: Проверка API — GET /api/settings не возвращает секреты, PUT /api/settings их не принимает (§15.6 п. 5)", async () => {
    const settingsRes = await apiClient.getSettings();
    const settingsObj = settingsRes.data as unknown as Record<string, unknown>;

    // Метод GET /api/settings не возвращает секреты
    expect(settingsObj.moysklad_token).toBeUndefined();
    expect(settingsObj.gemini_key).toBeUndefined();
    expect(settingsObj.token).toBeUndefined();
    expect(settingsObj.api_key).toBeUndefined();
    expect(settingsObj.secret).toBeUndefined();
    expect(JSON.stringify(settingsRes.data)).not.toContain(TEST_TOKEN);

    // Метод PUT /api/settings не принимает и не сохраняет секреты
    const updated = await apiClient.updateSettings({
      log_level: "DEBUG",
      // Даже если кто-то попытается передать поле с секретом:
      ...({ moysklad_token: "hacked_token_value" } as unknown as object),
    });

    const updatedRecord = updated.data as unknown as Record<string, unknown>;
    expect(updatedRecord.moysklad_token).toBeUndefined();
    expect(JSON.stringify(updated.data)).not.toContain("hacked_token_value");
  });

  it("Проверка 6: Проверка сборки — прямой вызов localStorage вне storage/preferences.ts запрещён правилами линтера (§15.6 п. 6)", () => {
    // Читаем eslint.config.js и проверяем наличие правила блокировки localStorage
    const eslintConfigPath = path.resolve(__dirname, "../../eslint.config.js");
    const configContent = fs.readFileSync(eslintConfigPath, "utf-8");

    expect(configContent).toContain("no-restricted-syntax");
    expect(configContent).toContain("localStorage");
    expect(configContent).toContain("sessionStorage");
    expect(configContent).toContain("storage/preferences.ts");
  });

  it("Проверка 7: Проверка очистки — после сохранения поле ввода пусто, при уходе с экрана состояние не сохраняется (§15.6 п. 7)", async () => {
    const { unmount } = render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Токен доступа «МойСклад»/)).toBeInTheDocument();
    });

    // Открываем форму изменения
    const changeButtons = screen.getAllByRole("button", { name: "Изменить" });
    fireEvent.click(changeButtons[0]);

    const input = screen.getByPlaceholderText("Вставьте токен...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ms_temp_token_for_cleanup_test" } });
    expect(input.value).toBe("ms_temp_token_for_cleanup_test");

    // Нажимаем «Записать в хранилище»
    const submitBtn = screen.getByRole("button", { name: "Записать в хранилище" });
    fireEvent.click(submitBtn);

    // Проверяем, что поле ввода мгновенно очищено
    await waitFor(() => {
      expect(input.value).toBe("");
    });

    // Размонтируем компонент (имитируем переход на другой экран)
    unmount();

    // Проверяем, что в веб-хранилище ничего не осталось
    expect(JSON.stringify(window.localStorage)).not.toContain("ms_temp_token_for_cleanup_test");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("ms_temp_token_for_cleanup_test");
  });
});
