'use client';

import { ChangeEvent, useRef, useState } from 'react';
import type { Locale } from '../lib/i18n';

type UploadedDocument = {
  id: string;
  name: string;
  storedName: string;
  type: string;
  size: number;
  status: string;
  uploadedAt: string;
};

type DocumentUploadProps = {
  locale: Locale;
  onUploaded?: (document: UploadedDocument) => void;
};

const copy = {
  lv: { uploading: 'Augšupielādē…', upload: 'Augšupielādēt PDF', uploaded: 'PDF augšupielādēts, apstrāde sākta.', privacy: 'Izgūtais teksts tiks nosūtīts ārējam AI pakalpojumu sniedzējam.', error: 'Neizdevās augšupielādēt dokumentu.' },
  ru: { uploading: 'Загружаем…', upload: 'Загрузить PDF', uploaded: 'PDF загружен, обработка началась.', privacy: 'Извлечённый текст будет передан внешнему AI-провайдеру.', error: 'Не удалось загрузить документ.' },
  en: { uploading: 'Uploading…', upload: 'Upload PDF', uploaded: 'PDF uploaded; processing has started.', privacy: 'Extracted text will be sent to an external AI provider.', error: 'Could not upload the document.' },
} satisfies Record<Locale, { uploading: string; upload: string; uploaded: string; privacy: string; error: string }>;

export function DocumentUpload({ locale, onUploaded }: DocumentUploadProps) {
  const text = copy[locale];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json()) as {
        document?: UploadedDocument;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || text.error);
      }
      if (!result.document) throw new Error(text.error);

      onUploaded?.(result.document);
      setSuccess(text.uploaded);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : text.error,
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? text.uploading : text.upload}
      </button>

      {error ? <p className="mt-2 max-w-sm text-sm font-semibold text-red-600">{error}</p> : null}
      {success ? <p role="status" className="mt-2 max-w-sm text-sm font-semibold text-emerald-700">{success}</p> : null}
      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{text.privacy}</p>
    </div>
  );
}
