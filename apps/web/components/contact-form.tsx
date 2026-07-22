'use client';

import { FormEvent, useState } from 'react';

type FormErrors = Partial<Record<'name' | 'contact' | 'task', string>>;

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextErrors: FormErrors = {};
    const name = String(form.get('name') ?? '').trim();
    const contact = String(form.get('contact') ?? '').trim();
    const task = String(form.get('task') ?? '').trim();

    if (name.length < 2) nextErrors.name = 'Укажите имя минимум из двух символов.';
    if (!contact.includes('@') && contact.replace(/\D/g, '').length < 7) {
      nextErrors.contact = 'Укажите корректный email или номер телефона.';
    }
    if (task.length < 20) nextErrors.task = 'Опишите задачу немного подробнее — минимум 20 символов.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Спасибо</p>
        <h3 className="mt-3 text-2xl font-black text-slate-950">Запрос сохранен в демоверсии</h3>
        <p className="mt-3 leading-7 text-slate-600">
          На следующем этапе подключим реальную отправку, защиту от спама и передачу обращения в
          Jira или CRM.
        </p>
        <button
          type="button"
          className="mt-6 font-bold text-blue-600"
          onClick={() => setSubmitted(false)}
        >
          Отправить еще один запрос
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl bg-white p-6 shadow-2xl shadow-slate-950/10 md:p-8">
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-bold text-slate-700">
          Ваше имя
        </label>
        <input
          id="name"
          name="name"
          aria-invalid={Boolean(errors.name)}
          className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Как к вам обращаться"
        />
        {errors.name && <p className="mt-2 text-sm font-bold text-red-600">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="company" className="mb-2 block text-sm font-bold text-slate-700">
          Компания
        </label>
        <input
          id="company"
          name="company"
          className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Название компании"
        />
      </div>
      <div>
        <label htmlFor="contact" className="mb-2 block text-sm font-bold text-slate-700">
          Телефон или email
        </label>
        <input
          id="contact"
          name="contact"
          aria-invalid={Boolean(errors.contact)}
          className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Как с вами связаться"
        />
        {errors.contact && <p className="mt-2 text-sm font-bold text-red-600">{errors.contact}</p>}
      </div>
      <div>
        <label htmlFor="task" className="mb-2 block text-sm font-bold text-slate-700">
          Задача
        </label>
        <textarea
          id="task"
          name="task"
          rows={4}
          aria-invalid={Boolean(errors.task)}
          className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Кратко опишите, что требуется автоматизировать"
        />
        {errors.task && <p className="mt-2 text-sm font-bold text-red-600">{errors.task}</p>}
      </div>
      <button
        type="submit"
        className="min-h-13 rounded-xl bg-blue-600 px-6 font-bold text-white transition hover:bg-blue-700"
      >
        Отправить запрос
      </button>
      <p className="text-xs leading-5 text-slate-500">
        Сейчас форма работает в демонстрационном режиме и не передает данные на сервер.
      </p>
    </form>
  );
}
