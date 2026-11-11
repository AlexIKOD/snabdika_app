import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, ClipboardPaste, PackageSearch, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../api/client";
import { Button } from "../components/common/Button";
import { Input, Textarea } from "../components/common/Input";
import { CatalogCart } from "../components/requests/CatalogCart";
import { errorText } from "../lib/errors";

type Mode = "request" | "catalog" | "ai";

const MODES: { id: Mode; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    id: "request",
    label: "Распознать заявку",
    icon: <ClipboardPaste size={15} strokeWidth={1.75} />,
    hint: "Вставьте текст заявки клиента из почты, WhatsApp или Telegram",
  },
  {
    id: "catalog",
    label: "Собрать из каталога",
    icon: <PackageSearch size={15} strokeWidth={1.75} />,
    hint: "Найдите товары во внутренней базе и соберите состав счёта",
  },
  {
    id: "ai",
    label: "ИИ-подбор по описанию",
    icon: <Bot size={15} strokeWidth={1.75} />,
    hint: "Опишите потребность свободным текстом, товары подберёт сопоставление",
  },
];

/** Номер документа по умолчанию: префикс, дата и три случайные цифры. */
function nextDocNumber(prefix: string) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${d.getFullYear()}-${mm}${dd}/${rnd}`;
}

export const RequestCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => {
    const requested = searchParams.get("mode");
    return requested === "catalog" || requested === "ai" ? requested : "request";
  });
  const [clientName, setClientName] = useState("");
  const [docNumber, setDocNumber] = useState(() => nextDocNumber("ЗК"));
  const [rawText, setRawText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setDocNumber(nextDocNumber(next === "ai" ? "ИИ" : "ЗК"));
  };

  const requiresClient = mode === "request";
  // Контрагент нужен только счёту и там всё равно выбирается из МойСклад, поэтому здесь он не обязателен.
  const canSubmit = rawText.trim().length > 0;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const res = await apiClient.createRequest({
        client_name: requiresClient ? clientName.trim() : "",
        doc_number: docNumber.trim(),
        raw_text: rawText.trim(),
        files: [],
      });
      navigate(`/requests/${res.data.request_id}`);
    } catch (err) {
      toast.error(`Не удалось создать заявку: ${errorText(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack">
      <div className="detail-topbar">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} strokeWidth={1.5} />}
          onClick={() => navigate("/requests")}
        >
          Назад к списку заявок
        </Button>
      </div>

      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">Новая заявка</h1>
          <p className="page__subtitle">
            Заявка клиента, сборка из каталога или ИИ-подбор — результат один: счёт покупателю
          </p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Способ создания заявки">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={mode === item.id}
            onClick={() => switchMode(item.id)}
          >
            <span className="tab__icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel panel--spaced stack">
        <p className="text-muted text-sm">{MODES.find((item) => item.id === mode)?.hint}</p>

        {mode === "catalog" ? (
          <CatalogCart onCreated={(requestId) => navigate(`/requests/${requestId}`)} />
        ) : (
          <form className="form-stack" onSubmit={(e) => void handleSubmit(e)}>
            {requiresClient && (
              <div className="form-grid form-grid--2-1">
                <Input
                  label="Контрагент / Клиент"
                  placeholder="ООО «Строй-Трест» или ИП Иванов"
                  hint="Необязательно: имя клиента подставится в поиск контрагента при выставлении счёта."
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  autoFocus
                />
                <Input
                  label="Номер заявки"
                  mono
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                />
              </div>
            )}

            {mode === "ai" && (
              <Input
                label="Номер заявки"
                mono
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
              />
            )}

            <Textarea
              label={requiresClient ? "Текст заявки (вставка из WhatsApp, почты или Telegram)" : "Описание потребности"}
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={
                requiresClient
                  ? `Вставьте список материалов, например:\n1. ОСП плита 9мм 1250х2500 - 40 листов\n2. Ротбанд кнауф 30 кг 20 мешков\n3. ВВГнг-LS 3х2.5 бухта 100м`
                  : `Опишите, что нужно, например:\nсаморезы по дереву 3.5х35, около 1000 шт\nпрофиль направляющий 28х27, 10 шт`
              }
              hint="Каждая непустая строка станет позицией заявки."
            />

            <p className="text-muted text-xs">
              Распознавание файлов пока недоступно. Скопируйте список материалов из документа в текст.
            </p>

            <div className="row row--end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate("/requests")}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                icon={<Plus size={16} strokeWidth={1.75} />}
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
              >
                {requiresClient ? "Создать заявку" : "Создать заявку и подобрать"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
