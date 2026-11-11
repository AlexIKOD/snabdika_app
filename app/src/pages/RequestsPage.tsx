import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Inbox, Trash } from "lucide-react";
import { apiClient } from "../api/client";
import type { ClientRequest } from "../types/models";
import { DataTable, type ColumnDef } from "../components/common/DataTable";
import { Button } from "../components/common/Button";
import { RequestStatusBadge } from "../components/requests/requestMeta";
import { readyCount, requestSaleSum } from "../lib/requestMeta";
import { IconButton } from "../components/common/IconButton";
import { Badge, type BadgeVariant } from "../components/common/Badge";
import { TableSkeleton } from "../components/common/Skeleton";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { toast } from "sonner";
import { date as formatDate, money } from "../lib/format";
import { errorText } from "../lib/errors";

/** Источник документа: каталог и ИИ-подбор различаются по служебным полям. */
function sourceOf(request: ClientRequest): { label: string; variant: BadgeVariant } {
  if (request.source === "catalog_invoice") return { label: "Каталог", variant: "violet" };
  // shortcut: ИИ-документ распознаётся по префиксу номера, пока бэкенд не хранит источник; добавить поле, когда появится.
  if (request.doc_number.startsWith("ИИ")) return { label: "ИИ", variant: "accent" };
  return { label: "Заявка", variant: "neutral" };
}


export const RequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideInvoiced, setHideInvoiced] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.deleteRequest(deleteTarget.request_id);
      setRequests((current) => current.filter((r) => r.request_id !== deleteTarget.request_id));
      setDeleteTarget(null);
      toast.success("Заявка удалена");
    } catch (err) {
      toast.error(`Не удалось удалить заявку: ${errorText(err)}`);
    } finally { setDeleting(false); }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getRequests();
      setRequests(res.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnDef<ClientRequest>[] = [
    {
      id: "doc_number",
      header: "Номер документа",
      width: 140,
      cell: (r) => (
        <Link to={`/requests/${r.request_id}`} className="truncate text-medium" title={r.doc_number}>
          {r.doc_number}
        </Link>
      ),
    },
    {
      id: "client_name",
      header: "Контрагент / Клиент",
      width: 170,
      cell: (r) => (
        <span className="truncate" title={r.client_name || undefined} style={{ fontWeight: 500 }}>
          {r.client_name || "—"}
        </span>
      ),
    },
    {
      id: "source",
      header: "Источник",
      width: 100,
      cell: (r) => {
        const source = sourceOf(r);
        return (
          <Badge variant={source.variant} pill>
            {source.label}
          </Badge>
        );
      },
    },
    {
      id: "ready",
      header: "Готово к счёту",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums">
          {readyCount(r)} из {r.positions.length}
        </span>
      ),
    },
    {
      id: "sum",
      header: "Сумма",
      width: 120,
      align: "right",
      cell: (r) => {
        const { sum, unpriced } = requestSaleSum(r);
        return (
          <span className="tabular-nums text-medium" title={unpriced ? `Без цены продажи: ${unpriced}` : undefined}>
            {sum > 0 ? money(sum) : "—"}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Статус",
      width: 170,
      cell: (r) => <RequestStatusBadge request={r} />,
    },
    {
      id: "created_at",
      header: "Дата",
      width: 100,
      cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span>,
    },
    {
      id: "action",
      header: <span className="sr-only">Действия</span>,
      width: 56,
      align: "right",
      cell: (r) => (
        <IconButton
          size="sm"
          variant="danger"
          icon={<Trash size={14} strokeWidth={1.75} />}
          tooltip={`Удалить заявку ${r.doc_number}`}
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
        />
      ),
    },
  ];

  const visibleRequests = hideInvoiced
    ? requests.filter((request) => request.status !== "invoiced")
    : requests;

  return (
    <div className="stack stack--fill">
      <header className="page__header">        <div className="page__heading">
          <h1 className="page__title">Заявки</h1>
          <p className="page__subtitle">
            Рабочие документы: заявки клиентов, сборка из каталога и ИИ-подбор
          </p>
        </div>

        <div className="page__actions">
          <Button
            variant="primary"
            icon={<Plus size={16} strokeWidth={1.5} />}
            onClick={() => navigate("/requests/new")}
          >
            Новая заявка
          </Button>

          <Button
            variant="ghost"
            icon={<RefreshCw size={16} strokeWidth={1.5} />}
            onClick={loadRequests}
          >
            Обновить
          </Button>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar__group">
          <button
            type="button"
            className="chip"
            aria-pressed={hideInvoiced}
            onClick={() => setHideInvoiced((value) => !value)}
          >
            Скрыть выставленные
          </button>
        </div>
        <div className="toolbar__end">
          <span className="text-xs text-muted">Заявок: {visibleRequests.length}</span>
        </div>
      </div>

      <div className="grow grow--fill">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <ErrorState message="Ошибка загрузки заявок" details={error} onRetry={loadRequests} />
        ) : visibleRequests.length === 0 ? (
          <EmptyState
            icon={<Inbox size={26} strokeWidth={1.5} />}
            title="Заявок пока нет"
            description="Создайте заявку клиента, соберите состав из каталога или подберите товары ИИ-подбором по описанию."
            actionLabel="Создать документ"
            onAction={() => navigate("/requests/new")}
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleRequests}
            rowKey={(r) => r.request_id}
            onRowClick={(r) => navigate(`/requests/${r.request_id}`)}
          />
        )}
      </div>

      <ConfirmDialog open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
        title="Удалить заявку?"
        consequenceText={`Заявка ${deleteTarget?.doc_number ?? ""} и все её позиции будут удалены без возможности восстановления. Заявку со связанным счётом удалить нельзя.`}
        confirmLabel="Удалить" variant="danger" loading={deleting} onConfirm={() => void handleDelete()} />
    </div>
  );
};
