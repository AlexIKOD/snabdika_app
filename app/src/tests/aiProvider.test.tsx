import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIProviderSettings } from '../components/settings/AIProviderSettings';
import { AppLayout } from '../components/layout/AppLayout';
import { apiClient } from '../api/client';
import * as bridge from '../services/tauriBridge';
import * as localApi from '../services/localApi';
import { MemoryRouter } from 'react-router-dom';
import type { AppSettings } from '../types/models';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('OhMyLama', () => {
  it('показывает выбранную модель и сохраняет ключ отдельно от настроек', async () => {
    vi.spyOn(bridge, 'getSecretStatus').mockResolvedValue({ key: 'ohmylama_api_key', is_set: true, updated_at: null });
    const save = vi.spyOn(bridge, 'setSecret').mockResolvedValue({ key: 'ohmylama_api_key', status: 'stored', updated_at: 'today' });
    const change = vi.fn();
    render(<AIProviderSettings settings={{ ai_provider: 'ohmylama', ai_model: 'gpt-6-luna' } as AppSettings} onChange={change} />);
    expect(await screen.findByText('Установлен')).toBeInTheDocument();
    expect(screen.getByLabelText('Модель OhMyLama')).toHaveValue('gpt-6-luna');
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    fireEvent.change(screen.getByLabelText(/Новый API-ключ OhMyLama/), { target: { value: 'fixture-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Записать в хранилище' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('ohmylama_api_key', 'fixture-secret'));
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('fixture-secret')).toBeNull();
  });

  it('показывает ошибку квоты при проверке API', async () => {
    vi.spyOn(bridge, 'getSecretStatus').mockResolvedValue({ key: 'ohmylama_api_key', is_set: true, updated_at: null });
    const fetch = vi.spyOn(localApi, 'localApiFetch').mockRejectedValue(new Error('OhMyLama HTTP 402. Проверьте баланс аккаунта'));
    render(<AIProviderSettings settings={{ ai_provider: 'ohmylama' } as AppSettings} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(await screen.findByRole('status')).toHaveTextContent('HTTP 402');
    expect(fetch).toHaveBeenCalledWith('/api/integrations/ohmylama/test', { cache: 'no-store' });
  });

  it('footer использует статус активного провайдера, даже когда Gemini недоступен', async () => {
    const health = (await apiClient.getHealth()).data;
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({ data: { ...health,
      gemini: { available: false, status_text: 'Не проверено' },
      ai: { provider: 'ohmylama', model: 'gpt-6-luna', available: false, status_text: 'Нет квоты' } } });
    render(<MemoryRouter><AppLayout /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'OhMyLama: не проверено' })).toHaveAttribute('title', 'Нет квоты');
    expect(screen.queryByRole('button', { name: /Gemini:/ })).toBeNull();
  });
});
