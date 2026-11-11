import { TooltipProvider } from "../components/common/Tooltip";
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LiveInvoicePreview } from '../components/invoices/InvoicePreviewModal';
import { apiClient } from '../api/client';
import type { ClientRequest, Invoice } from '../types/models';
import { InvoiceDetailDrawer } from '../components/invoices/InvoiceDetailDrawer';

const pricing = { pricing_mode: 'discount' as const, target_percent: 10, vat_enabled: true,
  vat_included: true, vat_rate: 20 };
const request: ClientRequest = { request_id: 1, client_name: 'fixture', doc_number: 'TEST', status: 'confirmed',
  pricing, files: [], created_at: '', updated_at: '', positions: [{ position_id: 1, raw_text: 'fixture', parsed_qty: 2,
    parsed_unit: 'шт', matched_material_id: 42, matched_material_name: 'fixture', confidence: 100,
    status: 'confirmed', reasoning: null, selected_supplier_id: 7, selected_price: 60, alternatives: [], flags: [] }] };
const invoice: Invoice = { invoice_id: 0, request_id: 1, number: '', doc_date: '2026-10-21', client_name: 'fixture',
  sum_total: 216, status: 'draft', moysklad_href: null, error_text: null, positions_count: 1, created_at: '' };

describe('Настоящий интерфейс счёта', () => {
  it('результат остаётся видимым после обновления исходной заявки', async () => {
    vi.spyOn(apiClient, 'getMoyskladDictionary').mockResolvedValue({ data: [{ id: 'uuid', name: 'fixture', meta: { href: 'fixture' } }] });
    vi.spyOn(apiClient, 'previewInvoice').mockResolvedValue({ data: { preview_id: 'p', invoice_preview: invoice, blocking_reasons: [], warnings: [] } });
    const created = { ...invoice, invoice_id: 1, number: '6761', status: 'created' as const,
      moysklad_href: 'https://online.moysklad.ru/app/#invoiceout/edit?id=fixture' };
    const post = vi.spyOn(apiClient, 'createInvoice').mockResolvedValue({ data: created });
    const callback = vi.fn();
    const { rerender } = render(<LiveInvoicePreview open onOpenChange={() => {}} request={request} onInvoiceCreated={callback} />);
    await screen.findAllByRole('option', { name: 'fixture' });
    for (const label of ['Продавец', 'Склад', 'Контрагент / клиент']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'uuid' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать предпросмотр' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Создать счёт в МойСклад' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Создать счёт в МойСклад' }));
    await screen.findByText('Создан и сверен счёт № 6761');
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ preview_id: 'p' }));
    expect(callback).toHaveBeenCalledWith(created);
    rerender(<LiveInvoicePreview open onOpenChange={() => {}} request={{ ...request, status: 'invoiced' }} onInvoiceCreated={callback} />);
    expect(screen.getByText('Создан и сверен счёт № 6761')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть в МойСклад' })).toHaveAttribute('href', created.moysklad_href);
    vi.restoreAllMocks();
  });
  it('поиск клиента фильтрует список по мере ввода без отдельной кнопки', async () => {
    const dictionary = vi.spyOn(apiClient, 'getMoyskladDictionary').mockImplementation(async (kind, query = '') => ({
      data: kind === 'counterparty' && query === 'Строй'
        ? [{ id: 'found', name: 'ООО Строй', meta: { href: 'fixture' } }]
        : [{ id: 'uuid', name: 'fixture', meta: { href: 'fixture' } }],
    }));
    render(<LiveInvoicePreview open onOpenChange={() => {}} request={request} onInvoiceCreated={() => {}} />);
    await screen.findAllByRole('option', { name: 'fixture' });
    expect(screen.queryByRole('button', { name: 'Найти клиента' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Поиск клиента'), { target: { value: 'Строй' } });
    await screen.findByRole('option', { name: 'ООО Строй' });
    expect(dictionary).toHaveBeenCalledWith('counterparty', 'Строй');
    vi.restoreAllMocks();
  });
  it('карточка показывает чистую маржу и конечную цену без повторной скидки', () => {
    const data = { ...invoice, sum_without_vat: 180, sum_purchase: 120, actual_margin: 100 / 3,
      positions: [{ position_id: 1, material_id: 1, code: 'fixture', name: 'fixture', qty: 2, unit: 'шт',
        price_retail: 120, discount_percent: 0, price_final: 108, sum_total: 216, vat_rate: '20%',
        supplier: 'fixture', price_purchase: 60, margin_sum: 60, margin_percent: 100 / 3 }] };
    render(<TooltipProvider><InvoiceDetailDrawer invoice={data} open onClose={() => {}} /></TooltipProvider>);
    expect(screen.getByText('33,33%')).toBeInTheDocument();
    expect(screen.getByText('108,00 ₽')).toBeInTheDocument();
  });
  it('изменение настроек в шапке заявки снимает готовность отправки', async () => {
    vi.spyOn(apiClient, 'getMoyskladDictionary').mockResolvedValue({ data: [{ id: 'uuid', name: 'fixture', meta: { href: 'fixture' } }] });
    vi.spyOn(apiClient, 'previewInvoice').mockResolvedValue({ data: { preview_id: 'preview-uuid', invoice_preview: invoice, blocking_reasons: [], warnings: [] } });
    const { rerender } = render(<LiveInvoicePreview open onOpenChange={() => {}} request={request} onInvoiceCreated={() => {}} />);
    const submit = screen.getByRole('button', { name: 'Создать счёт в МойСклад' });
    expect(submit).toBeDisabled();
    await screen.findAllByRole('option', { name: 'fixture' });
    for (const label of ['Продавец', 'Склад', 'Контрагент / клиент']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'uuid' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать предпросмотр' }));
    await waitFor(() => expect(submit).toBeEnabled());
    rerender(<LiveInvoicePreview open onOpenChange={() => {}}
      request={{ ...request, pricing: { ...pricing, target_percent: 15 } }} onInvoiceCreated={() => {}} />);
    expect(screen.getByRole('button', { name: 'Создать счёт в МойСклад' })).toBeDisabled();
    expect(screen.queryByText(/Итого: 216/)).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('убыток предупреждает и допускает создание, изменение НДС в шапке требует нового preview', async () => {
    vi.spyOn(apiClient, 'getMoyskladDictionary').mockResolvedValue({ data: [{ id: 'uuid', name: 'fixture', meta: { href: 'fixture' } }] });
    vi.spyOn(apiClient, 'previewInvoice').mockResolvedValue({ data: { preview_id: 'p', invoice_preview: invoice,
      blocking_reasons: [], warnings: ['Счёт убыточен'] } });
    const { rerender } = render(<LiveInvoicePreview open onOpenChange={() => {}} request={request} onInvoiceCreated={() => {}} />);
    await screen.findAllByRole('option', { name: 'fixture' });
    for (const label of ['Продавец', 'Склад', 'Контрагент / клиент']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'uuid' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Рассчитать предпросмотр' }));
    await screen.findByText('Счёт убыточен');
    expect(screen.getByRole('button', { name: 'Создать счёт в МойСклад' })).toBeEnabled();
    rerender(<LiveInvoicePreview open onOpenChange={() => {}}
      request={{ ...request, pricing: { ...pricing, vat_enabled: false, vat_included: false, vat_rate: 0 } }}
      onInvoiceCreated={() => {}} />);
    expect(screen.getByRole('button', { name: 'Создать счёт в МойСклад' })).toBeDisabled();
    vi.restoreAllMocks();
  });
});
