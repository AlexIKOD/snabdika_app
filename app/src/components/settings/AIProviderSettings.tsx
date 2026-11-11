import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '../common/Card';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Check, CircleAlert, Plug } from 'lucide-react';
import type { AppSettings } from '../../types/models';
import { createSecretString } from '../../types/security';
import { getSecretStatus, setSecret } from '../../services/tauriBridge';
import { localApiFetch } from '../../services/localApi';
import { errorText } from "../../lib/errors";

export const AIProviderSettings: React.FC<{
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}> = ({ settings, onChange }) => {
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [secret, setSecretValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    getSecretStatus('ohmylama_api_key').then(status => setIsSet(status.is_set))
      .catch(() => setIsSet(null));
  }, []);
  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!secret.trim()) return;
    const value = createSecretString(secret.trim());
    setSecretValue('');
    setSaving(true);
    try {
      const stored = await setSecret('ohmylama_api_key', value);
      if (stored.status !== 'stored') throw new Error(stored.error_message || 'Ключ не сохранён');
      setIsSet(true);
      setEditing(false);
      setResult('Ключ OhMyLama сохранён в системном хранилище Windows');
    } catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  };
  const testConnection = async () => {
    setTesting(true);
    setResult('');
    try {
      const response = await localApiFetch('/api/integrations/ohmylama/test', { cache: 'no-store' });
      const data = await response.json();
      setResult(data.data.message);
    } catch (error) { setResult(errorText(error)); }
    finally { setTesting(false); }
  };
  const ohmylama = (settings.ai_provider || 'gemini') === 'ohmylama';
  return <Card title="Провайдер ИИ-сопоставления">
    <div className="stack">
      <Select label="ИИ-провайдер" value={settings.ai_provider || 'gemini'}
        onChange={event => onChange({ ...settings, ai_provider: event.target.value as 'gemini' | 'ohmylama' })}>
        <option value="ohmylama">OhMyLama</option>
        <option value="gemini">Google Gemini</option>
      </Select>
      {ohmylama && <>
      <Input label="Адрес API OhMyLama" value={settings.ai_base_url || 'https://ohmylama.ru/v1'} readOnly />
      <Input label="Модель OhMyLama" value={settings.ai_model || 'gpt-6-luna'}
        onChange={event => onChange({ ...settings, ai_model: event.target.value })}
        hint="После смены провайдера или модели нажмите «Сохранить настройки». Проверка использует сохранённую модель." />
      <div className="row row--between row--wrap">
        <div>
          <div className="text-medium">API-ключ OhMyLama</div>
          <div className="text-xs text-muted">Используется для разбора заявок и подбора из каталога</div>
        </div>
        <div className="row row--tight">
          {isSet === null ? <Badge variant="neutral" pill>Статус неизвестен</Badge>
            : isSet ? <Badge variant="success" pill icon={<Check size={13} strokeWidth={2.25} />}>Установлен</Badge>
            : <Badge variant="danger" pill icon={<CircleAlert size={13} strokeWidth={2} />}>Не установлен</Badge>}
          <Button variant="secondary" size="sm" onClick={() => { setSecretValue(''); setEditing(!editing); }}>
            {editing ? 'Отмена' : 'Изменить'}
          </Button>
          <Button variant="ghost" size="sm" icon={<Plug size={14} strokeWidth={1.75} />} loading={testing} onClick={() => void testConnection()}>Проверить</Button>
        </div>
      </div>
      {editing && <form className="secret-form" onSubmit={event => void saveKey(event)}>
        <Input label="Новый API-ключ OhMyLama" requiredMark type="password" autoComplete="off" value={secret}
          onChange={event => setSecretValue(event.target.value)} required autoFocus />
        <Button type="submit" variant="primary" loading={saving} disabled={!secret.trim()}>Записать в хранилище</Button>
      </form>}
      </>}
      {result && <p role="status" className="text-muted">{result}</p>}
    </div>
  </Card>;
};
