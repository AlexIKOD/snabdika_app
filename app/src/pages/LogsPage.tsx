import { toast } from "sonner";
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Trash, Download, Copy, Code, Check, FilterX } from "lucide-react";
import { apiClient } from "../api/client";
import type { LogEntry } from "../types/models";
import { DataTable, type ColumnDef } from "../components/common/DataTable";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { IconButton } from "../components/common/IconButton";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { TableSkeleton } from "../components/common/Skeleton";
import { dateTime } from "../lib/format";
import { errorText } from "../lib/errors";

type LevelFilter = "all" | "INFO" | "WARNING" | "ERROR";

const LEVEL_TONE: Record<string, { variant: "neutral" | "accent" | "warning" | "danger"; label: string }> = {
  DEBUG: { variant: "neutral", label: "Отладка" },
  INFO: { variant: "neutral", label: "Инфо" },
  WARNING: { variant: "warning", label: "Внимание" },
  ERROR: { variant: "danger", label: "Ошибка" },
};

const CATEGORY_LABEL: Record<string, string> = {
  IMPORT: "Импорт", AI_MATCHING: "ИИ-сопоставление", MATCHING: "Сопоставление", ALIASES: "Синонимы",
  CATALOG: "Каталог", DATABASE: "База данных", MERGE: "Объединение", MOYSKLAD_API: "МойСклад",
  REQUESTS: "Заявки", SYSTEM: "Система",
};
const categoryLabel = (code: string) => CATEGORY_LABEL[code] ?? code;

/** Минимальная подсветка JSON: ключи, строки, числа, литералы. */
const highlightJson = (json: string): React.ReactNode[] => {
  const pattern = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(json)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index));
    }
    const token = match[0];
    const isKey = /:$/.test(token);
    const isString = /^"/.test(token);
    const color = isKey
      ? "#0B4A8F"
      : isString
      ? "#0F5132"
      : /^(true|false|null)$/.test(token)
      ? "#9333EA"
      : "#B45309";

    nodes.push(
      <span key={key++} style={{ color, fontWeight: isKey ? 600 : 400 }}>
        {token}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < json.length) nodes.push(json.slice(lastIndex));
  return nodes;
};

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<LevelFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [activeLog, setActiveLog] = useState<LogEntry | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getLogs();
      setLogs(res.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      setClearing(true);
      await apiClient.clearLogs();
      setLogs([]);
      toast.success("Системный журнал очищен");
    } catch (err) {
      toast.error(`Ошибка очистки журнала: ${errorText(err)}`);
    } finally {
      setClearing(false);
      setClearDialogOpen(false);
    }
  };

  const handleCopyLog = (log: LogEntry) => {
    const text = `[${log.created_at}] [${log.level}] [${log.category}] ${log.message}${
      log.payload_json ? `\nPayload: ${log.payload_json}` : ""
    }`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.log_id);
    toast.success("Запись скопирована в буфер обмена");
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportLogs = () => {
    const headers = ["ID", "Время", "Уровень", "Категория", "Сообщение", "Payload"];
    const rows = filteredLogs.map((l) => [
      l.log_id,
      l.created_at,
      l.level,
      l.category,
      `"${l.message.replace(/"/g, '""')}"`,
      `"${(l.payload_json || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `app_logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.category) set.add(l.category);
    });
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((l) => {
        if (selectedLevel !== "all" && l.level !== selectedLevel) return false;
        if (selectedCategory !== "all" && l.category !== selectedCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesMsg = l.message.toLowerCase().includes(q);
          const matchesCat = l.category.toLowerCase().includes(q);
          const matchesPayload = l.payload_json?.toLowerCase().includes(q) || false;
          if (!matchesMsg && !matchesCat && !matchesPayload) return false;
        }
        return true;
      }),
    [logs, selectedLevel, selectedCategory, searchQuery]
  );

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedLevel("all");
    setSelectedCategory("all");
  };

  const hasFilters = Boolean(searchQuery) || selectedLevel !== "all" || selectedCategory !== "all";

  const columns: ColumnDef<LogEntry>[] = [
    {
      id: "created_at",
      header: "Время",
      width: 150,
      cell: (l) => (
        <span className="tabular-nums text-xs text-muted">
          {dateTime(l.created_at)}
        </span>
      ),
    },
    {
      id: "level",
      header: "Уровень",
      width: 100,
      cell: (l) => {
        const tone = LEVEL_TONE[l.level] ?? LEVEL_TONE.INFO;
        return (
          <Badge variant={tone.variant}>{tone.label}</Badge>
        );
      },
    },
    {
      id: "category",
      header: "Категория",
      width: 150,
      cell: (l) => (
        <span className="text-sm">{categoryLabel(l.category)}</span>
      ),
    },
    {
      id: "message",
      header: "Сообщение журнала",
      cell: (l) => (
        <div className="text-sm wrap-anywhere">{l.message}</div>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      width: 88,
      align: "right",
      cell: (l) => (
        <div className="row row--end">
          {l.payload_json && (
            <IconButton
              size="sm"
              icon={<Code size={14} strokeWidth={1.75} />}
              onClick={() => {
                setActiveLog(l);
                setDetailModalOpen(true);
              }}
              tooltip="Подробности события"
            />
          )}
          <IconButton
            size="sm"
            icon={copiedId === l.log_id ? <Check size={14} strokeWidth={1.9} /> : <Copy size={14} strokeWidth={1.75} />}
            onClick={() => handleCopyLog(l)}
            tooltip={copiedId === l.log_id ? "Скопировано" : "Скопировать запись"}
          />
        </div>
      ),
    },
  ];

  const formattedPayload = useMemo(() => {
    if (!activeLog?.payload_json) return "";
    try {
      return JSON.stringify(JSON.parse(activeLog.payload_json), null, 2);
    } catch {
      return activeLog.payload_json;
    }
  }, [activeLog]);

  return (
    <div className="stack stack--fill">
      {/* Шапка */}
      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">
            Системный журнал
          </h1>
          <p className="page__subtitle">
            Аудит событий сопоставления, интеграции с «МойСклад» и состояния системы. Секреты не
            журналируются.
          </p>
        </div>

        <div className="page__actions">
          <Button
            variant="secondary"
            icon={<Download size={15} strokeWidth={1.75} />}
            onClick={handleExportLogs}
            disabled={filteredLogs.length === 0}
          >
            Экспорт (CSV)
          </Button>
          <Button
            variant="danger-ghost"
            icon={<Trash size={15} strokeWidth={1.75} />}
            onClick={() => setClearDialogOpen(true)}
            disabled={logs.length === 0}
          >
            Очистить
          </Button>
          <Button variant="ghost" icon={<RefreshCw size={15} strokeWidth={1.75} />} onClick={loadLogs}>
            Обновить
          </Button>
        </div>
      </header>

      {/* Панель фильтров */}
      <div className="toolbar">
        <div className="grow-basis">
          <Input
            placeholder="Поиск по тексту или категории..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={15} strokeWidth={1.75} />}
            aria-label="Поиск по журналу"
          />
        </div>

        {/* Фильтр уровней */}
        <div className="row row--tightest">
          {(
            [
              { id: "all", label: "Все уровни" },
              { id: "INFO", label: "Инфо" },
              { id: "WARNING", label: "Внимание" },
              { id: "ERROR", label: "Ошибка" },
            ] as { id: LevelFilter; label: string }[]
          ).map((lvl) => (
            <button
              key={lvl.id}
              type="button"
              className="chip"
              aria-pressed={selectedLevel === lvl.id}
              onClick={() => setSelectedLevel(lvl.id)}
            >
              {lvl.label}
            </button>
          ))}
        </div>

        {/* Категории */}
        <div className="minw-180">
          {uniqueCategories.length > 0 && (
            <Select
              aria-label="Категория"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: "all", label: "Все категории" },
                ...uniqueCategories.map((c) => ({ value: c, label: categoryLabel(c) })),
              ]}
            />
          )}
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" icon={<FilterX size={14} strokeWidth={1.75} />} onClick={resetFilters}>
            Сбросить
          </Button>
        )}
      </div>

      {/* Таблица */}
      <div className="grow grow--fill">
        {loading ? (
          <TableSkeleton rows={10} />
        ) : error ? (
          <ErrorState message="Ошибка загрузки журнала" details={error} onRetry={loadLogs} />
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={<Code size={26} strokeWidth={1.5} />}
            title="Записи журнала не найдены"
            description="По заданным фильтрам нет системных сообщений. Измените условия отбора или сбросьте фильтры."
            actionLabel={hasFilters ? "Сбросить фильтры" : undefined}
            onAction={hasFilters ? resetFilters : undefined}
          />
        ) : (
          <DataTable columns={columns} data={filteredLogs} rowKey={(l) => l.log_id} />
        )}
      </div>

      {/* Модалка просмотра JSON payload */}
      <Modal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        title="Детали записи журнала"
        description={`Событие №${activeLog?.log_id} · ${categoryLabel(activeLog?.category ?? "")}`}
        maxWidth="620px"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy size={14} strokeWidth={1.75} />}
              onClick={() => activeLog && handleCopyLog(activeLog)}
            >
              Скопировать JSON
            </Button>
            <Button variant="primary" size="sm" onClick={() => setDetailModalOpen(false)}>
              Закрыть
            </Button>
          </>
        }
      >
        {activeLog && (
          <div className="stack stack--tight">
            <div className="text-medium">{activeLog.message}</div>
            <pre className="json-view">{highlightJson(formattedPayload)}</pre>
          </div>
        )}
      </Modal>

      {/* Диалог подтверждения очистки */}
      <ConfirmDialog
        open={clearDialogOpen}
        title="Очистка системного журнала"
        message="Вы действительно хотите удалить все записи системного журнала? Это действие необратимо."
        confirmLabel="Очистить журнал"
        cancelLabel="Отмена"
        variant="danger"
        loading={clearing}
        onConfirm={handleClearLogs}
        onCancel={() => setClearDialogOpen(false)}
      />
    </div>
  );
};

