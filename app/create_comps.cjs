const fs = require('fs');
const p = 'src/components/common/';

fs.writeFileSync(p + 'Input.tsx', `
import React from 'react';
export const Input = ({ label, value, onChange, placeholder, type, icon, autoFocus, style, className, disabled }: any) => {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 8px', background: 'var(--color-bg-elevated)' }}>
        {icon && <span style={{ marginRight: '8px' }}>{icon}</span>}
        <input 
          autoFocus={autoFocus} disabled={disabled} type={type || 'text'} placeholder={placeholder} value={value} onChange={onChange} 
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent' }} 
        />
      </div>
    </div>
  );
};
`);

fs.writeFileSync(p + 'Modal.tsx', `
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export const Modal = ({ open, onOpenChange, title, description, children, maxWidth }: any) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-bg-elevated)', padding: '24px', borderRadius: '8px', zIndex: 101, width: '90vw', maxWidth: maxWidth || '500px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <Dialog.Title style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</Dialog.Title>
            <Dialog.Close asChild><button style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={16} /></button></Dialog.Close>
          </div>
          {description && <Dialog.Description style={{ marginBottom: '16px', color: 'var(--color-text-muted)' }}>{description}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
`);

fs.writeFileSync(p + 'ConfirmDialog.tsx', `
import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
export const ConfirmDialog = ({ open, title, message, confirmLabel, cancelLabel, variant, loading, onConfirm, onCancel }: any) => {
  return (
    <Modal open={open} onOpenChange={(val: boolean) => !val && onCancel()} title={title} description={message}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel || 'Отмена'}</Button>
        <Button variant={variant || 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel || 'Подтвердить'}</Button>
      </div>
    </Modal>
  );
};
`);

fs.writeFileSync(p + 'DropZone.tsx', `
import React from 'react';
export const DropZone = ({ onFileDrop, accept, multiple }: any) => {
  return (
    <div style={{ border: '2px dashed var(--color-border)', padding: '32px', textAlign: 'center', borderRadius: '8px' }}>
      <input type="file" onChange={(e) => { if(e.target.files && e.target.files.length > 0) onFileDrop(e.target.files[0]) }} accept={accept} multiple={multiple} />
      <p>Перетащите файлы сюда</p>
    </div>
  );
};
`);

fs.writeFileSync(p + 'DataTable.tsx', `
import React from 'react';
export const DataTable = ({ data, columns }: any) => {
  return <div>Table</div>;
};
`);

fs.writeFileSync(p + 'ErrorState.tsx', `
import React from 'react';
import { Button } from './Button';
export const ErrorState = ({ message, details, onRetry }: any) => {
  return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-danger)' }}>
      <h3>{message}</h3>
      <p>{details}</p>
      {onRetry && <Button onClick={onRetry}>Повторить</Button>}
    </div>
  );
};
`);

fs.writeFileSync(p + 'EmptyState.tsx', `
import React from 'react';
export const EmptyState = ({ title, description, icon, action }: any) => {
  return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      {icon && <div style={{ marginBottom: '16px' }}>{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
};
`);

fs.writeFileSync(p + 'ProgressBar.tsx', `
import React from 'react';
export const ProgressBar = ({ progress, label }: any) => {
  return (
    <div>
      {label && <div>{label}</div>}
      <div style={{ height: '8px', background: 'var(--color-bg-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: \`\${progress}%\`, height: '100%', background: 'var(--color-accent)' }} />
      </div>
    </div>
  );
};
`);
