import React, { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Package } from "lucide-react";
import { apiClient } from "../../api/client";
import type { Material } from "../../types/models";
import { Kbd } from "../common/Kbd";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  group: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  /** Включить живой поиск по каталогу номенклатуры. */
  catalogSearch?: boolean;
}

type FlatItem = CommandItem & { flatIndex: number };

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  items,
  catalogSearch = true,
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searching, setSearching] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Сброс состояния при открытии
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setMaterials([]);
      // Radix сам наводит фокус, но автовыделение надёжнее вызвать явно
      const t = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Живой поиск по каталогу с задержкой 220 мс
  useEffect(() => {
    if (!open || !catalogSearch) return;
    const q = query.trim();
    if (q.length < 2) {
      setMaterials([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiClient.getMaterials({ query: q });
        setMaterials(res.data.slice(0, 6));
      } catch {
        setMaterials([]);
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query, open, catalogSearch]);

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");

  const filteredCommands = useMemo(() => {
    const q = normalize(query);
    if (!q) return items;
    return items.filter((item) => normalize(item.label).includes(q));
  }, [items, query]);

  const catalogItems: CommandItem[] = useMemo(
    () =>
      materials.map((m) => ({
        id: `material-${m.material_id}`,
        label: m.canonical_name,
        hint: `${m.category} · #${m.material_id}`,
        icon: <Package size={15} strokeWidth={1.75} />,
        group: "Номенклатура",
        onSelect: () => {
          window.location.hash = `#/materials/${m.material_id}`;
        },
      })),
    [materials]
  );

  const grouped = useMemo(() => {
    const groups: { name: string; items: FlatItem[] }[] = [];
    let flatIndex = 0;

    const push = (name: string, sourceItems: CommandItem[]) => {
      if (sourceItems.length === 0) return;
      groups.push({
        name,
        items: sourceItems.map((item) => ({ ...item, flatIndex: flatIndex++ })),
      });
    };

    push("Переход", filteredCommands);
    push("Номенклатура", catalogItems);
    return groups;
  }, [filteredCommands, catalogItems]);

  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Активный индекс не должен выходить за пределы списка
  useEffect(() => {
    if (activeIndex > flatItems.length - 1) setActiveIndex(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, activeIndex]);

  const runItem = (item: FlatItem | undefined) => {
    if (!item) return;
    item.onSelect();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(flatItems[activeIndex]);
    }
  };

  // Прокрутка активного элемента в зону видимости
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="overlay" />
        <DialogPrimitive.Content
          className="cmdk"
          onKeyDown={handleKeyDown}
          aria-label="Палитра команд"
        >
          <DialogPrimitive.Title className="sr-only">Палитра команд</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Быстрый переход по разделам и поиск номенклатуры
          </DialogPrimitive.Description>

          <div className="cmdk__search">
            <Search className="cmdk__search-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={inputRef}
              className="cmdk__input"
              placeholder="Поиск раздела или материала..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
            />
            {searching && <span className="spinner cmdk__spinner" aria-hidden="true" />}
            <Kbd>Esc</Kbd>
          </div>

          <div className="cmdk__list" ref={listRef}>
            {flatItems.length === 0 ? (
              <div className="cmdk__empty">
                {query.trim().length < 2 && catalogSearch
                  ? "Введите минимум 2 символа для поиска по каталогу"
                  : "Ничего не найдено"}
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.name}>
                  <div className="cmdk__group">{group.name}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-index={item.flatIndex}
                      className="cmdk__item"
                      data-active={item.flatIndex === activeIndex ? "true" : "false"}
                      onMouseEnter={() => setActiveIndex(item.flatIndex)}
                      onClick={() => runItem(item)}
                    >
                      <span className="cmdk__item-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="cmdk__item-text">{item.label}</span>
                      {item.hint && <span className="cmdk__item-hint">{item.hint}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="cmdk__footer">
            <span className="cmdk__footer-item">
              <Kbd inverse>
                <ArrowUp size={10} strokeWidth={2.25} />
              </Kbd>
              <Kbd inverse>
                <ArrowDown size={10} strokeWidth={2.25} />
              </Kbd>
              навигация
            </span>
            <span className="cmdk__footer-item">
              <Kbd inverse>
                <CornerDownLeft size={10} strokeWidth={2.25} />
              </Kbd>
              выбрать
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** Хук-помощник: собранный список команд навигации. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCommandItems(
  routes: { to: string; label: string; icon: React.ReactNode; hint?: string }[],
  onNavigate: (to: string) => void
): CommandItem[] {
  return useMemo(
    () =>
      routes.map((r) => ({
        id: `nav-${r.to}`,
        label: r.label,
        hint: r.hint,
        icon: r.icon,
        group: "Переход",
        onSelect: () => onNavigate(r.to),
      })),
    [routes, onNavigate]
  );
}
