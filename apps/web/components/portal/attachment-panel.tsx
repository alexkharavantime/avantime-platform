'use client';

import { ChangeEvent, useEffect, useState } from 'react';
type Attachment = { id: string; name: string; mimeType: string; size: number; createdAt: string; downloadUrl?: string };

export function AttachmentPanel({ requestId }: { requestId: string }) {
  const [items, setItems] = useState<Attachment[]>([]); const [message, setMessage] = useState(''); const [pending, setPending] = useState(false);
  useEffect(() => { fetch(`/api/requests/${requestId}/attachments`).then((r)=>r.json()).then((data: { attachments?: Attachment[] })=>setItems(data.attachments ?? [])); }, [requestId]);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; setMessage(''); setPending(true);
    const form = new FormData(); form.set('file', file);
    const response = await fetch(`/api/requests/${requestId}/attachments`, { method: 'POST', body: form });
    const data = (await response.json()) as { attachment?: Attachment; error?: string }; setPending(false); event.target.value='';
    if (!response.ok || !data.attachment) return setMessage(data.error ?? 'Не удалось добавить файл.');
    setItems((current)=>[data.attachment!, ...current]); setMessage('Файл загружен и доступен для скачивания.');
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-black">Вложения</h2><p className="mt-1 text-sm text-slate-500">До 10 МБ. Файлы сохраняются на сервере.</p></div><label className={`cursor-pointer rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white ${pending?'opacity-60':''}`}>{pending?'Загрузка…':'Добавить файл'}<input disabled={pending} type="file" className="hidden" onChange={choose} /></label></div>{message && <p className="mt-4 text-sm font-bold text-blue-700">{message}</p>}<div className="mt-5 space-y-3">{items.length === 0 ? <p className="text-slate-500">Вложений пока нет.</p> : items.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"><div><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{(item.size / 1024).toFixed(1)} КБ · {new Date(item.createdAt).toLocaleString('ru-RU')}</p></div>{item.downloadUrl && <a className="text-sm font-black text-blue-700" href={item.downloadUrl}>Скачать</a>}</div>)}</div></section>;
}
