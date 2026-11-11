import React, { useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { TableSkeleton } from "./Skeleton";

export interface ColumnDef<T> {
  id: string;
  header: React.ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  cell: (item: T) => React.ReactNode;
  /** Включает сортировку по колонке. Требует `sortBy` / `onSort` на таблице. */
  sortable?: boolean;
  /** Закрепить колонку у правого края при горизонтальной прокрутке. */
  sticky?: boolean;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (item: T) => string | number;
  selectedId?: string | number;
  onRowClick?: (item: T) => void;
  /** Показывает скелетон вместо строк. */
  loading?: boolean;
  /** Состояние «нет данных». По умолчанию — нейтральная заглушка. */
  emptyState?: React.ReactNode;
  /** Активная колонка сортировки. */
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (columnId: string) => void;
  density?: "standard" | "compact";
  /** Порог включения виртуализации. */
  virtualizeThreshold?: number;
  skeletonRows?: number;
  className?: string;
  style?: React.CSSProperties;
}

const ROW_HEIGHT = { standard: 40, compact: 32 } as const;

/**
 * Таблица данных дизайн-системы.
 *
 * Ключевые отличия от предыдущей реализации:
 *  · состояния строк (hover / selected) вынесены в ui.css — раньше они
 *    переключались через onMouseEnter/Leave в JS и конфликтовали с selected;
 *  · липкая шапка получает микро-тень только при скролле (data-scrolled);
 *  · сортируемые заголовки — настоящие <button> с aria-sort;
 *  · виртуализация включается автоматически на больших выборках
 *    (каталог — до 90 033 позиций).
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  selectedId,
  onRowClick,
  loading = false,
  emptyState,
  sortBy,
  sortDir,
  onSort,
  density = "standard",
  virtualizeThreshold = 150,
  skeletonRows = 12,
  className,
  style,
}: DataTableProps<T>): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  const rowHeight = ROW_HEIGHT[density];
  const virtualize = data.length > virtualizeThreshold;

  const virtualizer = useVirtualizer({
    count: virtualize ? data.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: virtualize,
  });

  const virtualRows = virtualize ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const visibleItems = virtualize ? virtualRows.map((vr) => data[vr.index]) : data;

  const renderRow = (item: T, idx: number) => {
    const key = rowKey(item);
    const isSelected = selectedId !== undefined && selectedId === key;
    return (
      <tr
        key={key}
        onClick={onRowClick ? () => onRowClick(item) : undefined}
        aria-selected={isSelected || undefined}
        data-index={idx}
        className={cn(
          "dt__row",
          onRowClick && "dt__row--clickable",
          isSelected && "dt__row--selected"
        )}
        style={{ height: `${rowHeight}px` }}
      >
        {columns.map((col) => (
          <td
            key={col.id}
            className={cn(col.sticky && "dt__cell--sticky")}
            style={{ textAlign: col.align || "left" }}
          >
            {col.cell(item)}
          </td>
        ))}
      </tr>
    );
  };

  const colGroup = (
    <colgroup>
      {columns.map((col) => (
        <col key={col.id} style={{ width: col.width }} />
      ))}
    </colgroup>
  );

  return (
    <div
      className={cn("dt", density === "compact" && "dt--compact", className)}
      data-scrolled={scrolled ? "true" : undefined}
      style={style}
    >
      <div className="dt__scroll" ref={scrollRef} onScroll={handleScroll}>
        <table className="dt__table">
          {colGroup}
          <thead className="dt__thead">
            <tr>
              {columns.map((col) => {
                const isSorted = sortBy === col.id;
                const sortable = Boolean(col.sortable && onSort);
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={cn(col.sticky && "dt__cell--sticky")}
                    style={{ textAlign: col.align || "left" }}
                    aria-sort={
                      sortable
                        ? isSorted
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={cn("dt__sort-btn", isSorted && "dt__sort-btn--active")}
                        onClick={() => onSort?.(col.id)}
                      >
                        <span className="dt__sort-label">{col.header}</span>
                        {isSorted ? (
                          sortDir === "asc" ? (
                            <ArrowUp size={13} strokeWidth={2} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2} />
                          )
                        ) : (
                          <ChevronsUpDown size={13} strokeWidth={1.5} className="dt__sort-hint" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? null : virtualize && paddingTop > 0 ? (
              <tr className="dt__spacer" aria-hidden="true">
                <td colSpan={columns.length} style={{ height: `${paddingTop}px` }} />
              </tr>
            ) : null}

            {!loading && visibleItems.map((item, i) => renderRow(item, i))}

            {virtualize && !loading && paddingBottom > 0 ? (
              <tr className="dt__spacer" aria-hidden="true">
                <td colSpan={columns.length} style={{ height: `${paddingBottom}px` }} />
              </tr>
            ) : null}
          </tbody>
        </table>

        {loading && <TableSkeleton rows={skeletonRows} />}

        {!loading && data.length === 0 && (
          <div className="dt__empty">
            {emptyState ?? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-base)" }}>
                Нет данных для отображения
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

