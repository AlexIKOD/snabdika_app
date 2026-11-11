import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, AlertTriangle, ArrowRight, FileSpreadsheet, GitMerge, CheckCircle2 } from "lucide-react";
import { Alert } from "../components/common/Alert";
import { apiClient } from "../api/client";
import type { DashboardStats } from "../types/models";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { CardGridSkeleton } from "../components/common/Skeleton";
import { ErrorState } from "../components/common/ErrorState";
import { moneyWhole, percent, plural, quantity } from "../lib/format";

const SeeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Button variant="secondary" size="sm" icon={<ArrowRight size={14} strokeWidth={1.75} />} iconPosition="right" onClick={onClick}>
    Смотреть
  </Button>
);

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getDashboard();
      setStats(res.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <CardGridSkeleton cards={6} height={124} />;
  }

  if (error || !stats) {
    return <ErrorState message="Ошибка загрузки сводных показателей" details={error || ""} onRetry={loadDashboard} />;
  }

  const metricCards = [
    {
      label: "Материалов в каталоге",
      value: quantity(stats.materials_count),
      subtext: stats.materials_diff_7d > 0 ? `+${quantity(stats.materials_diff_7d)} за 7 дней` : "без изменений за 7 дней",
      onClick: () => navigate("/materials"),
    },
    {
      label: "Предложений поставщиков",
      value: quantity(stats.offers_count),
      subtext: `от ${stats.suppliers_active_count} поставщиков`,
      onClick: () => navigate("/suppliers"),
    },
    {
      label: "Заявок в работе",
      value: String(stats.requests_in_progress),
      subtext: stats.requests_need_attention ? `${stats.requests_need_attention} ${plural(stats.requests_need_attention, "требует", "требуют", "требуют")} внимания` : "все проверены",
      onClick: () => navigate("/requests"),
    },
    {
      label: "Счетов за 7 дней",
      value: String(stats.invoices_7d_count),
      subtext: moneyWhole(stats.invoices_7d_sum),
      onClick: () => navigate("/invoices"),
    },
    {
      label: "Позиций без цены",
      value: quantity(stats.materials_without_price_count),
      subtext: `${percent((stats.materials_without_price_count / stats.materials_count) * 100)} каталога`,
      onClick: () => navigate("/materials"),
    },
    {
      label: "Материалов без веса",
      value: quantity(stats.materials_without_weight_count),
      subtext: `${percent((stats.materials_without_weight_count / stats.materials_count) * 100)} каталога`,
      onClick: () => navigate("/materials"),
    },
  ];

  return (
    <div className="dashboard">
      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">Главная панель</h1>
          <p className="page__subtitle">Состояние каталога, заявок и счетов</p>
        </div>
      </header>

      {/* 6 метрических плиток по ТЗ §7.1 */}
      <div className="dashboard__metrics">
        {metricCards.map((card, idx) => (
          <button key={idx} type="button" className="metric metric--lg" onClick={card.onClick}>
            <div className="metric__head">
              <span className="metric__label">{card.label}</span>
            </div>
            <div className="metric__value">{card.value}</div>
            <div className="metric__sub">{card.subtext}</div>
          </button>
        ))}
      </div>

      {/* Блок «Требует внимания» (§7.1 ТЗ): показываются только ненулевые пункты */}
      <Card title="Требует внимания оператора">
        <div className="stack stack--tight">
          {stats.price_conflicts_count > 0 && (
            <Alert
              tone="warning"
              icon={<AlertTriangle size={20} strokeWidth={1.75} />}
              title={`${quantity(stats.price_conflicts_count)} ${plural(stats.price_conflicts_count, "позиция", "позиции", "позиций")} с конфликтом цен`}
              action={<SeeButton onClick={() => navigate("/materials?has_price_conflict=true")} />}
            >
              Розничная цена в прайсе ниже себестоимости поставщика (Петрович / СТК Строй)
            </Alert>
          )}
          {stats.suspected_merges_count > 0 && (
            <Alert
              tone="warning"
              icon={<GitMerge size={20} strokeWidth={1.75} />}
              title={`${quantity(stats.suspected_merges_count)} ${plural(stats.suspected_merges_count, "подозрение", "подозрения", "подозрений")} на ложное объединение`}
              action={<SeeButton onClick={() => navigate("/materials?has_suspected_merge=true")} />}
            >
              Расхождение розничных цен между поставщиками более 50%
            </Alert>
          )}
          {stats.requests_need_attention > 0 && (
            <Alert
              tone="info"
              icon={<Inbox size={20} strokeWidth={1.75} />}
              title={`${stats.requests_need_attention} ${plural(stats.requests_need_attention, "заявка требует", "заявки требуют", "заявок требуют")} проверки`}
              action={<SeeButton onClick={() => navigate("/requests")} />}
            >
              Проверьте неподтверждённые позиции в клиентских заявках.
            </Alert>
          )}
          {!stats.price_conflicts_count && !stats.suspected_merges_count && !stats.requests_need_attention && (
            <Alert tone="success" icon={<CheckCircle2 size={20} strokeWidth={1.75} />} title="Всё проверено">
              Конфликтов цен, подозрительных объединений и непроверенных заявок нет.
            </Alert>
          )}
        </div>
      </Card>

      {/* Быстрые действия */}
      <div className="dashboard__actions">
        <Card title="Быстрые действия" className="grow">
          <div className="row">
            <Button
              variant="primary"
              icon={<Inbox size={16} strokeWidth={1.5} />}
              onClick={() => navigate("/requests/new")}
            >
              Создать заявку
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={16} strokeWidth={1.5} />}
              onClick={() => navigate("/materials")}
            >
              Перейти в номенклатуру
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
