import { quantity } from "../../lib/format";
import React, { useEffect, useRef, useState } from "react";
import { Folder, FolderOpen, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import type { CategoryNode } from "../../mock/mockServer";

export interface CategoryTreeProps {
  categories: CategoryNode[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery?: string;
}

/** Подсветка совпадения поискового запроса в названии раздела. */
const highlightMatch = (text: string, query?: string) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className="tree__mark">
        {part}
      </span>
    ) : (
      part
    )
  );
};

/**
 * Четырёхуровневый рубрикатор каталога.
 * Строки — настоящие <button>: доступны с клавиатуры, имеют hover/focus-visible,
 * а шеврон раскрытия — отдельная кнопка, не конфликтующая с выбором раздела.
 */
export const CategoryTree: React.FC<CategoryTreeProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  searchQuery,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "Строительные материалы и лесопиломатериалы": true,
  });

  const treeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = categories.find(cat => cat.subcategories?.some(sub => sub.name === selectedCategory));
    if (parent) setExpanded(prev => prev[parent.name] ? prev : { ...prev, [parent.name]: true });
  }, [categories, selectedCategory]);

  useEffect(() => {
    treeRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, selectedCategory]);

  const toggleExpand = (catName: string) => {
    setExpanded((prev) => ({ ...prev, [catName]: !prev[catName] }));
  };

  return (
    <aside
      className="catalog-tree panel"
      style={{
        width: 264,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 0,
        borderTop: "none",
        borderLeft: "none",
        borderBottom: "none",
      }}
      aria-label="Рубрикатор каталога"
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg-subtle)",
          fontWeight: 600,
          fontSize: "var(--text-sm)",
          color: "var(--color-text)",
          flexShrink: 0,
        }}
      >
        Рубрикатор каталога
        <div style={{ fontWeight: 400, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          Выберите категорию для фильтрации
        </div>
      </div>

      <div className="tree" ref={treeRef}>
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.name;
          const isExp = Boolean(expanded[cat.name]);
          const hasSubs = cat.subcategories && cat.subcategories.length > 0;

          return (
            <div key={cat.name} style={{ display: "flex", flexDirection: "column" }}>
              <div className={cn("tree__row", isSelected && "tree__row--active")}>
                {hasSubs ? (
                  <button
                    type="button"
                    aria-label={isExp ? `Свернуть ${cat.name}` : `Развернуть ${cat.name}`}
                    aria-expanded={isExp}
                    className="tree__chevron"
                    data-open={isExp ? "true" : undefined}
                    onClick={() => toggleExpand(cat.name)}
                  >
                    <ChevronRight size={14} strokeWidth={1.75} />
                  </button>
                ) : (
                  <span className="tree__chevron tree__chevron--placeholder" aria-hidden="true" />
                )}

                <button
                  type="button"
                  onClick={() => onSelectCategory(cat.name)}
                  aria-pressed={isSelected}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    flex: 1,
                    minWidth: 0,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    font: "inherit",
                    color: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {isExp ? (
                    <FolderOpen size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  ) : (
                    <Folder size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  )}
                  <span className="tree__name" title={cat.name}>
                    {highlightMatch(cat.name, searchQuery)}
                  </span>
                </button>

                <span className="tree__badge">{quantity(cat.count)}</span>
              </div>

              {/* Подкатегории */}
              {hasSubs && isExp && (
                <div style={{ paddingLeft: "var(--space-5)" }}>
                  {cat.subcategories.map((sub) => {
                    const isSubSelected = selectedCategory === sub.name;
                    return (
                      <button
                        key={sub.name}
                        type="button"
                        aria-pressed={isSubSelected}
                        onClick={() => onSelectCategory(sub.name)}
                        className={cn(
                          "tree__row",
                          "tree__row--sub",
                          isSubSelected && "tree__row--active"
                        )}
                      >
                        <span className="tree__name" title={sub.name}>
                          {highlightMatch(sub.name, searchQuery)}
                        </span>
                        <span className="tree__badge">{quantity(sub.count)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
