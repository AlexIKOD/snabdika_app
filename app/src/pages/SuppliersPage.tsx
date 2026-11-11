import React, { useEffect, useState } from "react";
import { Truck, CheckCircle2 } from "lucide-react";
import { dateTime, quantity } from "../lib/format";
import { apiClient } from "../api/client";
import type { Supplier } from "../types/models";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { CardGridSkeleton } from "../components/common/Skeleton";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getSuppliers();
      setSuppliers(res.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <CardGridSkeleton cards={4} height={132} />;
  }

  if (error) {
    return <ErrorState message="Ошибка загрузки списка поставщиков" details={error} onRetry={loadSuppliers} />;
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={<Truck size={26} strokeWidth={1.5} />}
        title="Поставщики не подключены"
        description="Импортируйте прайс-лист поставщика, чтобы предложения появились в каталоге и участвовали в сопоставлении"
      />
    );
  }

  return (
    <div className="stack">
      <header className="page__header">
        <div className="page__heading">
          <h1 className="page__title">Поставщики</h1>
          <p className="page__subtitle">Прайс-листы поставщиков, загруженные в каталог</p>
        </div>
      </header>

      <div className="grid-2">
        {suppliers.map((s) => (
          <Card key={s.supplier_id}>
            <div className="row row--between row--top row--tight">
              <div className="row row--minw0">
                <span className="metric__icon text-accent" aria-hidden="true">
                  <Truck size={20} strokeWidth={1.75} />
                </span>
                <div className="minw-0">
                  <h2 className="text-lg-semibold">{s.name}</h2>
                  {s.code && s.code !== s.name && (
                    <span className="mono text-xs text-muted">Код: {s.code}</span>
                  )}
                </div>
              </div>
              <Badge variant="success" pill icon={<CheckCircle2 size={12} strokeWidth={1.9} />}>
                Активен
              </Badge>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
                marginTop: "var(--space-4)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <div>
                <span className="text-xs text-muted">
                  Позиций в прайсе
                </span>
                <div className="tabular-nums text-strong">
                  {quantity(s.offers_count)}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted">
                  Последний импорт
                </span>
                <div className="text-sm">
                  {dateTime(s.last_import_at)}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
