import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  FileSpreadsheet,
  CircleCheck,
  CircleX,
  CircleDashed,
  HardDrive,
  Cloud,
} from "lucide-react";
import { dateTime, percent, quantity } from "../lib/format";
import { apiClient } from "../api/client";
import type { SystemHealth } from "../types/models";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { ErrorState } from "../components/common/ErrorState";
import { ProgressBar } from "../components/common/Spinner";
import { BlockSkeleton, Skeleton } from "../components/common/Skeleton";

/** Флаг сервиса — «последний запрос успешен»; его отсутствие означает «не проверено», а не отказ. */
const ServiceBadge: React.FC<{ ok: boolean }> = ({ ok }) => (
  <Badge variant={ok ? "success" : "neutral"} pill icon={ok ? <CircleCheck size={12} strokeWidth={2} /> : <CircleDashed size={12} strokeWidth={2} />}>
    {ok ? "Доступен" : "Не проверено"}
  </Badge>
);

export const DataStatusPage: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getHealth();
      setHealth(res.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  if (loading) {
    return (
      <div className="page">
        <div className="stack">
          <Skeleton width="38%" height={20} />
          <div className="grid-2">
            <BlockSkeleton height={190} />
            <BlockSkeleton height={190} />
          </div>
          <BlockSkeleton height={220} />
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="page">
        <ErrorState
          message="Ошибка проверки состояния данных"
          details={error || ""}
          onRetry={loadHealth}
        />
      </div>
    );
  }

  const ai = health.ai ?? { provider: "gemini" as const, available: health.gemini.available, status_text: health.gemini.status_text };
  const completeness = health.data_layer ? health.catalog?.completeness : undefined;
  const fullnessSections = completeness ? [
    { label: "Материалы", value: completeness.materials },
    { label: "Предложения", value: completeness.offers },
    { label: "Синонимы", value: completeness.aliases },
  ] : [];

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">Состояние данных</h1>
          <p className="page__subtitle">
            Мониторинг базы данных SQLite, Parquet-файлов и внешних интеграций
          </p>
        </div>
        <div className="page__actions">
          <Button
            variant="ghost"
            icon={<RefreshCw size={16} strokeWidth={1.5} />}
            loading={loading}
            onClick={() => void loadHealth()}
          >
            Обновить
          </Button>
        </div>
      </header>

      <div className="grid-2">
        {/* База данных */}
        <Card title="База данных SQLite">
          <div className="stack stack--tight">
            <div className="stat-row">
              <span className="stat-row__label">Состояние</span>
              <Badge variant={health.data_layer ? "success" : "danger"} pill icon={health.data_layer ? <CircleCheck size={12} strokeWidth={2} /> : <CircleX size={12} strokeWidth={2} />}>
                {health.data_layer ? "Подключена" : "Недоступна"}
              </Badge>
            </div>

            <div className="stat-row">
              <span className="stat-row__label">Версия схемы</span>
              <span className="mono stat-row__value">{health.database_version}</span>
            </div>

            <div className="stack stack--tightest">
              <span className="stat-row__label">Путь к файлу</span>
              <span className="mono path-line">{health.database_path}</span>
            </div>

          </div>
        </Card>

        {/* Внешние сервисы */}
        <Card title="Внешние интеграции">
          <div className="stack">
            <div className="service-row">
              <div className="service-row__main">
                <span className="service-row__icon" data-tone="accent" aria-hidden="true">
                  <Cloud size={18} strokeWidth={1.75} />
                </span>
                <div className="service-row__text">
                  <div className="service-row__title">МойСклад API 1.2</div>
                  <div className="service-row__desc">{health.moysklad.status_text}</div>
                </div>
              </div>
              <ServiceBadge ok={health.moysklad.connected} />
            </div>

            <hr className="divider" />

            <div className="service-row">
              <div className="service-row__main">
                <span className="service-row__icon" data-tone="violet" aria-hidden="true">
                  <HardDrive size={18} strokeWidth={1.75} />
                </span>
                <div className="service-row__text">
                  <div className="service-row__title">ИИ-провайдер: {ai.provider === "ohmylama" ? "OhMyLama" : "Google Gemini"}</div>
                  <div className="service-row__desc">{ai.status_text}</div>
                </div>
              </div>
              <ServiceBadge ok={ai.available} />
            </div>
          </div>
        </Card>
      </div>

      {/* Полнота данных по разделам */}
      <Card
        title="Полнота номенклатуры"
        subtitle="Доля записей с заполненными обязательными атрибутами"
      >
        {!completeness && <p className="text-muted">Полнота данных не проверена</p>}
        <div className="grid-4">
          {fullnessSections.map((item) => (
            <div key={item.label} className="bar-stack">
              <span className="bar-stack__label">{item.label}</span>
              <span className="tabular-nums bar-stack__value">{percent(item.value, 1)}</span>
              <ProgressBar value={item.value} height={5} variant="accent" animated />
            </div>
          ))}
        </div>
      </Card>

      {/* Файлы каталога Parquet */}
      <Card title="Файлы каталога (Parquet)" flush>
        <div className="dt">
          <div className="dt__scroll">
            <table className="dt__table">
              <colgroup>
                <col />
                <col style={{ width: 180 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 160 }} />
              </colgroup>
              <thead className="dt__thead">
                <tr>
                  <th scope="col">Имя файла</th>
                  <th scope="col" className="dt__right">Количество записей</th>
                  <th scope="col" className="dt__center">Версия схемы</th>
                  <th scope="col" className="dt__right">Дата генерации</th>
                </tr>
              </thead>
              <tbody>
                {health.parquet_status.map((p, idx) => (
                  <tr key={idx} className="dt__row">
                    <td>
                      <span className="file-cell">
                        <FileSpreadsheet
                          className="file-cell__icon"
                          size={15}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span>{p.name}</span>
                      </span>
                    </td>
                    <td className="dt__right dt__numeric dt__strong">
                      {quantity(p.records)}
                    </td>
                    <td className="dt__center dt__mono">v{p.schema_version}</td>
                    <td className="dt__right dt__muted">{dateTime(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};
