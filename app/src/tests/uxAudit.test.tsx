import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CategoryTree } from '../components/catalog/CategoryTree';
import { CatalogCart } from '../components/requests/CatalogCart';
import { LiveInvoicePreview } from '../components/invoices/InvoicePreviewModal';
import { TooltipProvider } from '../components/common/Tooltip';
import { apiClient } from '../api/client';
import type { ClientRequest, Material } from '../types/models';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('reveals a selected subcategory when dictionaries arrive', async () => {
  const props = { selectedCategory: 'Кабель', onSelectCategory: vi.fn() };
  const { rerender } = render(<CategoryTree {...props} categories={[]} />);
  rerender(<CategoryTree {...props} categories={[{ name: 'Инженерные системы', count: 2,
    subcategories: [{ name: 'Кабель', count: 2 }] }]} />);
  expect(await screen.findByRole('button', { name: /Кабель/ })).toHaveAttribute('aria-pressed', 'true');
});

it('loads further search results, retries a failed page and preserves cart quantity', async () => {
  const material = (id: number): Material => ({ material_id: id, canonical_name: `Кабель ${id}`,
    unit: 'м', weight_kg: null, category: '', subcategory: '', brand: '', status: 'active',
    aliases_count: 0, offers: [], flags: [], best_purchase: null });
  const search = vi.spyOn(apiClient, 'getMaterials')
    .mockResolvedValueOnce({ data: [material(1)], meta: { total: 2 } })
    .mockRejectedValueOnce(new Error('Нет соединения'))
    .mockResolvedValueOnce({ data: [material(2)], meta: { total: 2 } });
  render(<TooltipProvider><CatalogCart onCreated={vi.fn()} /></TooltipProvider>);
  fireEvent.change(screen.getByLabelText('Поиск по внутренней базе'), { target: { value: 'Кабель' } });
  fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
  await screen.findByText('Показано 1 из 2');
  fireEvent.click(screen.getByRole('button', { name: 'Добавить Кабель 1' }));
  fireEvent.change(screen.getByLabelText('Количество, м'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  await screen.findByText(/Нет соединения/);
  fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
  await screen.findByText('Показано 2 из 2');
  expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Кабель', page: 2 }));
  expect(screen.getByLabelText('Количество, м')).toHaveValue(12);
  expect(screen.getByRole('button', { name: 'Добавить Кабель 2' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
});

it('names missing invoice fields and focuses them without calling preview', async () => {
  vi.spyOn(apiClient, 'getMoyskladDictionary').mockResolvedValue({ data: [{ id: 'fixture', name: 'Выбор', meta: { href: '' } }] });
  const preview = vi.spyOn(apiClient, 'previewInvoice');
  render(<LiveInvoicePreview open onOpenChange={vi.fn()} onInvoiceCreated={vi.fn()}
    request={{ positions: [], client_name: '', doc_number: '' } as unknown as ClientRequest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Рассчитать предпросмотр' }));
  expect(screen.getByText('Выберите продавца')).toBeInTheDocument();
  expect(screen.getByText('Выберите склад')).toBeInTheDocument();
  expect(screen.getByText('Выберите контрагента')).toBeInTheDocument();
  expect(screen.getByLabelText('Продавец')).toHaveFocus();
  expect(preview).not.toHaveBeenCalled();
  await screen.findAllByRole('option', { name: 'Выбор' });
  fireEvent.change(screen.getByLabelText('Продавец'), { target: { value: 'fixture' } });
  fireEvent.click(screen.getByRole('button', { name: 'Рассчитать предпросмотр' }));
  await waitFor(() => expect(screen.getByLabelText('Склад')).toHaveFocus());
  expect(screen.queryByText('Выберите продавца')).not.toBeInTheDocument();
});
