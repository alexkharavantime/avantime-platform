export const locales = ['lv', 'ru', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'lv';

export const localeNames: Record<Locale, string> = {
  lv: 'Latviešu',
  ru: 'Русский',
  en: 'English',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function localePath(locale: Locale, path = '/') {
  if (!path.startsWith('/')) return path;
  if (path === '/') return `/${locale}`;
  if (locales.some((candidate) => path === `/${candidate}` || path.startsWith(`/${candidate}/`))) {
    return path;
  }
  return `/${locale}${path}`;
}

export function stripLocale(path: string) {
  const stripped = path.replace(/^\/(lv|ru|en)(?=\/|$)/, '');
  return stripped || '/';
}

export type SharedCopy = {
  navigation: {
    oneC: string;
    solutions: string;
    approach: string;
    knowledge: string;
    assistant: string;
    portal: string;
    contact: string;
    menuOpen: string;
    menuClose: string;
    back: string;
  };
  footer: {
    description: string;
    sections: string;
    platform: string;
    site: string;
    portal: string;
    ai: string;
    jira: string;
    copyright: string;
  };
  contact: {
    name: string;
    company: string;
    contact: string;
    task: string;
    namePlaceholder: string;
    companyPlaceholder: string;
    contactPlaceholder: string;
    taskPlaceholder: string;
    submit: string;
    demoNotice: string;
    thankYou: string;
    saved: string;
    sendAnother: string;
    nameError: string;
    contactError: string;
    taskError: string;
  };
};

export const sharedCopy: Record<Locale, SharedCopy> = {
  lv: {
    navigation: {
      oneC: '1C',
      solutions: 'Risinājumi',
      approach: 'Pieeja',
      knowledge: 'Zināšanu bāze',
      assistant: 'AI konsultants',
      portal: 'Klienta kabinets',
      contact: 'Pārrunāt uzdevumu',
      menuOpen: 'Atvērt izvēlni',
      menuClose: 'Aizvērt izvēlni',
      back: '← Atpakaļ',
    },
    footer: {
      description: '1C, mākslīgais intelekts un integrācijas praktiskai biznesa automatizācijai.',
      sections: 'Sadaļas',
      platform: 'Platforma',
      site: 'Vietne · Klienta portāls · AI platforma',
      portal: 'Klienta kabinets',
      ai: 'AI konsultants',
      jira: 'Jira integrācija',
      copyright: '© 2026 Avantime',
    },
    contact: {
      name: 'Jūsu vārds',
      company: 'Uzņēmums',
      contact: 'Tālrunis vai e-pasts',
      task: 'Uzdevums',
      namePlaceholder: 'Kā jūs uzrunāt',
      companyPlaceholder: 'Uzņēmuma nosaukums',
      contactPlaceholder: 'Kā ar jums sazināties',
      taskPlaceholder: 'Īsi aprakstiet, ko nepieciešams automatizēt',
      submit: 'Nosūtīt pieprasījumu',
      demoNotice: 'Šobrīd forma darbojas demonstrācijas režīmā un nenosūta datus uz serveri.',
      thankYou: 'Paldies',
      saved: 'Pieprasījums saglabāts demonstrācijā',
      sendAnother: 'Nosūtīt vēl vienu pieprasījumu',
      nameError: 'Norādiet vārdu, kas ir vismaz divus simbolus garš.',
      contactError: 'Norādiet pareizu e-pastu vai tālruņa numuru.',
      taskError: 'Aprakstiet uzdevumu nedaudz detalizētāk — vismaz 20 simboli.',
    },
  },
  ru: {
    navigation: {
      oneC: '1С',
      solutions: 'Решения',
      approach: 'Подход',
      knowledge: 'База знаний',
      assistant: 'AI-консультант',
      portal: 'Кабинет',
      contact: 'Обсудить задачу',
      menuOpen: 'Открыть меню',
      menuClose: 'Закрыть меню',
      back: '← Назад',
    },
    footer: {
      description: '1С, искусственный интеллект и интеграции для практической автоматизации бизнеса.',
      sections: 'Разделы',
      platform: 'Платформа',
      site: 'Сайт · Клиентский портал · AI-платформа',
      portal: 'Клиентский кабинет',
      ai: 'AI-консультант',
      jira: 'Интеграция с Jira',
      copyright: '© 2026 Avantime',
    },
    contact: {
      name: 'Ваше имя',
      company: 'Компания',
      contact: 'Телефон или email',
      task: 'Задача',
      namePlaceholder: 'Как к вам обращаться',
      companyPlaceholder: 'Название компании',
      contactPlaceholder: 'Как с вами связаться',
      taskPlaceholder: 'Кратко опишите, что требуется автоматизировать',
      submit: 'Отправить запрос',
      demoNotice: 'Сейчас форма работает в демонстрационном режиме и не передаёт данные на сервер.',
      thankYou: 'Спасибо',
      saved: 'Запрос сохранён в демоверсии',
      sendAnother: 'Отправить ещё один запрос',
      nameError: 'Укажите имя минимум из двух символов.',
      contactError: 'Укажите корректный email или номер телефона.',
      taskError: 'Опишите задачу немного подробнее — минимум 20 символов.',
    },
  },
  en: {
    navigation: {
      oneC: '1C',
      solutions: 'Solutions',
      approach: 'Approach',
      knowledge: 'Knowledge base',
      assistant: 'AI consultant',
      portal: 'Client portal',
      contact: 'Discuss a task',
      menuOpen: 'Open menu',
      menuClose: 'Close menu',
      back: '← Back',
    },
    footer: {
      description: '1C, artificial intelligence and integrations for practical business automation.',
      sections: 'Sections',
      platform: 'Platform',
      site: 'Website · Client portal · AI platform',
      portal: 'Client portal',
      ai: 'AI consultant',
      jira: 'Jira integration',
      copyright: '© 2026 Avantime',
    },
    contact: {
      name: 'Your name',
      company: 'Company',
      contact: 'Phone or email',
      task: 'Task',
      namePlaceholder: 'How should we address you?',
      companyPlaceholder: 'Company name',
      contactPlaceholder: 'How can we reach you?',
      taskPlaceholder: 'Briefly describe what needs to be automated',
      submit: 'Send request',
      demoNotice: 'The form is currently in demo mode and does not send data to the server.',
      thankYou: 'Thank you',
      saved: 'Request saved in the demo',
      sendAnother: 'Send another request',
      nameError: 'Enter a name of at least two characters.',
      contactError: 'Enter a valid email address or phone number.',
      taskError: 'Please describe the task in more detail — at least 20 characters.',
    },
  },
};
