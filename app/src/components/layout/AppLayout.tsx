import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Table2,
  Truck,
  Inbox,
  Receipt,
  Database,
  Settings,
  FileText,
  Boxes,
  FileUp,
} from "lucide-react";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";
import { KbdGroup } from "../common/Kbd";
import { TooltipProvider } from "../common/Tooltip";
import { StatusPill } from "../common/StatusDot";
import { CommandPalette, useCommandItems } from "./CommandPalette";
import { dateTime, quantity } from "../../lib/format";
import { apiClient } from "../../api/client";
import type { SystemHealth } from "../../types/models";
import { cn } from "../../lib/cn";

const NAV_ITEMS = [
  { to: "/", label: "Главная панель", icon: <LayoutDashboard size={18} strokeWidth={1.75} />, hint: "Alt+1" },
  { to: "/materials", label: "Номенклатура", icon: <Table2 size={18} strokeWidth={1.75} />, hint: "Alt+2" },
  { to: "/suppliers", label: "Поставщики", icon: <Truck size={18} strokeWidth={1.75} />, hint: "Alt+3" },
  { to: "/imports", label: "Импорт прайсов", icon: <FileUp size={18} strokeWidth={1.75} />, hint: "Alt+4" },
  { to: "/requests", label: "Заявки", icon: <Inbox size={18} strokeWidth={1.75} />, hint: "Alt+5" },
  { to: "/invoices", label: "Счета", icon: <Receipt size={18} strokeWidth={1.75} />, hint: "Alt+6" },
  { to: "/data-status", label: "Состояние данных", icon: <Database size={18} strokeWidth={1.75} />, hint: "Alt+7" },
  { to: "/settings", label: "Настройки", icon: <Settings size={18} strokeWidth={1.75} />, hint: "Alt+8" },
  { to: "/logs", label: "Журнал", icon: <FileText size={18} strokeWidth={1.75} />, hint: "Alt+9" },
];

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["Ctrl", "K"], desc: "Открыть палитру команд и поиск номенклатуры" },
  { keys: ["Ctrl", "N"], desc: "Создать новую заявку: из текста, каталога или ИИ-подбором" },
  { keys: ["Ctrl", "/"], desc: "Открыть эту справку по горячим клавишам" },
  { keys: ["Alt", "1"], desc: "Переход на «Главную панель»" },
  { keys: ["Alt", "2"], desc: "Переход в каталог «Номенклатура»" },
  { keys: ["Alt", "3"], desc: "Переход в раздел «Поставщики»" },
  { keys: ["Alt", "4"], desc: "Переход в раздел «Импорт прайсов»" },
  { keys: ["Alt", "5"], desc: "Переход в раздел «Заявки»" },
  { keys: ["Alt", "6"], desc: "Переход в реестр «Счета»" },
  { keys: ["Alt", "7"], desc: "Переход в «Состояние данных»" },
  { keys: ["Alt", "8"], desc: "Переход в раздел «Настройки»" },
  { keys: ["Alt", "9"], desc: "Переход в «Системный журнал»" },
  { keys: ["Esc"], desc: "Закрыть активное модальное окно или шторку" },
];

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let active = true;
    const loadHealth = async () => {
      try {
        const response = await apiClient.getHealth();
        if (active) setHealth(response.data);
      } catch {
        if (active) setHealth(null);
      }
    };
    void loadHealth();
    window.addEventListener("focus", loadHealth);
    return () => {
      active = false;
      window.removeEventListener("focus", loadHealth);
    };
  }, []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Обработка глобальных горячих клавиш (§6.5 ТЗ)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && key === "n") {
        e.preventDefault();
        navigate("/requests/new");
      } else if (((e.ctrlKey || e.metaKey) && e.key === "/") || (!isInput && e.key === "?")) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.altKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (NAV_ITEMS[idx]) navigate(NAV_ITEMS[idx].to);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const commandItems = useCommandItems(
    NAV_ITEMS.map(({ to, label, icon, hint }) => ({ to, label, icon, hint })),
    navigate
  );

  return (
    <TooltipProvider>
      <div className="app-shell">
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* ── Боковая панель 244px → 56px (§5.2, §6.2 ТЗ) ─────────────── */}
          <aside
            className="app-sidebar"
            style={{
              width: "var(--sidebar-width)",
              backgroundColor: "var(--color-bg-elevated)",
              borderRight: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              zIndex: 10,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Логотип приложения */}
            <div
              style={{
                height: "var(--topbar-height)",
                display: "flex",
                alignItems: "center",
                padding: "0 var(--space-3) 0 var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            >
              <div className="app-brand row row--tight row--minw0">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-accent)",
                    color: "#FFFFFF",
                    flexShrink: 0,
                    boxShadow: "var(--shadow-xs)",
                  }}
                >
                  <Boxes size={15} strokeWidth={1.9} />
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--text-lg)",
                    color: "var(--color-text)",
                    letterSpacing: "-0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  СНАБДИКА
                </span>
              </div>
            </div>

            {/* Навигационное меню */}
            <nav className="nav">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  aria-label={item.label}
                  title={item.label}
                  className={({ isActive }) =>
                    cn("nav__item", isActive && "nav__item--active")
                  }
                >
                  <span className="nav__label">
                    {item.icon}
                    <span className="nav__text">{item.label}</span>
                  </span>
                </NavLink>
              ))}
            </nav>
          </aside>

          {/* ── Основная рабочая область ──────────────────────────────── */}
          <div className="app-workspace" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minWidth: 0 }}>
            {/* Контент экрана */}
            <main className="app-main" style={{ flex: 1, overflow: "auto", padding: "var(--space-6)", minHeight: 0 }}>
              <Outlet />
            </main>
          </div>
        </div>

        {/* ── Статус-бар 28 px (§6.4 ТЗ) ─────────────────────────────── */}
        <footer
          style={{
            height: "var(--statusbar-height)",
            backgroundColor: "var(--color-bg-subtle)",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "0 var(--space-4)",
            whiteSpace: "nowrap",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          <span className="tabular-nums text-xs truncate" style={{ minWidth: 0 }}>
            {health?.data_layer && health.catalog ? (
              <>База: <strong>{quantity(health.catalog.materials_count)}</strong> материалов · <strong>{quantity(health.catalog.offers_count)}</strong> предложений · обновлена {health.catalog.updated_at ? dateTime(health.catalog.updated_at) : "дата неизвестна"}</>
            ) : "База: состояние неизвестно"}
          </span>

          <div className="app-status__right row row--wide" style={{ flexShrink: 0 }}>
            <StatusPill
              tone={health?.moysklad.connected ? "success" : "neutral"}
              title={health?.moysklad.status_text || "Соединение не проверено"}
              onClick={() => navigate("/settings")}
            >
              МойСклад: {health?.moysklad.connected ? "доступен" : "не проверено"}
            </StatusPill>
            <StatusPill tone={(health?.ai?.available ?? health?.gemini.available) ? "success" : "neutral"} title={health?.ai?.status_text || health?.gemini.status_text || "Доступность не проверена"} onClick={() => navigate("/settings")}>
              {health?.ai?.provider === "ohmylama" ? "OhMyLama" : "Gemini"}: {(health?.ai?.available ?? health?.gemini.available) ? "доступен" : "не проверено"}
            </StatusPill>
            <span className="mono text-xs">
              Версия {health?.app_version || "неизвестна"}
            </span>
          </div>
        </footer>

        {/* Палитра команд (Ctrl+K) */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={commandItems} />

        {/* Справка по горячим клавишам (Ctrl+/) */}
        <Modal
          open={helpOpen}
          onOpenChange={setHelpOpen}
          title="Горячие клавиши приложения"
     description="Быстрые клавиатурные сочетания для эффективной работы оператора"
          maxWidth="520px"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setHelpOpen(false)}>
              Понятно
            </Button>
          }
        >
          <div className="stack stack--tightest">
            {SHORTCUTS.map((item, i) => (
              <div key={i} className="shortcut-row">
                <span className="text-default">{item.desc}</span>
                <KbdGroup keys={item.keys} />
              </div>
            ))}
          </div>
        </Modal>
      </div>
    </TooltipProvider>
  );
};


