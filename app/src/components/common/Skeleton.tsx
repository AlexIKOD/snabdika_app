import React from "react";
import { cn } from "../../lib/cn";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: "text" | "title" | "block" | "circle";
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Шиммер-скелетон. Заменяет «унылые» спиннеры на весь экран и
 * пульсирующие заглушки: даёт ощущение мгновенной загрузки.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = "text",
  className,
  style,
}) => (
  <span
    aria-hidden="true"
    className={cn("skeleton", `skeleton--${variant}`, className)}
    style={{
      width: width ?? (variant === "circle" ? height : undefined),
      height: height ?? undefined,
      ...style,
    }}
  />
);

/** Скелетон строки таблицы (используется в виртуализированных списках). */
export const TableSkeleton: React.FC<{
  rows?: number;
  rowHeight?: number;
  columns?: number[];
}> = ({ rows = 12, rowHeight = 36, columns = [64, 0, 48, 72, 96, 96, 88] }) => (
  <div
    className="panel"
    style={{ overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}
    aria-busy="true"
    aria-label="Загрузка данных"
  >
    <div
      style={{
        height: "var(--table-header-height)",
        backgroundColor: "var(--color-bg-subtle)",
        borderBottom: "1px solid var(--color-border-strong)",
        flexShrink: 0,
      }}
    />
    <div style={{ flex: 1, overflow: "hidden" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height: `${rowHeight}px` }}>
          {columns.map((w, ci) =>
            w === 0 ? (
              <div className="skeleton-stack" key={ci}>
                <Skeleton width="70%" height={11} />
                <Skeleton width="38%" height={9} />
              </div>
            ) : (
              <Skeleton key={ci} width={w} height={11} />
            )
          )}
        </div>
      ))}
    </div>
  </div>
);

/** Скелетон сетки карточек (дашборд, поставщики, состояние данных). */
export const CardGridSkeleton: React.FC<{ cards?: number; height?: number }> = ({
  cards = 6,
  height = 118,
}) => (
  <div
    className="dashboard__metrics"
    aria-busy="true"
    aria-label="Загрузка данных"
  >
    {Array.from({ length: cards }).map((_, i) => (
      <div key={i} className="panel" style={{ padding: "var(--space-4)", height }}>
        <Skeleton width="52%" height={10} />
        <Skeleton width="38%" height={22} style={{ marginTop: 14 }} />
        <Skeleton width="64%" height={9} style={{ marginTop: 10 }} />
      </div>
    ))}
  </div>
);

/** Скелетон панели/карточки произвольной высоты. */
export const BlockSkeleton: React.FC<{ height?: number | string; width?: number | string }> = ({
  height = 120,
  width = "100%",
}) => <Skeleton variant="block" width={width} height={height} />;
