import React, { useState } from "react";
import { PackageSearch, Plus, Search, Trash } from "lucide-react";
import { toast } from "sonner";
import { money } from "../../lib/format";
import { apiClient } from "../../api/client";
import type { Material } from "../../types/models";
import { Button } from "../common/Button";
import { IconButton } from "../common/IconButton";
import { Input } from "../common/Input";
import { Alert } from "../common/Alert";
import { EmptyState } from "../common/EmptyState";
import { errorText } from "../../lib/errors";

const dev = (import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV;

interface CartRow {
  material: Material;
  qty: string;
}



/**
 * Сборка состава счёта из внутреннего каталога.
 * Количество — то, что попадёт в счёт; единица берётся из карточки материала.
 */
export const CatalogCart: React.FC<{ onCreated: (requestId: number) => void }> = ({ onCreated }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Material[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resultQuery, setResultQuery] = useState('');
  const [page, setPage] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadResults = async (searchQuery: string, nextPage: number) => {
    setSearching(true);
    setError(null);
    try {
      const response = await apiClient.getMaterials({ query: searchQuery, page: nextPage, page_size: 200 });
      setResults(previous => nextPage === 1 ? response.data : [
        ...previous, ...response.data.filter(item => !previous.some(row => row.material_id === item.material_id)),
      ]);
      setTotalResults(response.meta?.total ?? response.data.length);
      setResultQuery(searchQuery);
      setPage(nextPage);
      setSearched(true);
      if (dev) console.debug('[FIX] catalog_search_page', { page: nextPage, loaded: response.data.length, total: response.meta?.total });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSearching(false);
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !searching) void loadResults(query.trim(), 1);
  };

  const add = (material: Material) =>
    setCart((rows) =>
      rows.some((row) => row.material.material_id === material.material_id)
        ? rows
        : [...rows, { material, qty: "1" }]
    );

  const remove = (materialId: number) =>
    setCart((rows) => rows.filter((row) => row.material.material_id !== materialId));

  const setQty = (materialId: number, qty: string) =>
    setCart((rows) => rows.map((row) => (row.material.material_id === materialId ? { ...row, qty } : row)));

  const total = cart.reduce(
    (sum, row) => sum + (Number(row.qty) || 0) * (row.material.best_purchase?.price ?? 0),
    0
  );

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = (await apiClient.createCatalogInvoiceDraft(cart.map((row) => row.material.material_id))).data;
      const positionByMaterial = new Map(
        draft.positions
          .filter((position) => position.matched_material_id != null)
          .map((position) => [position.matched_material_id as number, position.position_id])
      );

      const writes = await Promise.allSettled(
        cart.map((row) => {
          const positionId = positionByMaterial.get(row.material.material_id);
          const qty = Number(row.qty);
          if (!positionId || !Number.isFinite(qty) || qty <= 0) return Promise.resolve();

          const offers = row.material.offers.filter((offer) => offer.price != null && offer.price > 0);
          const best = offers[0];
          return apiClient.updateRequestPosition(draft.request_id, positionId, {
            parsed_qty: qty,
            ...(best
              ? {
                  selected_supplier_id: best.supplier_id,
                  selected_price: best.price,
                  purchase_price: best.price,
                  purchase_source: `Прайс: ${best.supplier_name}`,
                  alternatives: offers.map((offer) => ({
                    material_id: row.material.material_id,
                    name: `${row.material.canonical_name} (${offer.supplier_name})`,
                    score: 100,
                    supplier_name: offer.supplier_name,
                    supplier_id: offer.supplier_id,
                    price: offer.price as number,
                  })),
                }
              : {}),
          });
        })
      );

      const failed = writes.filter((result) => result.status === "rejected").length;
      if (failed > 0) {
        toast.warning(`Количество не записано для ${failed} поз. — укажите его в заявке`);
      }
      onCreated(draft.request_id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}

      <form className="row row--wide" onSubmit={(e) => void search(e)}>
        <div className="grow-basis">
          <Input
            label="Поиск по внутренней базе"
            placeholder="Например: Ротбанд, ОСП, ВВГнг"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search size={15} strokeWidth={1.75} />}
          />
        </div>
        <Button type="submit" variant="secondary" loading={searching} disabled={!query.trim()}>
          Найти
        </Button>
      </form>

      {searched && results.length === 0 && (
        <div className="centered-note">По запросу «{query.trim()}» ничего не найдено</div>
      )}

      {results.length > 0 && (
        <div className="stack stack--tight">
          <h3 className="panel__title" aria-live="polite">Показано {results.length} из {totalResults}</h3>
          <div className="pick-list scroll-360">
          {results.map((material) => {
            const inCart = cart.some((row) => row.material.material_id === material.material_id);
            return (
              <div className="pick-row" key={material.material_id}>
                <div className="stack stack--tightest minw-0">
                  <span className="text-strong truncate" title={material.canonical_name}>
                    {material.canonical_name}
                  </span>
                  <span className="text-xs text-muted">
                    #{material.material_id} · {material.unit || "единица не заполнена"}
                    {material.best_purchase
                      ? ` · закупка ${money(material.best_purchase.price)} (${material.best_purchase.supplier_name})`
                      : " · предложений поставщиков нет"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} strokeWidth={1.75} />}
                  disabled={inCart}
                  aria-label={`Добавить ${material.canonical_name}`}
                  onClick={() => add(material)}
                >
                  Добавить
                </Button>
              </div>
            );
          })}
          </div>
          {results.length < totalResults && <Button loading={searching}
            onClick={() => void loadResults(resultQuery, page + 1)}>Показать ещё</Button>}
        </div>
      )}

      <div className="stack stack--tight">
        <h3 className="panel__title">Состав ({cart.length})</h3>

        {cart.length === 0 ? (
          <EmptyState
            compact
            icon={<PackageSearch size={24} strokeWidth={1.5} />}
            title="Состав пуст"
            description="Найдите товары по внутренней базе и добавьте их в состав."
          />
        ) : (
          cart.map((row) => (
            <div className="pick-row" key={row.material.material_id}>
              <div className="stack stack--tightest grow minw-0">
                <span className="text-strong truncate" title={row.material.canonical_name}>
                  {row.material.canonical_name}
                </span>
                <span className="text-xs text-muted">
                  Единица: {row.material.unit || "не заполнена"}
                  {row.material.best_purchase
                    ? ` · закупка ${money(row.material.best_purchase.price)}`
                    : ""}
                </span>
              </div>

              <Input
                type="number"
                min="0"
                step="any"
                className="minw-180"
                label={`Количество, ${row.material.unit || "ед."}`}
                value={row.qty}
                onChange={(e) => setQty(row.material.material_id, e.target.value)}
              />

              <IconButton
                variant="danger"
                icon={<Trash size={15} strokeWidth={1.75} />}
                tooltip="Убрать из состава"
                aria-label={`Убрать ${row.material.canonical_name}`}
                onClick={() => remove(row.material.material_id)}
              />
            </div>
          ))
        )}
      </div>

      <div className="row row--between">
        <span className="text-sm text-muted">
          Предварительно по закупке: <strong className="tabular-nums">{money(total)}</strong>
        </span>
        <Button variant="primary" loading={busy} disabled={cart.length === 0} onClick={() => void create()}>
          Создать заявку
        </Button>
      </div>
    </div>
  );
};
