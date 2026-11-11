import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  RefreshCw,
  Download,
  Columns3,
  FilterX,
  Search,
  PackageSearch,
} from "lucide-react";
import { apiClient } from "../api/client";
import type { Material, Supplier } from "../types/models";
import type { CategoryNode } from "../mock/mockServer";
import { DataTable, type ColumnDef } from "../components/common/DataTable";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Button } from "../components/common/Button";
import { Badge, CountPill } from "../components/common/Badge";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { TableSkeleton } from "../components/common/Skeleton";
import { CategoryTree } from "../components/catalog/CategoryTree";
import { ColumnManagerModal } from "../components/catalog/ColumnManagerModal";
import { QuickPreviewDrawer } from "../components/catalog/QuickPreviewDrawer";
import { getUiPreferences, saveUiPreferences } from "../storage/preferences";
import { money, plural, quantity } from "../lib/format";

export const MaterialsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [matchedTotal, setMatchedTotal] = useState(0);
  const pageSize = 200;
  const latestLoad = useRef(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const catalogTotal = categories.find((item) => item.name === "Все категории")?.count;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Выбранный материал для шторки быстрого просмотра
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  // Модалка настройки колонок
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState(() => getUiPreferences().catalogColumns);

  // Фильтры
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "Все категории";
  const supplierId = searchParams.get("supplier_id") ? parseInt(searchParams.get("supplier_id")!, 10) : undefined;
  const hasPriceConflict = searchParams.get("has_price_conflict") === "true";
  const hasSuspectedMerge = searchParams.get("has_suspected_merge") === "true";
  const hasPrice = (searchParams.get("has_price") as "all" | "with_price" | "no_price") || "all";
  const hasWeight = (searchParams.get("has_weight") as "all" | "with_weight" | "no_weight") || "all";

  // Сортировка
  const [sortBy, setSortBy] = useState<"id" | "name" | "weight" | "price">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Загрузка дерева категорий
  useEffect(() => {
    apiClient.getCategories().then((res) => setCategories(res.data)).catch(() => {});
    apiClient.getSuppliers().then((res) => setSuppliers(res.data)).catch(() => {});
  }, []);

  useEffect(() => { setPage(1); }, [query, category, supplierId, hasPriceConflict, hasSuspectedMerge, hasPrice, hasWeight, sortBy, sortDir]);

  const loadMaterials = useCallback(async () => {
    const version = ++latestLoad.current;
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getMaterials({
        query: query || undefined,
        category: category !== "Все категории" ? category : undefined,
        supplier_id: supplierId,
        has_price_conflict: hasPriceConflict || undefined,
        has_suspected_merge: hasSuspectedMerge || undefined,
        has_price: hasPrice !== "all" ? hasPrice : undefined,
        has_weight: hasWeight !== "all" ? hasWeight : undefined,
        page, page_size: pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (version !== latestLoad.current) return;
      setMaterials(res.data);
      setMatchedTotal(res.meta?.total ?? res.data.length);
    } catch (err) {
      if (version === latestLoad.current) setError(String(err));
    } finally {
      if (version === latestLoad.current) setLoading(false);
    }
  }, [query, category, supplierId, hasPriceConflict, hasSuspectedMerge, hasPrice, hasWeight, sortBy, sortDir, page]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const handleSort = useCallback((column: "id" | "name" | "weight" | "price") => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }, [sortBy]);

  const handleCategorySelect = (cat: string) => {
    setSearchParams((prev) => {
      if (cat === "Все категории") prev.delete("category");
      else prev.set("category", cat);
      return prev;
    });
  };

  const handleResetFilters = () => {
    setSearchParams(new URLSearchParams());
    setSortBy("name");
    setSortDir("asc");
  };

  const handleToggleColumn = (colId: string) => {
    const updated = {
      ...columnVisibility,
      [colId]: !columnVisibility[colId],
    };
    setColumnVisibility(updated);
    saveUiPreferences({ catalogColumns: updated });
  };

  const handleResetColumns = () => {
    const defaults = {
      code: true,
      name: true,
      unit: true,
      weight: true,
      category: true,
      petrovich_retail: true,
      petrovich_purchase: true,
      stk_retail: true,
      stk_purchase: true,
      flags: true,
    };
    setColumnVisibility(defaults);
    saveUiPreferences({ catalogColumns: defaults });
  };

  // Экспорт текущей выборки в CSV (Excel совместимый, UTF-8 с BOM)
  const handleExportCsv = () => {
    if (materials.length === 0) return;

    const headers = [
      "ID",
      "Каноническое наименование",
      "Категория",
      "Ед. изм.",
      "Вес (кг)",
      "Петрович Розница (руб)",
      "Петрович Закупка (руб)",
      "СТК Строй Розница (руб)",
      "СТК Строй Закупка (руб)",
      "Статус",
    ];

    const rows = materials.map((m) => {
      const petrRetail = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "retail")?.price || "";
      const petrPurch = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "purchase")?.price || "";
      const stkRetail = m.offers.find((o) => o.supplier_name === "СТК Строй" && o.price_type === "retail")?.price || "";
      const stkPurch = m.offers.find((o) => o.supplier_name === "СТК Строй" && o.price_type === "purchase")?.price || "";

      return [
        m.material_id,
        `"${m.canonical_name.replace(/"/g, '""')}"`,
        `"${m.category.replace(/"/g, '""')}"`,
        m.unit,
        m.weight_kg !== null ? m.weight_kg : "",
        petrRetail,
        petrPurch,
        stkRetail,
        stkPurch,
        m.flags.join(", ") || "Нормализован",
      ].join(";");
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snabdika_catalog_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Цена предложения. «Лучшая» цена выделяется зелёной пилюлей —
   * глаз находит минимум по столбцу без чтения чисел.
   */
  const formatPrice = (
    price: number | null | undefined,
    isBest: boolean = false,
    isConflict: boolean = false
  ) => {
    if (price === null || price === undefined || price <= 0) {
      return <span className="dash">—</span>;
    }
    const formatted = money(price);

    if (isBest) {
      return (
        <span className="price-best" title="Лучшая цена среди поставщиков">
          {formatted}
        </span>
      );
    }
    return <span className={isConflict ? "price-warn" : "price-plain"}>{formatted}</span>;
  };

  // Определение доступных колонок с учетом видимости
  const allColumns: ColumnDef<Material>[] = useMemo(
    () => [
      {
        id: "code",
        header: "ID",
        width: 80,
        align: "right",
        sortable: true,
        cell: (m) => (
          <span className="tabular-nums text-muted">
            {m.material_id}
          </span>
        ),
      },
      {
        id: "name",
        header: "Наименование",
        sortable: true,
        cell: (m) => (
          <div className="row row--tightest minw-0">
            <button type="button" className="catalog-material-button truncate" title={m.canonical_name}
              onClick={e => { e.stopPropagation(); setSelectedMaterial(m); }}>
              {m.canonical_name}
            </button>
            <span className="text-xs text-muted truncate">
              {m.category}
              {m.brand ? ` · ${m.brand}` : ""}
            </span>
          </div>
        ),
      },
      {
        id: "unit",
        header: "Ед.",
        width: 56,
        cell: (m) => <span className="text-muted">{m.unit}</span>,
      },
      {
        id: "weight",
        header: "Вес, кг",
        width: 80,
        align: "right",
        sortable: true,
        cell: (m) => (
          <span className="tabular-nums">
            {m.weight_kg !== null ? quantity(m.weight_kg) : <span className="dash">—</span>}
          </span>
        ),
      },
      {
        id: "petrovich_retail",
        header: <span title="Петрович Розница">Петрович Розница</span>,
        width: 112,
        align: "right",
        cell: (m) => {
          const off = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "retail");
          const purch = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "purchase");
          const stkOff = m.offers.find((o) => o.supplier_name === "СТК Строй" && o.price_type === "retail");
          
          const isConflict = Boolean(off?.price && purch?.price && off.price < purch.price);
          const isBest = !!off?.price && !!stkOff?.price && off.price < stkOff.price;

          return (
            <div className="row row--end">
              {isConflict && (
                <span title="Розница ниже закупки!" className="inline-flex">
                  <AlertTriangle size={14} strokeWidth={1.75} className="text-warning" />
                </span>
              )}
              {formatPrice(off?.price, isBest, isConflict)}
            </div>
          );
        },
      },
      {
        id: "petrovich_purchase",
        header: <span title="Петрович Закупка">Петрович Закупка</span>,
        width: 112,
        align: "right",
        cell: (m) => {
          const off = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "purchase");
          const stkOff = m.offers.find((o) => o.supplier_name === "СТК Строй" && o.price_type === "purchase");
          const isBest = !!off?.price && !!stkOff?.price && off.price < stkOff.price;
          return formatPrice(off?.price, isBest);
        },
      },
      {
        id: "stk_retail",
        header: <span title="СТК Розница">СТК Розница</span>,
        width: 112,
        align: "right",
        cell: (m) => {
          const off = m.offers.find((o) => o.supplier_name === "СТК Строй" && o.price_type === "retail");
          const petrOff = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "retail");
          const isBest = !!off?.price && !!petrOff?.price && off.price < petrOff.price;
          return formatPrice(off?.price, isBest);
        },
      },
      {
        id: "stk_purchase",
        header: <span title="СТК Закупка">СТК Закупка</span>,
        width: 112,
        align: "right",
        cell: (m) => {
          const off = m.offers.find((o) => o.supplier_name === "СТК Строй" && o.price_type === "purchase");
          const petrOff = m.offers.find((o) => o.supplier_name === "Петрович" && o.price_type === "purchase");
          const isBest = !!off?.price && !!petrOff?.price && off.price < petrOff.price;
          return formatPrice(off?.price, isBest);
        },
      },
      {
        id: "flags",
        header: "Статус",
        width: 132,
        cell: (m) => {
          if (m.flags.includes("price_conflict")) {
            return <Badge variant="warning">Конфликт цен</Badge>;
          }
          if (m.flags.includes("suspected_false_merge")) {
            return <Badge variant="warning">Ложное объединение?</Badge>;
          }
          return <Badge variant="success">Нормализован</Badge>;
        },
      },
    ],
    []
  );

  const visibleColumns = useMemo(
    () => allColumns.filter((col) => columnVisibility[col.id] !== false),
    [allColumns, columnVisibility]
  );


  const columnsModalData = useMemo(
    () => [
      { id: "code", header: "Идентификатор (ID)", visible: columnVisibility.code !== false },
      { id: "name", header: "Каноническое наименование", visible: columnVisibility.name !== false },
      { id: "unit", header: "Единица измерения", visible: columnVisibility.unit !== false },
      { id: "weight", header: "Вес (кг)", visible: columnVisibility.weight !== false },
      { id: "petrovich_retail", header: "Петрович (Розница)", visible: columnVisibility.petrovich_retail !== false },
      { id: "petrovich_purchase", header: "Петрович (Закупка)", visible: columnVisibility.petrovich_purchase !== false },
      { id: "stk_retail", header: "СТК Строй (Розница)", visible: columnVisibility.stk_retail !== false },
      { id: "stk_purchase", header: "СТК Строй (Закупка)", visible: columnVisibility.stk_purchase !== false },
      { id: "flags", header: "Статус и предупреждения", visible: columnVisibility.flags !== false },
    ],
    [columnVisibility]
  );

  return (
    <div className="catalog-layout">
      {/* Левая панель: 4-уровневый рубрикатор каталога */}
      <CategoryTree
        categories={categories}
        selectedCategory={category}
        onSelectCategory={handleCategorySelect}
      />

      {/* Основная область номенклатуры */}
      <div className="catalog-content">
        {/* Панель фильтров и действий */}
        <div className="panel panel--pad stack stack--tighter">
          {/* Верхняя строка фильтров */}
          <div className="toolbar toolbar--flush">
            <div className="catalog-search">
              <Input
                placeholder="Поиск по наименованию, бренду или коду..."
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchParams((prev) => {
                    if (val) prev.set("q", val);
                    else prev.delete("q");
                    return prev;
                  });
                }}
                icon={<Search size={15} strokeWidth={1.75} />}
                aria-label="Поиск по каталогу"
              />
            </div>

            {/* Фильтр поставщика */}
            <Select
              value={supplierId ? String(supplierId) : ""}
              onChange={(e) => {
                const val = e.target.value;
                setSearchParams((prev) => {
                  if (val) prev.set("supplier_id", val);
                  else prev.delete("supplier_id");
                  return prev;
                });
              }}
              aria-label="Фильтр по поставщику"
            >
              <option value="">Все поставщики</option>
              {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}
            </Select>

            {/* Фильтр по наличию цены */}
            <Select
              value={hasPrice}
              onChange={(e) => {
                const val = e.target.value;
                setSearchParams((prev) => {
                  if (val === "all") prev.delete("has_price");
                  else prev.set("has_price", val);
                  return prev;
                });
              }}
              aria-label="Фильтр по наличию цены"
            >
              <option value="all">Цены: все</option>
              <option value="with_price">Только с ценой</option>
              <option value="no_price">Без цен</option>
            </Select>

            {/* Фильтр по наличию веса */}
            <Select
              value={hasWeight}
              onChange={(e) => {
                const val = e.target.value;
                setSearchParams((prev) => {
                  if (val === "all") prev.delete("has_weight");
                  else prev.set("has_weight", val);
                  return prev;
                });
              }}
              aria-label="Фильтр по наличию веса"
            >
              <option value="all">Вес: любой</option>
              <option value="with_weight">Только с весом</option>
              <option value="no_weight">Без веса</option>
            </Select>

            {/* Быстрые переключатели аномалий */}
            <div className="toolbar__group">
              <button
                type="button"
                className="chip"
                aria-pressed={hasPriceConflict}
                onClick={() => {
                  setSearchParams((prev) => {
                    if (hasPriceConflict) prev.delete("has_price_conflict");
                    else prev.set("has_price_conflict", "true");
                    return prev;
                  });
                }}
              >
                Конфликт цен
              </button>

              <button
                type="button"
                className="chip"
                aria-pressed={hasSuspectedMerge}
                onClick={() => {
                  setSearchParams((prev) => {
                    if (hasSuspectedMerge) prev.delete("has_suspected_merge");
                    else prev.set("has_suspected_merge", "true");
                    return prev;
                  });
                }}
              >
                Ложное объединение
              </button>

              {(query || category !== "Все категории" || supplierId || hasPriceConflict || hasSuspectedMerge || hasPrice !== "all" || hasWeight !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<FilterX size={14} strokeWidth={1.5} />}
                  onClick={handleResetFilters}
                >
                  Сбросить фильтры
                </Button>
              )}
            </div>
          </div>

          {/* Нижняя строка действий: экспорт, настройка колонок, обновление */}
          <div className="catalog-toolbar-footer">
            <div className="catalog-summary">
              {catalogTotal !== undefined && matchedTotal === catalogTotal ? "Всего" : "Найдено"}
              <CountPill active>{quantity(matchedTotal)}</CountPill>
              <span className="text-muted">
                {catalogTotal === undefined
                  ? plural(matchedTotal, "материал", "материала", "материалов")
                  : matchedTotal === catalogTotal
                    ? plural(matchedTotal, "материал", "материала", "материалов")
                    : `из ${quantity(catalogTotal)} материалов`}
              </span>
            </div>

            <div className="catalog-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={<Columns3 size={15} strokeWidth={1.75} />}
                onClick={() => setColumnsModalOpen(true)}
              >
                Колонки
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={<Download size={15} strokeWidth={1.5} />}
                onClick={handleExportCsv}
              >
                Экспорт CSV
              </Button>

              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={15} strokeWidth={1.75} />}
                onClick={loadMaterials}
                loading={loading}
              >
                Обновить
              </Button>
            </div>
          </div>
        </div>

        <h1 className="sr-only">Номенклатура</h1>
        <div className="grow grow--fill">
          {loading ? (
            <TableSkeleton rows={14} />
          ) : error ? (
            <ErrorState
              message="Не удалось загрузить каталог номенклатуры"
              details={error}
              onRetry={loadMaterials}
            />
          ) : (
            <DataTable
              className="catalog-table"
              columns={visibleColumns}
              data={materials}
              rowKey={(m) => m.material_id}
              selectedId={selectedMaterial?.material_id}
              onRowClick={(m) => setSelectedMaterial(m)}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={(colId) =>
                handleSort(colId as "id" | "name" | "weight" | "price")
              }
              emptyState={
                <EmptyState
                  tone="accent"
                  compact
                  icon={<PackageSearch size={26} strokeWidth={1.5} />}
                  title="Ничего не найдено"
                  description="Под выбранные фильтры не подходит ни одна позиция каталога. Попробуйте изменить условия поиска."
                  actionLabel="Сбросить фильтры"
                  onAction={handleResetFilters}
                />
              }
            />
          )}
        </div>

        {matchedTotal > pageSize && (
          <nav className="catalog-pager" aria-label="Страницы каталога">
            <Button variant="secondary" size="sm" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
            <span className="catalog-actions__page">Стр. {page} из {Math.ceil(matchedTotal / pageSize)}</span>
            <Button variant="secondary" size="sm" disabled={loading || page * pageSize >= matchedTotal} onClick={() => setPage(p => p + 1)}>Далее</Button>
          </nav>
        )}
      </div>

      {/* Шторка быстрого просмотра (QuickPreviewDrawer) */}
      <QuickPreviewDrawer
        material={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
      />

      {/* Модалка управления колонками */}
      <ColumnManagerModal
        open={columnsModalOpen}
        onOpenChange={setColumnsModalOpen}
        columns={columnsModalData}
        onToggleColumn={handleToggleColumn}
        onReset={handleResetColumns}
      />
    </div>
  );
};
