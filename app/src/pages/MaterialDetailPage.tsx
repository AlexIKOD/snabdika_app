import { toast } from "sonner";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  Store,
  Save,
  Plus,
  GitMerge,
  Check,
  Tags,
  ZoomIn,
  ImageOff,
  BadgeCheck,
} from "lucide-react";
import { money } from "../lib/format";
import { apiClient } from "../api/client";
import type { Material } from "../types/models";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { Input } from "../components/common/Input";
import { Alert } from "../components/common/Alert";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { Skeleton } from "../components/common/Skeleton";
import { errorText } from "../lib/errors";

export const MaterialDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Активная вкладка (§7.3 ТЗ, без истории цен по требованию пользователя)
  const [activeTab, setActiveTab] = useState<"overview" | "offers" | "aliases" | "merge">("overview");

  // Поля формы редактирования (Обзор)
  const [editForm, setEditForm] = useState({
    canonical_name: "",
    category: "",
    subcategory: "",
    unit: "",
    weight_kg: "",
    brand: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Форма добавления синонима (Алиасы)
  const [newAliasName, setNewAliasName] = useState("");
  const [addingAlias, setAddingAlias] = useState(false);

  // Форма объединения материалов (Merge)
  const [targetMergeId, setTargetMergeId] = useState("");
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [merging, setMerging] = useState(false);

  const loadMaterial = useCallback(async (materialId: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getMaterialById(materialId);
      setMaterial(res.data);
      setEditForm({
        canonical_name: res.data.canonical_name,
        category: res.data.category,
        subcategory: res.data.subcategory,
        unit: res.data.unit,
        weight_kg: res.data.weight_kg !== null ? String(res.data.weight_kg) : "",
        brand: res.data.brand || "",
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) loadMaterial(parseInt(id, 10));
  }, [id, loadMaterial]);

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;

    setSavingEdit(true);
    try {
      const patch = {
        canonical_name: editForm.canonical_name.trim(),
        category: editForm.category.trim(),
        subcategory: editForm.subcategory.trim(),
        unit: editForm.unit.trim(),
        weight_kg: editForm.weight_kg ? parseFloat(editForm.weight_kg) : null,
        brand: editForm.brand.trim() || null,
      };

      const res = await apiClient.patchMaterial(material.material_id, patch);
      setMaterial(res.data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      toast.error(`Ошибка сохранения: ${errorText(err)}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material || !newAliasName.trim()) return;

    setAddingAlias(true);
    try {
      await apiClient.addMaterialAlias(material.material_id, newAliasName.trim());
      setNewAliasName("");
      loadMaterial(material.material_id);
    } catch (err) {
      toast.error(`Ошибка добавления синонима: ${errorText(err)}`);
    } finally {
      setAddingAlias(false);
    }
  };

  const handleExecuteMerge = async () => {
    if (!material || !targetMergeId.trim()) return;
    const targetIdNum = parseInt(targetMergeId.trim(), 10);
    if (isNaN(targetIdNum) || targetIdNum === material.material_id) {
      toast.info("Укажите корректный ID другого материала для слияния");
      return;
    }

    setMerging(true);
    try {
      // Сливаем текущий материал в целевой материал
      await apiClient.mergeMaterials(material.material_id, targetIdNum);
      setMergeConfirmOpen(false);
      toast.info(`Материал #${material.material_id} успешно объединен в #${targetIdNum}`);
      navigate(`/materials/${targetIdNum}`);
    } catch (err) {
      toast.error(`Ошибка объединения: ${errorText(err)}`);
      setMerging(false);
    }
  };

  // Скелетон загрузки: повторяет компоновку страницы, чтобы не было «прыжка».
  if (loading) {
    return (
      <div
        className="stack"
        aria-busy="true"
        aria-label="Загрузка карточки материала"
      >
        <Skeleton variant="block" height={32} width={240} />
        <Skeleton variant="block" height={104} />
        <Skeleton variant="block" height={44} />
        <Skeleton variant="block" height={420} />
      </div>
    );
  }

  if (error || !material) {
    return (
      <ErrorState
        message="Карточка материала не найдена"
        details={error || ""}
        onRetry={() => id && loadMaterial(parseInt(id, 10))}
      />
    );
  }

  const tabs = [
    { id: "overview", label: "Обзор и редактирование" },
    { id: "offers", label: `Предложения поставщиков (${material.offers.length})` },
    { id: "aliases", label: `Варианты наименований (${material.aliases?.length || 0})` },
    { id: "merge", label: "Слияние дублей" },
  ];

  return (
    <div className="stack">
      {/* Навигация назад */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} strokeWidth={1.5} />}
          onClick={() => navigate("/materials")}
        >
          Вернуться в номенклатуру
        </Button>
      </div>

      {/* Паспортная карточка */}
      <div className="panel panel--spaced">
        <div className="passport-head">
          <div className="passport-head__main">
            <div className="passport-head__row">
              <span className="pos-card__id">ID: {material.material_id}</span>
              <span className="passport-head__id">
                {material.category} / {material.subcategory}
              </span>
            </div>
            <h1 className="page__title passport-head__title">
              {material.canonical_name}
            </h1>
          </div>

          <div className="passport-head__actions">
            {material.flags.includes("price_conflict") && (
              <Badge variant="warning" pill icon={<AlertTriangle size={13} strokeWidth={1.75} />}>
                Конфликт цен
              </Badge>
            )}
            {material.flags.includes("suspected_false_merge") && (
              <Badge variant="warning" pill>
                Подозрение на ложное объединение
              </Badge>
            )}
            <Badge variant="success" pill icon={<BadgeCheck size={13} strokeWidth={1.75} />}>
              Нормализован
            </Badge>
          </div>
        </div>
      </div>

      {/* Переключатель вкладок (§7.3 ТЗ) */}
      <div className="tabs" role="tablist" aria-label="Разделы карточки материала">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Содержимое вкладки 1: Обзор и редактирование */}
      {activeTab === "overview" && (
    <Card title="Характеристики и редактирование канонической записи">
          <form className="overview-form" onSubmit={handleSaveOverview}>
            <div className="stack">
              <Input
                label="Каноническое наименование товара *"
                value={editForm.canonical_name}
                onChange={(e) => setEditForm({ ...editForm, canonical_name: e.target.value })}
                required
              />

              <div className="grid-2 grid-2--tight">
                <div className="field">
                  <span className="field__label">Рабочее наименование для поиска</span>
                  <div className="readonly-value">{material.working_name || material.canonical_name}</div>
                </div>
                <div className="field">
                  <span className="field__label">Полное наименование для печати</span>
                  <div className="readonly-value">{material.print_name || material.canonical_name}</div>
                </div>
              </div>

              <div className="grid-2 grid-2--tight">
                <Input
                  label="Раздел каталога (категория) *"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  required
                />
                <Input
                  label="Подкатегория"
                  value={editForm.subcategory}
                  onChange={(e) => setEditForm({ ...editForm, subcategory: e.target.value })}
                />
              </div>

              <div className="grid-3 grid-3--tight">
                <Input
                  label="Базовая единица изм. *"
                  value={editForm.unit}
                  onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                  required
                />
                <Input
                  type="number"
                  step="0.001"
                  label="Вес единицы (кг)"
                  value={editForm.weight_kg}
                  onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })}
                  placeholder="0.00"
                  suffixText="кг"
                />
                <Input
                  label="Бренд / Производитель"
                  value={editForm.brand}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                  placeholder="Knauf, Кроношпан..."
                />
              </div>

              <div className="save-inline">
                <Button
                  type="submit"
                  variant="primary"
                  loading={savingEdit}
                  icon={<Save size={16} strokeWidth={1.5} />}
                >
                  {saveSuccess ? "Сохранено!" : "Сохранить изменения"}
                </Button>
                {saveSuccess && (
                  <span className="inline-msg inline-msg--success">
                    <Check size={16} /> Карточка успешно обновлена в базе
                  </span>
                )}
              </div>
            </div>
            
            {/* Блок изображения товара */}
            <div className="stack stack--tight">
              <div className="photo-frame">
                <div className="photo-frame__empty">
                  <ImageOff size={28} strokeWidth={1.5} />
                  <span>Нет фото</span>
                </div>
                <span className="photo-frame__hint">
                  <ZoomIn size={11} strokeWidth={2} /> Наведите для зума
                </span>
              </div>
              <div className="thumbs">
                {[1, 2, 3].map((i) => (
                  <button
                    key={i}
                    type="button"
                    className="thumb"
                    aria-pressed={i === 1}
                    aria-label={`Изображение ${i}`}
                  >
                    <ImageOff size={16} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Содержимое вкладки 2: Предложения поставщиков */}
      {activeTab === "offers" && (
    <Card title="Сопоставленные предложения из прайс-листов поставщиков">
          <div className="stack">
            {material.best_purchase && (
              <Alert
                tone="success"
                title="Наиболее выгодная закупка для оператора"
                action={
                  <span className="tabular-nums best-price">
                    {money(material.best_purchase.price)}
                  </span>
                }
              >
                Поставщик: <strong>{material.best_purchase.supplier_name}</strong>
              </Alert>
            )}

            <div className="offers-grid">
              {material.offers.map((off) => (
                <Card
                  key={off.offer_id}
                  hoverable
                  title={
                    <span className="card-title-row">
                      <Store size={16} strokeWidth={1.75} />
                      {off.supplier_name}
                    </span>
                  }
                >
                  <div className="offer-card__price">
                    {money(off.price)}
                  </div>
                  <div className="offer-card__meta">
                    <span className="mono">Код: {off.supplier_code || "—"}</span>
                    <Badge variant={off.in_stock ? "success" : "neutral"} pill>
                      {off.in_stock ? "В наличии" : "Под заказ"}
                    </Badge>
                  </div>
                  {off.raw_name && <div className="text-xs text-muted wrap-anywhere" style={{ marginTop: "var(--space-2)" }}>Исходное: {off.raw_name}</div>}
                  <div className="text-2xs text-muted" style={{ marginTop: "var(--space-1)" }}>
                    {off.external_id || off.uuid || off.article || off.ean ? `Идентификатор: ${off.external_id || off.uuid || off.article || off.ean}` : "Идентификатор не указан"}
                    {off.source_file ? ` · ${off.source_file}` : ""} · импорт {off.imported_at || off.updated_at}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Содержимое вкладки 3: Варианты наименований (синонимы) */}
      {activeTab === "aliases" && (
        <Card title="Варианты написания и синонимы из прайсов (Алиасы)">
          <div className="stack">
            {/* Форма добавления синонима */}
            <form className="alias-form" onSubmit={handleAddAlias}>
              <div className="alias-form__field">
                <Input
                  label="Добавить новый синоним для ИИ-сопоставления"
                  placeholder="Введите альтернативное написание или артикул..."
                  value={newAliasName}
                  onChange={(e) => setNewAliasName(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!newAliasName.trim() || addingAlias}
                loading={addingAlias}
                icon={<Plus size={16} strokeWidth={1.5} />}
              >
                Добавить синоним
              </Button>
            </form>

            <div className="dt dt--auto">
              <div className="dt__scroll">
                <table className="dt__table">
                  <colgroup>
                    <col />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 150 }} />
                  </colgroup>
                  <thead className="dt__thead">
                    <tr>
                      <th scope="col">Исходная строка из источника</th>
                      <th scope="col">Источник</th>
                      <th scope="col" className="dt__center">Уверенность</th>
                      <th scope="col" className="dt__right">Дата добавления</th>
                    </tr>
                  </thead>
                  <tbody>
                    {material.aliases && material.aliases.length > 0 ? (
                      material.aliases.map((al) => (
                        <tr key={al.alias_id} className="dt__row">
                          <td className="dt__strong">
                            <span className="file-cell">
                              <Tags className="file-cell__icon" size={14} strokeWidth={1.75} aria-hidden="true" />
                              {al.raw_name}
                            </span>
                          </td>
                          <td className="dt__muted">{al.source}</td>
                          <td className="dt__center">
                            <Badge variant="accent" pill>
                              {al.confidence}%
                            </Badge>
                          </td>
                          <td className="dt__right dt__muted">
                            {al.created_at}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="dt__row">
                        <td className="dt__empty" colSpan={4}>
                          Пока нет зафиксированных синонимов
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Содержимое вкладки 4: Слияние дублей */}
      {activeTab === "merge" && (
    <Card title="Объединение дублирующихся материалов">
          <div className="stack stack--narrow">
            <p className="hint-text">
              Если вы обнаружили, что в каталоге созданы две одинаковые позиции с разными ID, вы можете объединить
              текущую карточку <strong>#{material.material_id}</strong> с целевым материалом.
              Все предложения поставщиков и синонимы будут объединены, а дубль будет удален.
            </p>

            <Input
              label="ID целевого материала, в который нужно объединить этот товар *"
              placeholder="Например: 1246"
              value={targetMergeId}
              onChange={(e) => setTargetMergeId(e.target.value)}
              hint="Введите числовой идентификатор карточки"
            />

            <div>
              <Button
                variant="danger"
                icon={<GitMerge size={16} strokeWidth={1.5} />}
                disabled={!targetMergeId.trim()}
                onClick={() => setMergeConfirmOpen(true)}
              >
                Объединить материалы
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Диалог подтверждения слияния */}
      <ConfirmDialog
        open={mergeConfirmOpen}
        onOpenChange={setMergeConfirmOpen}
        title="Подтверждение объединения материалов"
        consequenceText={`Вы уверены, что хотите объединить материал #${material.material_id} («${material.canonical_name}») в материал #${targetMergeId}? Данное действие необратимо: предложения и синонимы перейдут в целевую карточку.`}
        confirmLabel="Да, объединить дубли"
        variant="danger"
        loading={merging}
        onConfirm={handleExecuteMerge}
      />
    </div>
  );
};

