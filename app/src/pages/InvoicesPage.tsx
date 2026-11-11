import { toast } from "sonner";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { date as formatDate, money, percent } from "../lib/format";
import {
  ExternalLink,
  Search,
  RefreshCw,
  Download,
  Eye,
  Receipt,
  FileText,
  Send,
  CircleCheck,
  Truck,
  CircleAlert,
  FilterX,
} from "lucide-react";
import { apiClient } from "../api/client";
import type { Invoice } from "../types/models";
import { DataTable, type ColumnDef } from "../components/common/DataTable";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/common/Button";
import { IconButton } from "../components/common/IconButton";
import { Badge, type BadgeVariant } from "../components/common/Badge";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { InvoiceDetailDrawer } from "../components/invoices/InvoiceDetailDrawer";
import { errorText } from "../lib/errors";

/** Карта статуса документа «МойСклад» → визуального представления. */
const INVOICE_STATUS: Record<
  Invoice["status"],
  { label: string; variant: BadgeVariant; icon: React.ReactNode }
> = {
  created: { label: "Создан", variant: "accent", icon: <Send size={13} strokeWidth={1.75} /> },
  paid: { label: "Оплачен", variant: "success", icon: <CircleCheck size={13} strokeWidth={1.75} /> },
  shipped: { label: "Отгружен", variant: "violet", icon: <Truck size={13} strokeWidth={1.75} /> },
  error: { label: "Ошибка отправки", variant: "danger", icon: <CircleAlert size={13} strokeWidth={1.75} /> },
  draft: { label: "Черновик", variant: "neutral", icon: <FileText size={13} strokeWidth={1.75} /> },
};

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Фильтры
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "draft" | "created" | "error" | "paid" | "shipped">("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [lossOnly, setLossOnly] = useState(false);

  // Детали счёта
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [requestNumbers, setRequestNumbers] = useState<Record<number, string>>({});

  useEffect(() => {
    // Номер заявки для колонки «Источник»: внутренний ID оператору ничего не говорит.
    apiClient.getRequests()
      .then((res) => setRequestNumbers(Object.fromEntries(res.data.map((r) => [r.request_id, r.doc_number]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getInvoices();
      setInvoices(res.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryInvoice = async (invoiceId: number) => {
    try {
      setRetryingId(invoiceId);
      const res = await apiClient.retryInvoice(invoiceId);
      // Обновляем список счетов
      setInvoices((prev) => prev.map((inv) => (inv.invoice_id === invoiceId ? res.data : inv)));
      if (activeInvoice?.invoice_id === invoiceId) {
        setActiveInvoice(res.data);
      }
    } catch (err) {
      toast.error(`Ошибка отправки повторной отправки счёта: ${errorText(err)}`);
    } finally {
      setRetryingId(null);
    }
  };

  // Список уникальных контрагентов для фильтра
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      if (inv.client_name) set.add(inv.client_name);
    });
    return Array.from(set);
  }, [invoices]);

  // Фильтрация данных на клиенте
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (selectedStatus !== "all" && inv.status !== selectedStatus) {
        return false;
      }
      if (selectedClient !== "all" && inv.client_name !== selectedClient) {
        return false;
      }
      if (fromDate && inv.doc_date < fromDate) return false;
      if (toDate && inv.doc_date > toDate) return false;
      if (lossOnly) {
        const margin = inv.actual_margin ?? (inv.sum_without_vat && inv.sum_purchase != null
          ? ((inv.sum_without_vat - inv.sum_purchase) / inv.sum_without_vat) * 100
          : undefined);
        if (margin == null || margin >= 0) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNum = inv.number.toLowerCase().includes(q);
        const matchesClient = inv.client_name?.toLowerCase().includes(q) || false;
        const matchesComment = inv.comment?.toLowerCase().includes(q) || false;
        if (!matchesNum && !matchesClient && !matchesComment) {
          return false;
        }
      }
      return true;
    });
  }, [invoices, selectedStatus, selectedClient, searchQuery, fromDate, toDate, lossOnly]);

  // Экспорт в CSV (UTF-8 BOM)
  const handleExportCsv = () => {
    const headers = [
      "Номер счёта",
      "Дата",
      "Контрагент",
      "Позиций",
      "Сумма с НДС",
      "Себестоимость",
      "Статус",
      "ID заявки",
      "Ссылка МойСклад",
      "Комментарий",
    ];

    const rows = filteredInvoices.map((inv) => [
      inv.number,
      inv.doc_date,
      `"${(inv.client_name || "").replace(/"/g, '""')}"`,
      inv.positions_count,
      // CSV: машинный формат с точкой, чтобы файл корректно читался импортом
      inv.sum_total.toFixed(2),
      (inv.sum_purchase || 0).toFixed(2),
      inv.status,
      inv.request_id,
      inv.moysklad_href || "",
      `"${(inv.comment || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `invoices_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      id: "number",
      header: "Номер счёта",
      width: 110,
      cell: (inv) => (
        <button
          type="button"
          className="catalog-material-button tabular-nums text-accent text-medium"
          aria-label={`Открыть счёт ${inv.number}`}
          onClick={() => {
            setActiveInvoice(inv);
            setDrawerOpen(true);
          }}
        >
          {inv.number}
        </button>
      ),
    },
    {
      id: "doc_date",
      header: "Дата",
      width: 95,
      cell: (inv) => <span className="text-muted">{formatDate(inv.doc_date)}</span>,
    },
    {
      id: "client_name",
      header: "Контрагент",
      width: 160,
      cell: (inv) => (
        <div className="truncate" title={inv.client_name || undefined}>
          {inv.client_name || "—"}
        </div>
      ),
    },
    {
      id: "positions",
      header: "Позиций",
      width: 80,
      align: "right",
      cell: (inv) => <span className="tabular-nums">{inv.positions_count}</span>,
    },
    {
      id: "sum_total",
      header: "Сумма счёта",
      width: 125,
      align: "right",
      cell: (inv) => (
        <span className="tabular-nums mono--bold">
          {money(inv.sum_total)}
        </span>
      ),
    },
    {
      id: "margin",
      header: "Себест. / Маржа",
      width: 135,
      align: "right",
      cell: (inv) => {
        const purchase = inv.sum_purchase;
        const net = inv.sum_without_vat;
        const marginPct = inv.actual_margin ?? (net && purchase != null ? (net - purchase) / net * 100 : undefined);
        return (
          <div className="text-xs dt__right">
            <span className="text-muted">{money(purchase)}</span>
            <span className="text-muted"> · </span>
            <span className={`inline-msg ${marginPct != null && marginPct < 0 ? "inline-msg--danger" : "inline-msg--success"}`}>
              {percent(marginPct)}
            </span>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Статус «МойСклад»",
      width: 150,
      cell: (inv) => {
        const s = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft;
        return (
          <Badge variant={s.variant} icon={s.icon} pill title={inv.status === "error" ? inv.error_text || undefined : undefined}>
            {s.label}
          </Badge>
        );
      },
    },
    {
      id: "request",
      header: "Заявка",
      width: 120,
      cell: (inv) => {
        const number = requestNumbers[inv.request_id] ?? `№ ${inv.request_id}`;
        return (
          <Link to={`/requests/${inv.request_id}`} className="truncate" title={`Открыть заявку ${number}`}>
            {number}
          </Link>
        );
      },
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      width: 168,
      align: "right",
      sticky: true,
      cell: (inv) => (
        <div className="row row--end">
          {inv.status === "error" ? (
            <Button
              variant="primary"
              size="sm"
              loading={retryingId === inv.invoice_id}
              icon={<RefreshCw size={14} />}
              onClick={() => handleRetryInvoice(inv.invoice_id)}
       title="Повторить отправку документа без создания дубля"
            >
              Повторить
            </Button>
          ) : inv.moysklad_href ? (
            <a href={inv.moysklad_href} target="_blank" rel="noreferrer" className="ext-link">
              В МойСклад <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : null}

          <IconButton
            size="sm"
            icon={<Eye size={14} />}
            onClick={() => {
              setActiveInvoice(inv);
              setDrawerOpen(true);
            }}
            tooltip={`Состав счёта ${inv.number}`}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="stack stack--fill">
      {/* Шапка страницы */}
      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">
            Счета покупателям
          </h1>
          <p className="page__subtitle">
            Реестр документов, выгруженных в сервис «МойСклад» с контролем дублирования
          </p>
        </div>

        <div className="page__actions">
          <Button variant="primary" onClick={() => navigate("/requests/new?mode=catalog")}>
            Создать счёт
          </Button>
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={handleExportCsv}
            disabled={filteredInvoices.length === 0}
          >
            Экспорт (CSV)
          </Button>
          <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={loadInvoices}>
            Обновить
          </Button>
        </div>
      </header>

      {/* Панель фильтров */}
      <div className="filter-bar">
        <label className="filter-field filter-field--wide">
          <span className="filter-field__label">Поиск</span>
          <Input
            placeholder="Номер или контрагент…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={15} strokeWidth={1.75} />}
            aria-label="Поиск по реестру счетов"
          />
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Контрагент</span>
          <Select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            aria-label="Фильтр по контрагенту"
          >
            <option value="all">Все ({uniqueClients.length})</option>
            {uniqueClients.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </Select>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Период с</span>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Период с" />
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Период до</span>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Период до" />
        </label>

        <div className="filter-field filter-field--span3">
          <span className="filter-field__label">Статус</span>
          <div className="filter-field__chips">
            {[
              { id: "all", label: "Все" },
              { id: "draft", label: "Черновик" },
              { id: "created", label: "Создан" },
              { id: "paid", label: "Оплачен" },
              { id: "error", label: "Ошибка" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                className="chip"
                aria-pressed={selectedStatus === st.id}
                onClick={() => setSelectedStatus(st.id as typeof selectedStatus)}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-field filter-field--actions">
          <span className="filter-field__label">Убыточность</span>
          <div className="filter-field__chips">
            <button
              type="button"
              className="chip"
              aria-pressed={lossOnly}
              onClick={() => setLossOnly((value) => !value)}
            >
              Только убыточные
            </button>
            {(searchQuery || selectedStatus !== "all" || selectedClient !== "all" || fromDate || toDate || lossOnly) && (
              <Button
                variant="ghost"
                size="sm"
                icon={<FilterX size={14} strokeWidth={1.75} />}
                onClick={() => {
                  setSearchQuery("");
                  setSelectedStatus("all");
                  setSelectedClient("all");
                  setFromDate("");
                  setToDate("");
                  setLossOnly(false);
                }}
              >
                Сбросить
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Таблица счетов */}
      <div className="grow grow--fill">
        {error ? (
          <ErrorState message="Не удалось загрузить реестр счетов" details={error} onRetry={loadInvoices} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredInvoices}
            rowKey={(inv) => inv.invoice_id}
            onRowClick={(inv) => {
              setActiveInvoice(inv);
              setDrawerOpen(true);
            }}
            loading={loading}
            emptyState={
              <EmptyState
                tone="accent"
                compact
                icon={<Receipt size={26} strokeWidth={1.5} />}
                title="Счета не найдены"
                description="По заданным фильтрам нет созданных документов, либо ни один счёт ещё не выгружался в «МойСклад»."
                actionLabel={
                  searchQuery || selectedStatus !== "all" || selectedClient !== "all"
                    ? "Сбросить фильтры"
                    : undefined
                }
                onAction={() => {
                  setSearchQuery("");
                  setSelectedStatus("all");
                  setSelectedClient("all");
                  setFromDate("");
                  setToDate("");
                  setLossOnly(false);
                }}
              />
            }
          />
        )}
      </div>

      {/* Шторка подробного просмотра состава документа */}
      <InvoiceDetailDrawer
        invoice={activeInvoice}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRetry={handleRetryInvoice}
        retrying={retryingId === activeInvoice?.invoice_id}
        onOpenSource={
          activeInvoice
            ? () => {
                setDrawerOpen(false);
                navigate(`/requests/${activeInvoice.request_id}`);
              }
            : undefined
        }
      />
    </div>
  );
};
