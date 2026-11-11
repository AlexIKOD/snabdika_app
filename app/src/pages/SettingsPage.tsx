import { toast } from "sonner";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  CircleAlert,
  Save,
  ShieldLock,
  Plug,
  Database,
  Trash,
  FileText,
  Store,
  Tags,
  SlidersHorizontal,
  KeyRound,
} from "lucide-react";
import { apiClient } from "../api/client";
import { date as formatDate } from "../lib/format";
import type { AppSettings } from "../types/models";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { Alert } from "../components/common/Alert";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { Skeleton, BlockSkeleton } from "../components/common/Skeleton";
import { setSecret, getSecretStatus } from "../services/tauriBridge";
import { createSecretString, type SecretStatus } from "../types/security";
import { getUiPreferences, saveUiPreferences, DEFAULT_PREFERENCES } from "../storage/preferences";
import { AIProviderSettings } from "../components/settings/AIProviderSettings";
import { errorText } from "../lib/errors";

type SettingsTab = "secrets" | "integrations" | "ui" | "data";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "secrets", label: "Секреты", icon: <ShieldLock size={15} strokeWidth={1.75} /> },
  { id: "integrations", label: "Интеграции", icon: <Store size={15} strokeWidth={1.75} /> },
  { id: "ui", label: "Интерфейс", icon: <SlidersHorizontal size={15} strokeWidth={1.75} /> },
  { id: "data", label: "Данные", icon: <Database size={15} strokeWidth={1.75} /> },
];

/** Заголовок карточки: иконка + подпись. */
const CardTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="card-title-row">
    <span className="card-title-row__icon" aria-hidden="true">
      {icon}
    </span>
    {children}
  </span>
);

/** Строка настройки: подпись с описанием слева, элементы управления справа. */
const SettingRow: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  controls?: React.ReactNode;
}> = ({ title, description, controls }) => (
  <div className="setting-row">
    <div className="setting-row__main">
      <div className="setting-row__title">{title}</div>
      {description && <div className="setting-row__desc">{description}</div>}
    </div>
    {controls && <div className="setting-row__controls">{controls}</div>}
  </div>
);

/** Статус секрета: дата изменения показывается только когда известна. */
function secretStatusLabel(updatedAt?: string | null) {
  const formatted = updatedAt ? formatDate(updatedAt) : "";
  return formatted && formatted !== "—" ? `Установлен · ${formatted}` : "Установлен";
}

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("secrets");
  // Настройки интерфейса локальные
  const [preferences, setPreferences] = useState(() => getUiPreferences());

  // Конфигурация приложения
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  // Статусы секретов (приходят из Credential Manager: ТОЛЬКО is_set и updated_at, без масок и символов)
  const [moyskladStatus, setMoyskladStatus] = useState<SecretStatus | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<SecretStatus | null>(null);

  // Режим редактирования секретов
  const [editMoyskladOpen, setEditMoyskladOpen] = useState(false);
  const [editGeminiOpen, setEditGeminiOpen] = useState(false);

  // Временные поля ввода (очищаются СРАЗУ же после сохранения и при закрытии)
  const [rawMoyskladInput, setRawMoyskladInput] = useState("");
  const [rawGeminiInput, setRawGeminiInput] = useState("");

  const [savingMoysklad, setSavingMoysklad] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);
  const [moyskladSaveMsg, setMoyskladSaveMsg] = useState<string | null>(null);
  const [geminiSaveMsg, setGeminiSaveMsg] = useState<string | null>(null);

  // Тестирование соединений
  const [testingMs, setTestingMs] = useState(false);
  const [msTestResult, setMsTestResult] = useState<string | null>(null);
  const [testingGm, setTestingGm] = useState(false);
  const [gmTestResult, setGmTestResult] = useState<string | null>(null);

  // Очистка изображений
  const [clearImagesDialogOpen, setClearImagesDialogOpen] = useState(false);
  const [clearingImages, setClearingImages] = useState(false);
  const [clearImagesResult, setClearImagesResult] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
    return () => {
      // Очистка при уходе с экрана (§15.6 п. 7 ТЗ)
      setRawMoyskladInput("");
      setRawGeminiInput("");
    };
  }, []);

  const loadAll = async () => {
    try {
      setLoadingSettings(true);
      const [stRes, ms, gm] = await Promise.all([
        apiClient.getSettings(),
        getSecretStatus("moysklad_token"),
        getSecretStatus("gemini_api_key"),
      ]);
      setSettings(stRes.data);
      setMoyskladStatus(ms);
      setGeminiStatus(gm);
    } catch (err) {
      toast.error(`Ошибка загрузки настроек: ${errorText(err)}`);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveMoysklad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawMoyskladInput.trim()) return;

    setSavingMoysklad(true);
    try {
      const branded = createSecretString(rawMoyskladInput.trim());
      // Немедленно стираем сырой ввод из памяти React-компонента (§4.4, §15.6 ТЗ)
      setRawMoyskladInput("");
      const stored = await setSecret("moysklad_token", branded);
      if (stored.status !== "stored") throw new Error(stored.error_message || "Секрет не сохранён");
      setMoyskladSaveMsg("Токен успешно сохранён в Windows Credential Manager");
      setEditMoyskladOpen(false);
      window.setTimeout(() => setMoyskladSaveMsg(null), 4000);
      const ms = await getSecretStatus("moysklad_token");
      setMoyskladStatus(ms);
    } catch (err) {
      toast.error(`Ошибка сохранения токена: ${errorText(err)}`);
    } finally {
      setSavingMoysklad(false);
    }
  };

  const handleSaveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawGeminiInput.trim()) return;

    setSavingGemini(true);
    try {
      const branded = createSecretString(rawGeminiInput.trim());
      // Немедленно стираем сырой ввод из памяти React-компонента (§4.4, §15.6 ТЗ)
      setRawGeminiInput("");
      const stored = await setSecret("gemini_api_key", branded);
      if (stored.status !== "stored") throw new Error(stored.error_message || "Секрет не сохранён");
      setGeminiSaveMsg("API-ключ успешно сохранён в Windows Credential Manager");
      setEditGeminiOpen(false);
      window.setTimeout(() => setGeminiSaveMsg(null), 4000);
      const gm = await getSecretStatus("gemini_api_key");
      setGeminiStatus(gm);
    } catch (err) {
      toast.error(`Ошибка сохранения API-ключа: ${errorText(err)}`);
    } finally {
      setSavingGemini(false);
    }
  };

  const handleTestMoysklad = async () => {
    try {
      setTestingMs(true);
      setMsTestResult(null);
      const res = await apiClient.testMoyskladConnection();
      setMsTestResult(res.data.message);
    } catch (err) {
      setMsTestResult(`Ошибка проверки связи: ${errorText(err)}`);
    } finally {
      setTestingMs(false);
    }
  };

  const handleTestGemini = async () => {
    try {
      setTestingGm(true);
      setGmTestResult(null);
      const res = await apiClient.testGeminiConnection();
      setGmTestResult(res.data.message);
    } catch (err) {
      setGmTestResult(`Ошибка проверки связи: ${errorText(err)}`);
    } finally {
      setTestingGm(false);
    }
  };

  const handleSaveAppSettings = async () => {
    if (!settings) return;
    try {
      setSavingSettings(true);
      await apiClient.updateSettings(settings);
      setSettingsSavedSuccess(true);
      window.setTimeout(() => setSettingsSavedSuccess(false), 3000);
    } catch (err) {
      toast.error(`Ошибка сохранения настроек: ${errorText(err)}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDensityChange = (density: "compact" | "standard") => {
    const updated = saveUiPreferences({ tableDensity: density });
    setPreferences(updated);
    if (settings) {
      setSettings({ ...settings, table_density: density });
    }
  };

  const handleResetColumns = () => {
    saveUiPreferences({ catalogColumns: DEFAULT_PREFERENCES.catalogColumns });
    toast.info("Настройки колонок каталога сброшены к значениям по умолчанию");
  };

  const handleConfirmClearImages = async () => {
    try {
      setClearingImages(true);
      const res = await apiClient.clearLocalImages();
      setClearImagesResult(
        `Удалено ${res.data.deleted_count} файлов (освобождено ${res.data.freed_mb} МБ)`
      );
    } catch (err) {
      toast.error(`Ошибка очистки: ${errorText(err)}`);
    } finally {
      setClearingImages(false);
      setClearImagesDialogOpen(false);
    }
  };

  const SettingsSkeleton = () => (
    <div className="page page--narrow">
      <div className="stack">
        <Skeleton width="30%" height={40} />
        <BlockSkeleton height={300} />
      </div>
    </div>
  );

  if (loadingSettings || !settings) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="page page--narrow">
      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">Настройки приложения</h1>
          <p className="page__subtitle">
            Ключи доступа, интеграции, ценообразование и рабочая область
          </p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Разделы настроек">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab__icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`settings-panel-${activeTab}`} role="tabpanel">
        {activeTab === "secrets" && (
          <div className="stack">
            <AIProviderSettings settings={settings} onChange={setSettings} />
            {/* 1. Защитный контур секретов (§4.4, §11.1, §15.6 ТЗ) */}
            <Card
              title={
                <CardTitle icon={<ShieldLock size={18} strokeWidth={1.75} />}>
                  Ключи доступа
                </CardTitle>
              }
            >
              <div className="stack">
                <Alert tone="neutral" title="Где хранятся ключи">
                  Токен «МойСклад» и ключи ИИ хранятся только в диспетчере учётных данных Windows.
                  Приложение не показывает сами значения — только факт наличия и дату изменения.
                  Ключ сохраняется сразу кнопкой «Записать в хранилище».
                </Alert>

                {/* Токен МойСклад */}
                <div className="stack stack--tight">
                  <SettingRow
                    title="Токен доступа «МойСклад»"
                    description="Используется для экспорта счетов в API 1.2"
                    controls={
                      <>
                        {moyskladStatus?.is_set ? (
                          <Badge variant="success" pill icon={<Check size={13} strokeWidth={2.25} />}>
                            {secretStatusLabel(moyskladStatus.updated_at)}
                          </Badge>
                        ) : (
                          <Badge variant="danger" pill icon={<CircleAlert size={13} strokeWidth={2} />}>
                            Не установлен
                          </Badge>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditMoyskladOpen(!editMoyskladOpen);
                            setRawMoyskladInput("");
                          }}
                        >
                          {editMoyskladOpen ? "Отмена" : "Изменить"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={testingMs}
                          icon={<Plug size={14} strokeWidth={1.75} />}
                          onClick={() => void handleTestMoysklad()}
                          title="Проверить соединение"
                        >
                          Проверить
                        </Button>
                      </>
                    }
                  />

                  {moyskladSaveMsg && (
                    <p className="inline-msg inline-msg--success">
                      <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                      {moyskladSaveMsg}
                    </p>
                  )}

                  {msTestResult && (
                    <p className="inline-msg inline-msg--accent">{msTestResult}</p>
                  )}

                  {editMoyskladOpen && (
                    <form className="secret-form" onSubmit={handleSaveMoysklad}>
                      <div className="secret-form__field">
                        <Input
                          type="password"
                          autoComplete="off"
                          label="Новое значение токена МойСклад"
                          requiredMark
                          placeholder="Вставьте токен..."
                          value={rawMoyskladInput}
                          onChange={(e) => setRawMoyskladInput(e.target.value)}
             hint="Поле очищается сразу же после записи в системное хранилище"
                          icon={<KeyRound size={15} strokeWidth={1.75} />}
                          required
                          autoFocus
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        loading={savingMoysklad}
                        disabled={!rawMoyskladInput.trim()}
                        icon={<Save size={16} strokeWidth={1.75} />}
                      >
                        Записать в хранилище
                      </Button>
                    </form>
                  )}
                </div>

                <hr className="divider" />

                {/* API-ключ Gemini */}
                <div className="stack stack--tight">
                  <SettingRow
                    title="API-ключ Google Gemini"
                      description="Используется для разбора текста заявки и подбора кандидатов из каталога"
                    controls={
                      <>
                        {geminiStatus?.is_set ? (
                          <Badge variant="success" pill icon={<Check size={13} strokeWidth={2.25} />}>
                            {secretStatusLabel(geminiStatus.updated_at)}
                          </Badge>
                        ) : (
                          <Badge variant="danger" pill icon={<CircleAlert size={13} strokeWidth={2} />}>
                            Не установлен
                          </Badge>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditGeminiOpen(!editGeminiOpen);
                            setRawGeminiInput("");
                          }}
                        >
                          {editGeminiOpen ? "Отмена" : "Изменить"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={testingGm}
                          icon={<Plug size={14} strokeWidth={1.75} />}
                          onClick={() => void handleTestGemini()}
                          title="Проверить соединение"
                        >
                          Проверить
                        </Button>
                      </>
                    }
                  />

                  {geminiSaveMsg && (
                    <p className="inline-msg inline-msg--success">
                      <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                      {geminiSaveMsg}
                    </p>
                  )}

                  {gmTestResult && (
                    <p className="inline-msg inline-msg--accent">{gmTestResult}</p>
                  )}

                  {editGeminiOpen && (
                    <form className="secret-form" onSubmit={handleSaveGemini}>
                      <div className="secret-form__field">
                        <Input
                          type="password"
                          autoComplete="off"
                          label="Новое значение ключа Gemini API"
                          requiredMark
                          placeholder="AIzaSy..."
                          value={rawGeminiInput}
                          onChange={(e) => setRawGeminiInput(e.target.value)}
                          hint="Ключ хранится только в системном хранилище Windows"
                          icon={<KeyRound size={15} strokeWidth={1.75} />}
                          required
                          autoFocus
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        loading={savingGemini}
                        disabled={!rawGeminiInput.trim()}
                        icon={<Save size={16} strokeWidth={1.75} />}
                      >
                        Записать в хранилище
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "integrations" && (
          <div className="stack">
            {/* 2. Поставщик и цены (§7.6, §7.10 ТЗ) */}
            <Card
              title={
                <CardTitle icon={<Tags size={18} strokeWidth={1.75} />}>
                  Поставщик и цены по умолчанию
                </CardTitle>
              }
            >
              <div className="grid-2">
                <Select
                  label="Поставщик по умолчанию"
                  value={settings.default_supplier}
                  onChange={(e) => setSettings({ ...settings, default_supplier: e.target.value })}
                >
                  <option value="Петрович">Петрович (основной розничный)</option>
                  <option value="СТК Строй">СТК Строй</option>
                  <option value="СибЭлКом">СибЭлКом</option>
                  <option value="Knauf-dom">Knauf-dom</option>
                  <option value="НОМЕНКЛАТУРА">НОМЕНКЛАТУРА</option>
                </Select>

                <Select
         label="Режим автовыбора поставщика в заявках"
                  value={settings.supplier_selection_mode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      supplier_selection_mode: e.target
                        .value as AppSettings["supplier_selection_mode"],
                    })
                  }
                >
                  <option value="min_purchase">
                    Минимальная закупка (максимальная маржа)
                  </option>
                  <option value="default_supplier">Поставщик по умолчанию</option>
                  <option value="retail_priority">Розничный приоритет</option>
                </Select>

                <Select
                  label="Порог совпадения ИИ для массового подтверждения, %"
                  value={String(settings.confidence_threshold_percent)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      confidence_threshold_percent: parseInt(e.target.value, 10),
                    })
                  }
                >
                  <option value="85">85% и выше</option>
                  <option value="90">90% и выше (рекомендуется)</option>
                  <option value="95">95% и выше (строгий отбор)</option>
                </Select>

                <Select
                  label="Тип цены по умолчанию"
                  value={settings.default_price_type}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      default_price_type: e.target.value as AppSettings["default_price_type"],
                    })
                  }
                >
                  <option value="retail">Розничная цена (продажа)</option>
                  <option value="purchase">Закупочная цена (себестоимость)</option>
                </Select>
              </div>
            </Card>

            {/* 3. Интеграция с сервисом «МойСклад» (§7.10 ТЗ) */}
            <Card
              title={
                <CardTitle icon={<Store size={18} strokeWidth={1.75} />}>
                  Параметры интеграции с «МойСклад»
                </CardTitle>
              }
            >
              <div className="grid-2 grid-2--wide-first">
                <Input
                  label="URL API «МойСклад»"
                  mono
                  value={settings.moysklad_api_url}
                  onChange={(e) => setSettings({ ...settings, moysklad_api_url: e.target.value })}
                />
                <Input
                  label="Ставка НДС по умолчанию"
                  value={settings.moysklad_vat_rate}
                  onChange={(e) => setSettings({ ...settings, moysklad_vat_rate: e.target.value })}
                />
                <Input
                  label="Организация (продавец)"
                  value={settings.moysklad_organization}
                  onChange={(e) =>
                    setSettings({ ...settings, moysklad_organization: e.target.value })
                  }
                />
                <Input
                  label="Склад по умолчанию"
                  value={settings.moysklad_warehouse}
                  onChange={(e) => setSettings({ ...settings, moysklad_warehouse: e.target.value })}
                />
              </div>
            </Card>
          </div>
        )}

        {activeTab === "ui" && (
          <div className="stack">
            {/* 4. Настройки интерфейса (§5.1, §5.3, §7.10 ТЗ) */}
            <Card
              title={
                <CardTitle icon={<SlidersHorizontal size={18} strokeWidth={1.75} />}>
                  Интерфейс и отображение таблиц
                </CardTitle>
              }
            >
              <div className="stack">
                <SettingRow
                  title="Тема оформления"
         description="Тема не настраивается. Приложение работает исключительно в светлой теме."
                  controls={
                    <Badge variant="neutral" pill>
                      Только светлая (Inter, WCAG AA 5.1:1)
                    </Badge>
                  }
                />

                <hr className="divider" />

                <SettingRow
                  title="Плотность таблиц номенклатуры"
                  description="Высота строки: стандартная (40 px) / компактная (32 px)"
                  controls={
                    <>
                      <Button
                        variant={preferences.tableDensity === "standard" ? "primary" : "secondary"}
                        size="sm"
                        aria-pressed={preferences.tableDensity === "standard"}
                        onClick={() => handleDensityChange("standard")}
                      >
                        Стандартная (40px)
                      </Button>
                      <Button
                        variant={preferences.tableDensity === "compact" ? "primary" : "secondary"}
                        size="sm"
                        aria-pressed={preferences.tableDensity === "compact"}
                        onClick={() => handleDensityChange("compact")}
                      >
                        Компактная (32px)
                      </Button>
                    </>
                  }
                />

                <hr className="divider" />

                <SettingRow
                  title="Колонки каталога"
                  description="Сброс индивидуального набора видимых колонок к исходному состоянию"
                  controls={
                    <Button variant="secondary" size="sm" onClick={handleResetColumns}>
                      Сбросить порядок колонок
                    </Button>
                  }
                />
              </div>
            </Card>
          </div>
        )}

        {activeTab === "data" && (
          <div className="stack">
            {/* 5. Данные и хранилище (§7.10 ТЗ) */}
            <Card
              title={
                <CardTitle icon={<Database size={18} strokeWidth={1.75} />}>
                  Данные и локальное хранилище
                </CardTitle>
              }
            >
              <div className="stack">
                <div className="grid-2 grid-2--wide-first">
                  <Input
                    label="Путь к файлу базы данных SQLite"
                    mono
                    value={settings.database_path}
                    onChange={(e) => setSettings({ ...settings, database_path: e.target.value })}
                  />
                  <Input
                    label="Срок хранения изображений (дней)"
                    type="number"
                    value={settings.images_retention_days}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        images_retention_days: parseInt(e.target.value, 10) || 30,
                      })
                    }
                  />
                </div>

                <SettingRow
                  title="Локальные изображения клиентских заявок"
                  description={
                    <>
                      Удаление временных сканов и фото из каталога {settings.images_path}
                      {clearImagesResult && (
                        <span className="inline-msg inline-msg--success inline-msg--block">
                          <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                          {clearImagesResult}
                        </span>
                      )}
                    </>
                  }
                  controls={
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Trash size={14} strokeWidth={1.75} />}
                      onClick={() => setClearImagesDialogOpen(true)}
                    >
                      Удалить локальные фото
                    </Button>
                  }
                />
              </div>
            </Card>

            {/* 6. Журналирование и аудит (§7.10, §7.11 ТЗ) */}
            <Card
              title={
                <CardTitle icon={<FileText size={18} strokeWidth={1.75} />}>
                  Журналирование и системный журнал
                </CardTitle>
              }
            >
              <SettingRow
                title="Уровень логирования"
                description={`Текущий уровень: ${settings.log_level}. Журнал не содержит конфиденциальных секретов.`}
                controls={
                  <>
                    <Select
                      aria-label="Уровень логирования"
                      value={settings.log_level}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          log_level: e.target.value as AppSettings["log_level"],
                        })
                      }
                    >
                      <option value="DEBUG">DEBUG (подробный)</option>
                      <option value="INFO">INFO (стандартный)</option>
                      <option value="WARNING">WARNING</option>
                      <option value="ERROR">ERROR (только ошибки)</option>
                    </Select>
                    <Link to="/logs" className="link-plain">
                      <Button variant="secondary" size="sm" icon={<FileText size={14} strokeWidth={1.75} />}>
                        Открыть системный журнал
                      </Button>
                    </Link>
                  </>
                }
              />
            </Card>
          </div>
        )}
      </div>

      {/* Нижняя кнопка сохранения общих настроек */}
      <div className="save-bar">
        <div role="status">
          {settingsSavedSuccess ? (
            <span className="inline-msg inline-msg--success inline-msg--strong">
              <Check size={15} strokeWidth={2.25} aria-hidden="true" />
              Настройки сохранены
            </span>
          ) : (
            <span className="text-xs text-muted">Сохраняет параметры всех вкладок, кроме ключей доступа</span>
          )}
        </div>
        <Button
          variant="primary"
          icon={<Save size={16} strokeWidth={1.75} />}
          loading={savingSettings}
          onClick={() => void handleSaveAppSettings()}
        >
          Сохранить настройки
        </Button>
      </div>

      {/* Диалог подтверждения очистки фото */}
      <ConfirmDialog
        open={clearImagesDialogOpen}
        title="Очистка локальных изображений"
        message="Будут удалены все локально сохранённые фотографии и сканы заявок старше заданного срока хранения. Сами заявки и распознанные строки останутся в базе. Продолжить?"
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={clearingImages}
        onConfirm={handleConfirmClearImages}
        onCancel={() => setClearImagesDialogOpen(false)}
      />
    </div>
  );
};
