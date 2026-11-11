import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import type { MoyskladEntity } from '../../types/models';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { errorText } from "../../lib/errors";

export function CounterpartyForm({ onCreated }: { onCreated: (entity: MoyskladEntity) => void }) {
  const [fields, setFields] = useState({ name: '', inn: '', kpp: '', email: '', phone: '', description: '', companyType: 'legal' });
  const [definitions, setDefinitions] = useState<{ id: string; name: string; type: string }[]>([]);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiClient.getMoyskladMetadata('counterparty').then(r => {
      const data = r.data.attributes as { rows?: typeof definitions } | undefined;
      if (data?.rows) setDefinitions(data.rows);
    }).catch(e => setError(errorText(e)));
  }, []);
  return <fieldset disabled={busy} className="stack"><legend>Новый клиент в МойСклад</legend>
    {error && <Alert tone="danger">{error}</Alert>}
    {Object.entries({ name: 'Наименование', inn: 'ИНН', kpp: 'КПП', email: 'Email', phone: 'Телефон', description: 'Описание' }).map(([key, label]) =>
      <Input key={key} label={label} value={fields[key as keyof typeof fields]} onChange={e => setFields(s => ({ ...s, [key]: e.target.value }))} />)}
    <label>Тип контрагента <select value={fields.companyType} onChange={e => setFields(s => ({ ...s, companyType: e.target.value }))}>
      <option value="legal">Юридическое лицо</option><option value="entrepreneur">ИП</option><option value="individual">Физическое лицо</option>
    </select></label>
    {definitions.filter(d => ['string', 'text', 'double', 'long', 'boolean', 'time'].includes(d.type)).map(d =>
      <Input key={d.id} label={`Служебное поле: ${d.name}`} value={attributes[d.id] || ''}
        hint={d.type === 'boolean' ? 'true или false' : d.type}
        onChange={e => setAttributes(a => ({ ...a, [d.id]: e.target.value }))} />)}
    <Button disabled={!fields.name.trim()} onClick={async () => {
      setBusy(true); setError('');
      try {
        const row = (await apiClient.createMoyskladCounterparty({ ...fields,
          attributes: definitions.filter(d => attributes[d.id]?.trim()).map(d => ({ id: d.id,
            value: ['double', 'long'].includes(d.type) ? Number(attributes[d.id]) : d.type === 'boolean' ? attributes[d.id] === 'true' : attributes[d.id] })),
        })).data;
        onCreated(row);
      } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
    }}>Сохранить клиента в МойСклад</Button>
  </fieldset>;
}
