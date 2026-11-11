import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FolderOpen,
  History,
  Import as ImportIcon,
  RefreshCw,
  ShieldCheck,
  TableProperties,
} from "lucide-react";
import { toast } from "sonner";
import { dateTime, money, plural, quantity } from "../lib/format";
import { apiClient } from "../api/client";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { DropZone, type UploadedFileItem } from "../components/common/DropZone";
import { Select } from "../components/common/Select";
import { fingerprintBuffer, parseWorkbook, type ImportPreview, type ImportSupplier } from "../features/import/productImport";
import type { ImportReport } from "../types/models";
import { isTauriEnvironment, readInputDocFiles } from "../services/tauriBridge";
import { errorText } from "../lib/errors";

const SUPPLIERS: Array<{ value: "auto" | ImportSupplier; label: string }> = [
  { value: "auto", label: "Определить автоматически" },
  { value: "Петрович", label: "Петрович" },
  { value: "СТК Строй", label: "СТК Строй" },
  { value: "СибЭлКом", label: "СибЭлКом" },
  { value: "Кнауф Дом", label: "Кнауф Дом" },
  { value: "НОМЕНКЛАТУРА", label: "НОМЕНКЛАТУРА (без цены)" },
];

function formatPrice(value: number | null) {
  return money(value);
}

function reportTone(action: ImportReport["items"][number]["action"]) {
  return action === "review" ? "warning" : action === "created" ? "success" : action === "updated" ? "accent" : "neutral";
}

export const ImportsPage: React.FC = () => {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [supplier, setSupplier] = useState<"auto" | ImportSupplier>("auto");
  const [priceType, setPriceType] = useState<"auto" | "purchase" | "retail">("auto");
  const [previews, setPreviews] = useState<ImportPreview[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [recentReports, setRecentReports] = useState<ImportReport[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingInputFolder, setLoadingInputFolder] = useState(false);

  const loadReports = async () => {
    try {
      const response = await apiClient.getImportReports();
      setRecentReports(response.data);
    } catch {
      // Импорт остаётся доступным даже при недоступности журнала.
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const reparse = async (nextFiles: UploadedFileItem[] = files, nextSupplier = supplier, nextPriceType = priceType) => {
    setFiles(nextFiles);
    if (!nextFiles.length) {
      setPreviews([]);
      return;
    }
    setLoadingPreview(true);
    try {
      const parsed = await Promise.all(nextFiles.filter((item) => item.file).map(async (item) => {
        const buffer = await item.file!.arrayBuffer();
        const fingerprint = await fingerprintBuffer(buffer, item.name);
        return parseWorkbook(buffer, item.name, nextSupplier === "auto" ? undefined : nextSupplier, new Date().toISOString(), nextPriceType === "auto" ? undefined : nextPriceType, fingerprint);
      }));
      setPreviews(parsed);
      setReport(null);
    } catch (error) {
      toast.error(`Не удалось прочитать прайс-лист: ${errorText(error)}`);
      setPreviews([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const allRows = useMemo(() => previews.flatMap((preview) => preview.rows), [previews]);
  const categorySummary = useMemo(() => {
    const counts = new Map<string, number>();
    allRows.forEach((row) => counts.set(row.subcategory, (counts.get(row.subcategory) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [allRows]);

  const handleImport = async () => {
    if (!previews.length || !allRows.length) return;
    setImporting(true);
    try {
      let lastReport: ImportReport | null = null;
      for (const preview of previews) {
        const response = await apiClient.importSupplierRows({
          source_file: preview.source_file,
          fingerprint: preview.fingerprint,
          supplier: preview.supplier,
          imported_at: new Date().toISOString(),
          rows: preview.rows,
          skipped_rows: preview.skipped_rows,
          warnings: preview.warnings,
        });
        lastReport = response.data;
      }
      setReport(lastReport);
      await loadReports();
      toast.success("Импорт завершён. Предложения поставщиков обновлены.");
    } catch (error) {
      toast.error(`Импорт не выполнен: ${errorText(error)}`);
    } finally {
      setImporting(false);
    }
  };

  const handleLoadInputFolder = async () => {
    setLoadingInputFolder(true);
    try {
      const sourceFiles = await readInputDocFiles();
      if (!sourceFiles.length) {
        toast.error("Папка input_doc не найдена или в ней нет XLS/XLSX-файлов.");
        return;
      }
      const parsed = await Promise.all(sourceFiles.map((sourceFile) => {
        const bytes = new Uint8Array(sourceFile.bytes);
        return fingerprintBuffer(bytes.buffer, sourceFile.name).then((fingerprint) => parseWorkbook(bytes.buffer, sourceFile.name, supplier === "auto" ? undefined : supplier, new Date().toISOString(), priceType === "auto" ? undefined : priceType, fingerprint));
      }));
      setFiles(sourceFiles.map((sourceFile) => ({ name: sourceFile.name, size: sourceFile.bytes.length, type: "application/vnd.ms-excel" })));
      setPreviews(parsed);
      setReport(null);
      toast.success(`Из input_doc прочитано файлов: ${sourceFiles.length}`);
    } catch (error) {
      toast.error(`Не удалось прочитать input_doc: ${errorText(error)}`);
    } finally {
      setLoadingInputFolder(false);
    }
  };

  return (
    <div className="stack import-page">
      <div className="detail-topbar">
        <div>
          <h1 className="page__title">Импорт прайс-листов</h1>
          <p className="page__subtitle">Единая номенклатура, актуальные цены и безопасное сопоставление предложений</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={loadReports}>
          Обновить журнал
        </Button>
      </div>

      <div className="import-grid">
        <Card title={<span className="card-title-row"><ImportIcon size={16} /> Загрузить файлы</span>} subtitle="XLS и XLSX, один или несколько файлов за раз">
          <div className="stack">
            {isTauriEnvironment() && <div className="row row--end"><Button variant="secondary" size="sm" icon={<FolderOpen size={15} />} loading={loadingInputFolder} onClick={handleLoadInputFolder}>Загрузить из input_doc</Button></div>}
            <div className="import-toolbar">
              <label className="field import-supplier-field">
                <span className="field__label">Поставщик</span>
                <Select value={supplier} onChange={(event) => {
                  const next = event.target.value as "auto" | ImportSupplier;
                  setSupplier(next);
                  void reparse(files, next);
                }} aria-label="Поставщик прайс-листа">
                  {SUPPLIERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
                <span className="field__hint">Для файлов из папки input_doc можно оставить автоопределение</span>
              </label>
              <div className="import-rule-note">
                <ShieldCheck size={16} />
                <span>Неснижаемый остаток и резерв не импортируются. Пустые поля не затирают сохранённые значения.</span>
              </div>
            </div>
            {(supplier === "auto" || supplier === "Петрович") && (
              <label className="field import-supplier-field">
                <span className="field__label">Тип цены для Петровича</span>
                <Select value={priceType} onChange={(event) => {
                  const next = event.target.value as "auto" | "purchase" | "retail";
                  setPriceType(next);
                  void reparse(files, supplier, next);
                }} aria-label="Тип цены Петровича">
                  <option value="auto">Авто: по имени файла</option>
                  <option value="purchase">Закупочная / себестоимость</option>
                  <option value="retail">Розничная</option>
                </Select>
                <span className="field__hint">Для двух файлов «Прайс-лист.xlsx» из разных папок выберите тип вручную.</span>
              </label>
            )}
            <DropZone
              files={files}
              onFilesChange={(next) => void reparse(next)}
              accept=".xlsx,.xls"
              multiple
              disabled={loadingPreview || importing}
              hint="Excel (.xlsx, .xls) · исходные файлы не изменяются"
            />
          </div>
        </Card>

        <Card title={<span className="card-title-row"><TableProperties size={16} /> Правила импорта</span>} subtitle="Как файл будет сопоставлен с каталогом">
          <ul className="import-rules">
            <li>Внутреннее наименование: рабочее и печатное</li>
            <li>Идентификаторы: UUID, код, артикул, EAN</li>
            <li>Повторы отсекаются по поставщику и постоянному ID</li>
            <li>При сомнении создаётся отдельный товар на проверку</li>
          </ul>
          {categorySummary.length > 0 && (
            <div className="import-categories">
              <div className="text-xs text-muted">Категории в предпросмотре</div>
              <div className="row row--wrap">
                {categorySummary.map(([name, count]) => <Badge key={name} variant="neutral" pill>{name} · {count}</Badge>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      {previews.length > 0 && (
        <Card
          title={<span className="card-title-row"><FileSpreadsheet size={16} /> Предпросмотр распознанных колонок</span>}
          subtitle={`${previews.length} ${plural(previews.length, "файл", "файла", "файлов")}, ${quantity(allRows.length)} валидных строк`}
          actions={<Button variant="primary" size="sm" loading={importing} disabled={loadingPreview || !allRows.length} onClick={handleImport}>Импортировать</Button>}
        >
          <div className="stack">
            {previews.map((preview) => (
              <div key={preview.fingerprint} className="import-file-preview">
                <div className="row row--between row--wrap">
                  <div className="row row--tight"><strong>{preview.source_file}</strong><Badge variant="accent" pill>{preview.supplier}</Badge></div>
                  <span className="text-xs text-muted">Лист: {preview.sheet_name} · заголовок: строка {preview.mapping.header_row + 1}</span>
                </div>
                <div className="row row--wrap import-mapping">
                  <span>Наименование: <strong>{preview.mapping.name || "не найдено"}</strong></span>
                  <span>Ед.: <strong>{preview.mapping.unit || "не найдено"}</strong></span>
                  <span>Цена: <strong>{preview.mapping.price || "нет"}</strong></span>
                  <span>ID: <strong>{preview.mapping.identifiers.join(", ") || "нет"}</strong></span>
                </div>
                {preview.warnings.map((warning) => <div className="inline-msg inline-msg--warning" key={warning}><AlertTriangle size={14} /> {warning}</div>)}
              </div>
            ))}

            <div className="dt dt--auto">
              <div className="dt__scroll">
                <table className="dt__table">
                  <thead className="dt__thead"><tr><th>Исходное наименование</th><th>Рабочее наименование</th><th>Печатное наименование</th><th>Ед.</th><th>Цена</th><th>Идентификатор</th></tr></thead>
                  <tbody>
                    {allRows.slice(0, 12).map((row) => <tr className="dt__row" key={`${row.fingerprint}-${row.row_number}`}>
                      <td className="dt__strong">{row.raw_name}</td>
                      <td>{row.working_name}</td>
                      <td>{row.print_name}</td>
                      <td>{row.unit || "—"}</td>
                      <td className="dt__right dt__numeric">{formatPrice(row.price)}</td>
                      <td className="mono text-xs">{Object.values(row.identifiers).filter(Boolean).join(" / ") || "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
            {allRows.length > 12 && <div className="text-xs text-muted">Показаны первые 12 строк. Полный набор будет обработан при импорте.</div>}
          </div>
        </Card>
      )}

      {report && (
        <Card title={<span className="card-title-row"><CheckCircle2 size={16} /> Отчёт последнего импорта</span>} subtitle={`${report.source_file} · ${dateTime(report.imported_at)}`}>
          <div className="import-report-grid">
            <div className="import-stat"><strong>{report.created}</strong><span>создано</span></div>
            <div className="import-stat"><strong>{report.updated}</strong><span>обновлено</span></div>
            <div className="import-stat"><strong>{report.skipped}</strong><span>пропущено</span></div>
            <div className="import-stat import-stat--warning"><strong>{report.review}</strong><span>требуют проверки</span></div>
          </div>
          {report.duplicate_file && <div className="inline-msg inline-msg--warning"><AlertTriangle size={14} /> Повторная загрузка того же файла заблокирована как дубль.</div>}
          {report.review > 0 && <div className="import-review-note"><AlertTriangle size={15} /> Сомнительные строки созданы отдельными товарами и помечены «Требует проверки», чтобы не объединять похожие позиции автоматически.</div>}
          <div className="dt dt--auto import-report-table"><div className="dt__scroll"><table className="dt__table"><thead className="dt__thead"><tr><th>Строка</th><th>Исходное наименование</th><th>Действие</th><th>Товар</th><th>Причина</th></tr></thead><tbody>{report.items.slice(0, 30).map((item) => <tr className="dt__row" key={`${report.import_id}-${item.row_number}`}><td>{item.row_number}</td><td className="dt__strong">{item.raw_name}</td><td><Badge variant={reportTone(item.action)} pill>{item.action === "review" ? "Проверка" : item.action === "created" ? "Создан" : item.action === "updated" ? "Обновлён" : "Пропущен"}</Badge></td><td className="mono">{item.material_id ? `#${item.material_id}` : "—"}</td><td className="text-muted">{item.reason}</td></tr>)}</tbody></table></div></div>
        </Card>
      )}

      <Card title={<span className="card-title-row"><History size={16} /> История запусков</span>} subtitle="Сохраняется только журнал импортов и актуальные цены; история цен не ведётся">
        {recentReports.length ? <div className="stack stack--tighter">{recentReports.slice(0, 8).map((item) => <div className="import-history-row" key={item.import_id}><div className="row row--tight"><FileSpreadsheet size={14} className="text-accent" /><strong>{item.source_file}</strong><Badge variant={item.duplicate_file ? "warning" : item.review ? "warning" : "success"} pill>{item.duplicate_file ? "дубль" : item.review ? "есть проверка" : "готово"}</Badge></div><span className="text-xs text-muted">{item.supplier} · создано {quantity(item.created)} · обновлено {quantity(item.updated)} · {dateTime(item.imported_at)}</span></div>)}</div> : <div className="empty-state empty-state--compact">Запусков импорта пока нет.</div>}
      </Card>
    </div>
  );
};
