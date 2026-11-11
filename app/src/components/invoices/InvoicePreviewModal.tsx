import React, { useEffect, useRef, useState } from 'react';
import { isoDate, money, percent, quantity } from "../../lib/format";
import { apiClient } from '../../api/client';
import type { ClientRequest, Invoice, InvoicePreview, InvoiceSettings, MoyskladEntity } from '../../types/models';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { DemoInvoicePreviewModal } from './DemoInvoicePreviewModal';
import { CounterpartyForm } from './CounterpartyForm';
import { errorText } from "../../lib/errors";
import { getUiPreferences, saveUiPreferences } from "../../storage/preferences";

export interface InvoicePreviewModalProps {
  open: boolean; onOpenChange: (open: boolean) => void; request: ClientRequest;
  onInvoiceCreated: (invoice: Invoice) => void; onNavigateToInvoices?: () => void;
  /** Строки, выбранные оператором для частичного счёта. */
  positionIds?: number[];
}
const env = (import.meta as ImportMeta & { env: { MODE: string; VITE_USE_MOCK?: string; DEV?: boolean } }).env;
/** Только идентификаторы справочников МойСклад: ни клиента, ни сумм, ни секретов. */
function readRemembered() {
  const saved = getUiPreferences();
  return { organization_id: saved.invoiceOrganizationId, store_id: saved.invoiceStoreId };
}
function remember(value: { organization_id: string; store_id: string }) {
  saveUiPreferences({ invoiceOrganizationId: value.organization_id, invoiceStoreId: value.store_id });
}
export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = props =>
  env.MODE === 'test' || env.VITE_USE_MOCK === 'true'
    ? <DemoInvoicePreviewModal {...props} /> : <LiveInvoicePreview {...props} />;

export function LiveInvoicePreview({ open, onOpenChange, request, onInvoiceCreated, positionIds }: InvoicePreviewModalProps) {
  const [settings, setSettings] = useState<InvoiceSettings>(() => ({
    position_ids: positionIds ?? request.positions.filter(p => p.status === 'confirmed' && !p.invoiced_operation_id).map(p => p.position_id),
    organization_id: '', agent_id: '', store_id: '', doc_date: isoDate(),
    pricing_mode: request.pricing?.pricing_mode ?? 'discount', target_percent: request.pricing?.target_percent ?? 0,
    vat_enabled: request.pricing?.vat_enabled ?? false, vat_included: request.pricing?.vat_included ?? false,
    vat_rate: request.pricing?.vat_rate ?? 0, merge: false, comment: `Заявка ${request.doc_number}`,
  }));
  const [dicts, setDicts] = useState<Record<string, MoyskladEntity[]>>({});
  const [search, setSearch] = useState(request.client_name);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [result, setResult] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newAgent, setNewAgent] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const requisiteRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const requisites = [
    { kind: 'organization', key: 'organization_id', label: 'Продавец', message: 'Выберите продавца' },
    { kind: 'store', key: 'store_id', label: 'Склад', message: 'Выберите склад' },
    { kind: 'counterparty', key: 'agent_id', label: 'Контрагент / клиент', message: 'Выберите контрагента' },
  ] as const;
  useEffect(() => {
    if (!open || !request.pricing) return;
    // Настройки расчёта живут в шапке заявки; окно счёта только читает их.
    setSettings(current => ({ ...current, ...request.pricing }));
    setPreview(null); setResult(null);
  }, [open, request.pricing]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all(['organization', 'store', 'counterparty'].map(async kind =>
      [kind, (await apiClient.getMoyskladDictionary(kind)).data] as const))
      .then(rows => {
        if (cancelled) return;
        const loaded = Object.fromEntries(rows);
        setDicts(loaded);
        // Продавец и склад почти всегда одни и те же: подставляем последние использованные.
        const remembered = readRemembered();
        setSettings(current => ({
          ...current,
          organization_id: current.organization_id || (loaded.organization?.some(r => r.id === remembered.organization_id) ? remembered.organization_id : ''),
          store_id: current.store_id || (loaded.store?.some(r => r.id === remembered.store_id) ? remembered.store_id : ''),
        }));
      })
      .catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [open]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    // Поиск клиента по мере ввода: один запрос после паузы, без отдельной кнопки.
    if (!open) return;
    const query = search.trim();
    if (query === request.client_name.trim() && dicts.counterparty) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const rows = (await apiClient.getMoyskladDictionary('counterparty', query)).data;
        if (cancelled) return;
        setDicts(d => ({ ...d, counterparty: rows }));
        setSettings(current => rows.some(r => r.id === current.agent_id) ? current : { ...current, agent_id: '' });
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // dicts.counterparty намеренно не в зависимостях: он меняется этим же эффектом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, request.client_name]);
  const change = (patch: Partial<InvoiceSettings>) => {
    setSettings(current => ({ ...current, ...patch })); setPreview(null); setResult(null); setError('');
    setMissingFields(fields => fields.filter(key => !(key in patch)));
  };
  function calculatePreview() {
    const missing = requisites.filter(field => !settings[field.key]);
    setMissingFields(missing.map(field => field.key));
    if (missing.length) {
      requisiteRefs.current[missing[0].key]?.focus();
      if (env.DEV) console.debug('[FIX] invoice_missing_requisites', missing.map(field => field.key));
      return;
    }
    void run(async () => { setPreview(null); setPreview((await apiClient.previewInvoice(request.request_id, settings)).data); });
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const invoice = result || preview?.invoice_preview;
  return <Modal open={open} onOpenChange={onOpenChange} title="Счёт: предпросмотр и создание" maxWidth="1080px"
    description="Выберите позиции и реквизиты. Созданный счёт остаётся непроведённым.">
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {result ? <>
        <Alert tone={result.status === 'created' ? 'success' : 'warning'}>
          {result.status === 'created' ? `Создан и сверен счёт № ${result.number}` : result.error_text || 'Операция выполняется'}
          <p>Состояние: {result.operation_state}</p>
        </Alert>
        {result.moysklad_href && <a href={result.moysklad_href} target="_blank" rel="noreferrer">Открыть в МойСклад</a>}
        {result.status !== 'created' && <Button disabled={busy} onClick={() => run(async () => {
          const next = (await apiClient.retryInvoice(result.invoice_id)).data; setResult(next); onInvoiceCreated(next);
        })}>Проверить результат / повторить операцию</Button>}
      </> : <>
        <fieldset disabled={busy} className="requisites-grid"><legend>Параметры этого счёта</legend>
          {requisites.map(({ kind, key, label, message }) => {
            const invalid = missingFields.includes(key);
            return <div className="field" key={kind}>
              <label className="field__label" htmlFor={`invoice-${key}`}>{label}</label>
              <select id={`invoice-${key}`} ref={node => { requisiteRefs.current[key] = node; }}
                aria-invalid={invalid || undefined} aria-describedby={invalid ? `invoice-${key}-error` : undefined}
                value={settings[key]} onChange={e => change({ [key]: e.target.value })}>
                <option value="">Выберите из МойСклад</option>
                {(dicts[kind] || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              {invalid && <span className="field__error" id={`invoice-${key}-error`} role="alert">{message}</span>}
            </div>;
          })}
          <Input label="Поиск клиента" placeholder="Начните вводить название или ИНН" value={search}
            hint={searching ? 'Ищем в МойСклад…' : 'Список контрагентов выше фильтруется по мере ввода'}
            onChange={e => setSearch(e.target.value)} />
          <Button onClick={() => setNewAgent(!newAgent)}>Добавить контрагента</Button>
          <Input label="Дата" type="date" value={settings.doc_date} onChange={e => change({ doc_date: e.target.value })} />
          <p className="text-xs text-muted">
            Расчёт задан в шапке заявки: {settings.pricing_mode === 'discount' ? 'скидка' : 'маржа'} {settings.target_percent}%,
            {' '}{settings.vat_enabled ? `НДС ${settings.vat_rate}%${settings.vat_included ? ' включён в цену' : ''}` : 'без НДС'}.
            Изменить можно в карточке заявки.
          </p>
          <label><input type="checkbox" checked={settings.merge} onChange={e => change({ merge: e.target.checked })} /> Объединять полностью одинаковые строки</label>
          <Input label="Комментарий" value={settings.comment} onChange={e => change({ comment: e.target.value })} />
        </fieldset>
        {newAgent && <CounterpartyForm onCreated={row => {
          setDicts(d => ({ ...d, counterparty: [...(d.counterparty || []), row] }));
          change({ agent_id: row.id }); setNewAgent(false);
        }} />}
        <fieldset disabled={busy}><legend>Позиции счёта</legend>
          {request.positions.map(p => <label key={p.position_id} className="checkbox-field">
            <input type="checkbox" checked={settings.position_ids.includes(p.position_id)} disabled={!!p.invoiced_operation_id}
              onChange={e => change({ position_ids: e.target.checked ? [...settings.position_ids, p.position_id] : settings.position_ids.filter(id => id !== p.position_id) })} />
            {p.raw_text} — {p.parsed_qty} {p.parsed_unit} ({p.invoiced_operation_id ? 'выставлено' : p.status === 'confirmed' ? 'подтверждено' : 'не подтверждено'})
          </label>)}
        </fieldset>
        <Button disabled={busy} onClick={calculatePreview}>Рассчитать предпросмотр</Button>
        {preview?.blocking_reasons.map(reason => <Alert key={reason} tone="danger">{reason}</Alert>)}
        {preview?.warnings.map(reason => <Alert key={reason} tone="warning">{reason}</Alert>)}
        {preview && <p>Исключено позиций: {preview.excluded_position_ids?.length || 0}</p>}
      </>}
      {invoice && <>
        <div className="dt"><div className="dt__scroll"><table className="dt__table"><thead><tr>
          {['Наименование', 'Количество', 'Розница', 'Цена после расчёта', 'Полная закупка / ед.', 'Итого', 'Исходные строки'].map((x, i) => <th key={x} className={i > 0 && i < 6 ? 'dt__num' : undefined}>{x}</th>)}
        </tr></thead><tbody>{invoice.positions?.map(p => <tr key={p.position_id}>
          <td>{p.name}</td><td className="dt__right tabular-nums">{quantity(p.qty)} {p.unit}</td><td className="dt__right tabular-nums">{money(p.price_retail)}</td><td className="dt__right tabular-nums">{money(p.price_final)}</td><td className="dt__right tabular-nums">{money(p.price_purchase)}</td><td className="dt__right tabular-nums">{money(p.sum_total)}</td>
          <td>{((p as typeof p & { source_position_ids?: number[] }).source_position_ids || [p.position_id]).join(', ')}</td>
        </tr>)}</tbody></table></div></div>
        <p>Итого: {money(invoice.sum_total)} · Без НДС: {money(invoice.sum_without_vat)} · НДС: {money(invoice.sum_vat)} · Закупка: {money(invoice.sum_purchase)}</p>
        <p>Прибыль: {money(invoice.profit)} · Скидка: {percent(invoice.actual_discount)} · Маржа: {percent(invoice.actual_margin)} · Наценка: {percent(invoice.markup)}</p>
        <p>Остаток округления: {money(invoice.rounding_residual)}</p>
      </>}
      {!result && <Button disabled={busy || !preview?.preview_id || !!preview.blocking_reasons.length} onClick={() => run(async () => {
        if (!preview?.preview_id) return;
        const created = (await apiClient.createInvoice({ request_id: request.request_id, preview_id: preview.preview_id,
          client_name: '', organization: '', warehouse: '', doc_date: settings.doc_date, vat_rate: '' })).data;
        remember({ organization_id: settings.organization_id, store_id: settings.store_id });
        setResult(created); onInvoiceCreated(created);
      })}>{busy ? 'Выполняется…' : 'Создать счёт в МойСклад'}</Button>}
    </div>
  </Modal>;
}
