export const locales = ['lv', 'ru', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'lv';
export const localeCookieName = 'avantime_locale';
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

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
  const unlocalizedPath = stripLocale(path);
  return unlocalizedPath === '/' ? `/${locale}` : `/${locale}${unlocalizedPath}`;
}

export function stripLocale(path: string) {
  const stripped = path.replace(/^\/(lv|ru|en)(?=\/|$)/, '');
  return stripped || '/';
}

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split('/')[1];
  return isLocale(segment) ? segment : defaultLocale;
}

export function localeFromAcceptLanguage(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const preferences = value.split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(';');
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    return { tag: tag?.split('-')[0]?.toLowerCase(), quality, index };
  });
  preferences.sort((left, right) => right.quality - left.quality || left.index - right.index);
  return preferences.find((preference) => isLocale(preference.tag))?.tag as Locale | undefined;
}

export function resolveLocale(
  pathname: string,
  savedLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  const pathLocale = pathname.split('/')[1];
  if (isLocale(pathLocale)) return pathLocale;
  if (isLocale(savedLocale)) return savedLocale;
  return localeFromAcceptLanguage(acceptLanguage) ?? defaultLocale;
}

export type SharedCopy = {
  navigation: {
    brandTagline: string;
    languageLabel: string;
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
    savedNextStep: string;
    sendAnother: string;
    nameError: string;
    contactError: string;
    taskError: string;
  };
};

export const sharedCopy: Record<Locale, SharedCopy> = {
  lv: {
    navigation: {
      brandTagline: 'Biznesa automatizācija',
      languageLabel: 'Valoda',
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
      savedNextStep: 'Nākamajā posmā pieslēgsim īstu nosūtīšanu, aizsardzību pret surogātpastu un pieprasījuma nodošanu Jira vai CRM.',
      sendAnother: 'Nosūtīt vēl vienu pieprasījumu',
      nameError: 'Norādiet vārdu, kas ir vismaz divus simbolus garš.',
      contactError: 'Norādiet pareizu e-pastu vai tālruņa numuru.',
      taskError: 'Aprakstiet uzdevumu nedaudz detalizētāk — vismaz 20 simboli.',
    },
  },
  ru: {
    navigation: {
      brandTagline: 'Автоматизация бизнеса',
      languageLabel: 'Язык',
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
      savedNextStep: 'На следующем этапе подключим реальную отправку, защиту от спама и передачу обращения в Jira или CRM.',
      sendAnother: 'Отправить ещё один запрос',
      nameError: 'Укажите имя минимум из двух символов.',
      contactError: 'Укажите корректный email или номер телефона.',
      taskError: 'Опишите задачу немного подробнее — минимум 20 символов.',
    },
  },
  en: {
    navigation: {
      brandTagline: 'Business automation',
      languageLabel: 'Language',
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
      savedNextStep: 'Next, we can connect real submission, spam protection, and forwarding the request to Jira or a CRM.',
      sendAnother: 'Send another request',
      nameError: 'Enter a name of at least two characters.',
      contactError: 'Enter a valid email address or phone number.',
      taskError: 'Please describe the task in more detail — at least 20 characters.',
    },
  },
};

export type HomeCopy = {
  hero: {
    badge: string;
    title: [string, string, string];
    description: string;
    primaryCta: string;
    solutionsCta: string;
    proofs: string[];
  };
  stripTitle: string;
  stripLinks: { label: string; href: string }[];
  capabilities: { number: string; title: string; text: string }[];
  capabilitiesIntro: { eyebrow: string; title: string; text: string; link: string };
  secondaryIntro: { eyebrow: string; title: string };
  secondaryCards: { label: string; title: string; text: string }[];
  approach: {
    eyebrow: string;
    title: string;
    text: string;
    outcomes: { title: string; text: string }[];
  };
  contact: {
    eyebrow: string;
    title: string;
    text: string;
    proofs: string[];
  };
  footer: {
    description: string;
    solutions: string;
    implementation: string;
    ai: string;
    integrations: string;
    company: string;
    knowledge: string;
    assistant: string;
    portal: string;
    location: string;
    stack: string;
  };
};

export const homeCopy: Record<Locale, HomeCopy> = {
  ru: {
    hero: {
      badge: 'Avantime',
      title: ['Бизнес-системы,', 'которые работают', 'вместе'],
      description: 'Объединяем учёт, торговлю, склад и ваши цифровые сервисы в единую систему. Внедряем и развиваем решения на базе 1С, настраиваем обмен данными и помогаем сократить ручную работу.',
      primaryCta: 'Обсудить задачу',
      solutionsCta: 'Наши решения',
      proofs: ['От первой консультации до поддержки', 'Интеграции без повторного ввода', 'Развитие автоматизации'],
    },
    stripTitle: 'Решения для вашей работы',
    stripLinks: [
      { label: 'Конфигурации 1С', href: '/solutions/1c/configurations' },
      { label: 'Agent+', href: '/solutions/agent-plus' },
      { label: 'AI', href: '/solutions/ai' },
      { label: 'Cloud', href: '/solutions/cloud' },
      { label: 'Интеграции и ЭДО', href: '/solutions/integrations' },
    ],
    capabilities: [
      { number: '01', title: 'Разбираемся в задаче', text: 'Изучаем ваши процессы, программы и ограничения. Уточняем, какой результат нужен сотрудникам и руководителю.' },
      { number: '02', title: 'Согласовываем решение', text: 'Определяем объём работ, этапы и критерии готовности. Объясняем, что изменится в повседневной работе.' },
      { number: '03', title: 'Внедряем и проверяем', text: 'Настраиваем систему, тестируем рабочие сценарии и помогаем пользователям освоить изменения.' },
      { number: '04', title: 'Поддерживаем и развиваем', text: 'Остаёмся на связи после запуска и адаптируем решение по мере изменения задач бизнеса.' },
    ],
    capabilitiesIntro: { eyebrow: '1С и автоматизация учёта', title: 'Решения для вашей работы', text: 'Настраиваем программы под реальные процессы компании: бухгалтерию, продажи, закупки, склад и производство. Сохраняем необходимые данные и функции, добавляя только нужные изменения.', link: 'Все конфигурации 1С' },
    secondaryIntro: { eyebrow: 'Решения для вашей работы', title: 'От учёта и интеграций до поддержки и AI' },
    secondaryCards: [
      { label: '1С · Управление торговлей', title: '1С и автоматизация учёта', text: 'Настраиваем программы под бухгалтерию, продажи, закупки, склад и производство: внедряем, дорабатываем и обновляем системы с сохранением нужных данных.' },
      { label: 'Интеграции', title: 'Интеграции и обмен данными', text: 'Связываем 1С с интернет-магазинами, банками, ЭДО и другими сервисами, чтобы сотрудники не вводили одну информацию несколько раз.' },
      { label: 'Поддержка', title: 'Сопровождение и поддержка', text: 'Помогаем пользователям, разбираемся в ошибках, обновляем программы и дорабатываем отчёты с понятным планом решения.' },
      { label: 'AI', title: 'Искусственный интеллект для бизнеса', text: 'Находим практичные сценарии для поиска информации, базы знаний, подготовки ответов и обработки типовых запросов.' },
    ],
    approach: {
      eyebrow: 'Знакомые задачи — понятные решения', title: 'Помогаем убрать препятствия в ежедневной работе', text: 'Находим причину проблемы, предлагаем понятный порядок действий и проверяем результат на реальных рабочих сценариях.',
      outcomes: [
        { title: 'Данные приходится переносить вручную?', text: 'Настроим обмен между системами и сократим повторный ввод.' },
        { title: 'Программа больше не соответствует процессам?', text: 'Изучим существующую настройку и предложим необходимые доработки.' },
        { title: 'Сложно получить нужный отчёт?', text: 'Поможем собрать данные и представить их в удобном для работы виде.' },
        { title: 'Ошибки мешают сотрудникам работать?', text: 'Найдём причину, исправим проблему и проверим затронутые сценарии.' },
      ],
    },
    contact: { eyebrow: 'Обсудим вашу задачу?', title: 'Поможем определить следующий шаг', text: 'Расскажите, что хотите улучшить: учёт, обмен данными, отчётность или работу пользователей. Можно начать с описания проблемы — мы поможем определить следующий шаг.', proofs: ['Изучим текущий процесс и ограничения', 'Определим ожидаемый результат', 'Предложим понятный формат первого этапа'] },
    footer: { description: 'Внедрение и развитие решений на базе 1С, интеграции и поддержка автоматизации бизнеса.', solutions: 'Решения', implementation: 'Внедрение 1С', ai: 'AI для бизнеса', integrations: 'Интеграции и ЭДО', company: 'Компания', knowledge: 'База знаний', assistant: 'AI-консультант', portal: 'Кабинет клиента', location: 'Рига, Латвия', stack: '1С · AI · Cloud · Integrations · Agent+' },
  },
  lv: {
    hero: {
      badge: 'Avantime',
      title: ['Biznesa sistēmas,', 'kas darbojas', 'kopā'],
      description: 'Apvienojam uzskaiti, tirdzniecību, noliktavu un jūsu digitālos pakalpojumus vienā sistēmā. Ieviešam un attīstām 1C risinājumus, iestatām datu apmaiņu un palīdzam samazināt manuālo darbu.',
      primaryCta: 'Pārrunāt uzdevumu',
      solutionsCta: 'Mūsu risinājumi',
      proofs: ['No pirmās konsultācijas līdz atbalstam', 'Integrācijas bez atkārtotas ievades', 'Automatizācijas attīstība'],
    },
    stripTitle: 'Risinājumi jūsu darbam',
    stripLinks: [
      { label: '1C konfigurācijas', href: '/solutions/1c/configurations' },
      { label: 'Agent+', href: '/solutions/agent-plus' },
      { label: 'AI', href: '/solutions/ai' },
      { label: 'Mākonis', href: '/solutions/cloud' },
      { label: 'Integrācijas un EDI', href: '/solutions/integrations' },
    ],
    capabilities: [
      { number: '01', title: 'Izprotam uzdevumu', text: 'Izpētām jūsu procesus, programmas un ierobežojumus. Precizējam, kāds rezultāts vajadzīgs darbiniekiem un vadībai.' },
      { number: '02', title: 'Vienojamies par risinājumu', text: 'Nosakām darbu apjomu, posmus un gatavības kritērijus. Izskaidrojam, kas mainīsies ikdienas darbā.' },
      { number: '03', title: 'Ieviešam un pārbaudām', text: 'Iestatām sistēmu, testējam darba scenārijus un palīdzam lietotājiem apgūt izmaiņas.' },
      { number: '04', title: 'Atbalstām un attīstām', text: 'Esam sasniedzami arī pēc ieviešanas un pielāgojam risinājumu uzņēmuma vajadzībām.' },
    ],
    capabilitiesIntro: { eyebrow: '1C un uzskaites automatizācija', title: 'Risinājumi jūsu darbam', text: 'Pielāgojam programmas uzņēmuma faktiskajiem procesiem: grāmatvedībai, pārdošanai, iepirkumiem, noliktavai un ražošanai. Saglabājam vajadzīgos datus un funkcijas, pievienojot tikai nepieciešamās izmaiņas.', link: 'Visas 1C konfigurācijas' },
    secondaryIntro: { eyebrow: 'Risinājumi jūsu darbam', title: 'No uzskaites un integrācijām līdz atbalstam un AI' },
    secondaryCards: [
      { label: '1C · Tirdzniecības vadība', title: '1C un uzskaites automatizācija', text: 'Iestatām programmas grāmatvedībai, pārdošanai, iepirkumiem, noliktavai un ražošanai: ieviešam, pielāgojam un atjaunojam sistēmas, saglabājot vajadzīgos datus.' },
      { label: 'Integrācijas', title: 'Integrācijas un datu apmaiņa', text: 'Savienojam 1C ar interneta veikaliem, bankām, EDI un citiem servisiem, lai darbiniekiem nebūtu jāievada viena informācija atkārtoti.' },
      { label: 'Atbalsts', title: 'Uzturēšana un atbalsts', text: 'Palīdzam lietotājiem, risinām kļūdas, atjaunojam programmas un pilnveidojam pārskatus ar skaidru rīcības plānu.' },
      { label: 'AI', title: 'Mākslīgais intelekts uzņēmumam', text: 'Atrodam praktiskus scenārijus informācijas meklēšanai, zināšanu bāzei, atbilžu sagatavošanai un tipisku pieprasījumu apstrādei.' },
    ],
    approach: {
      eyebrow: 'Pazīstami uzdevumi — saprotami risinājumi', title: 'Palīdzam novērst ikdienas darba šķēršļus', text: 'Atrodam problēmas cēloni, piedāvājam skaidru rīcības kārtību un pārbaudām rezultātu reālos darba scenārijos.',
      outcomes: [
        { title: 'Dati jāievada manuāli?', text: 'Iestatīsim sistēmu apmaiņu un samazināsim atkārtotu ievadi.' },
        { title: 'Programma vairs neatbilst procesiem?', text: 'Izpētīsim esošos iestatījumus un piedāvāsim vajadzīgos uzlabojumus.' },
        { title: 'Grūti iegūt vajadzīgo pārskatu?', text: 'Palīdzēsim apkopot datus un parādīt tos ērtā darba formā.' },
        { title: 'Kļūdas traucē darbiniekiem?', text: 'Atradīsim cēloni, novērsīsim problēmu un pārbaudīsim skartos scenārijus.' },
      ],
    },
    contact: { eyebrow: 'Pārrunāsim jūsu uzdevumu', title: 'Palīdzēsim noteikt nākamo soli', text: 'Pastāstiet, ko vēlaties uzlabot: uzskaiti, datu apmaiņu, pārskatus vai lietotāju darbu. Sāciet ar problēmas aprakstu — palīdzēsim noteikt nākamo soli.', proofs: ['Izpētīsim pašreizējo procesu un ierobežojumus', 'Noteiksim sagaidāmo rezultātu', 'Piedāvāsim saprotamu pirmo posmu'] },
    footer: { description: '1C risinājumu ieviešana un attīstība, integrācijas un atbalsts praktiskai biznesa automatizācijai.', solutions: 'Risinājumi', implementation: '1C ieviešana', ai: 'AI uzņēmumam', integrations: 'Integrācijas un EDI', company: 'Uzņēmums', knowledge: 'Zināšanu bāze', assistant: 'AI konsultants', portal: 'Klienta kabinets', location: 'Rīga, Latvija', stack: '1C · AI · Mākonis · Integrācijas · Agent+' },
  },
  en: {
    hero: {
      badge: 'Avantime',
      title: ['Business systems', 'that work', 'together'],
      description: 'We bring accounting, trade, inventory and your digital services into one system. We implement and develop 1C solutions, configure data exchange and help reduce manual work.',
      primaryCta: 'Discuss your task',
      solutionsCta: 'Our solutions',
      proofs: ['From first consultation to support', 'Integrations without duplicate entry', 'Automation that keeps developing'],
    },
    stripTitle: 'Solutions for your work',
    stripLinks: [
      { label: '1C configurations', href: '/solutions/1c/configurations' },
      { label: 'Agent+', href: '/solutions/agent-plus' },
      { label: 'AI', href: '/solutions/ai' },
      { label: 'Cloud', href: '/solutions/cloud' },
      { label: 'Integrations and EDI', href: '/solutions/integrations' },
    ],
    capabilities: [
      { number: '01', title: 'Understand the task', text: 'We study your processes, systems and constraints, then clarify the outcome employees and managers need.' },
      { number: '02', title: 'Agree the solution', text: 'We define the scope, stages and acceptance criteria, and explain what will change in everyday work.' },
      { number: '03', title: 'Implement and check', text: 'We configure the system, test working scenarios and help users adopt the changes.' },
      { number: '04', title: 'Support and develop', text: 'We stay available after launch and adapt the solution as your business needs change.' },
    ],
    capabilitiesIntro: { eyebrow: '1C and accounting automation', title: 'Solutions for your work', text: 'We configure applications around real business processes: accounting, sales, purchasing, inventory and production. We preserve the data and functions you need, adding only the right changes.', link: 'All 1C configurations' },
    secondaryIntro: { eyebrow: 'Solutions for your work', title: 'From accounting and integrations to support and AI' },
    secondaryCards: [
      { label: '1C · Trade Management', title: '1C and accounting automation', text: 'We configure applications for accounting, sales, purchasing, inventory and production: implementation, customisation and upgrades with your data preserved.' },
      { label: 'Integrations', title: 'Integrations and data exchange', text: 'We connect 1C with online stores, banks, EDI and other services so employees do not enter the same information twice.' },
      { label: 'Support', title: 'Maintenance and support', text: 'We help users, investigate errors, update applications and improve reports with a clear plan of action.' },
      { label: 'AI', title: 'Artificial intelligence for business', text: 'We find practical scenarios for information search, knowledge bases, answer preparation and routine requests.' },
    ],
    approach: {
      eyebrow: 'Familiar tasks — practical solutions', title: 'Remove obstacles from everyday work', text: 'We find the cause of a problem, propose a clear sequence of actions and check the result in real working scenarios.',
      outcomes: [
        { title: 'Are you moving data manually?', text: 'We will configure system exchange and reduce duplicate entry.' },
        { title: 'Does the application no longer fit your processes?', text: 'We will review the current setup and propose the right improvements.' },
        { title: 'Is it difficult to get the report you need?', text: 'We will help assemble the data and present it in a useful working format.' },
        { title: 'Are errors getting in the way?', text: 'We will find the cause, fix the problem and check the affected scenarios.' },
      ],
    },
    contact: { eyebrow: 'Discuss your task', title: 'We will help define the next step', text: 'Tell us what you want to improve: accounting, data exchange, reporting or user workflows. Start with the problem and we will help define the next step.', proofs: ['Review the current process and constraints', 'Define the expected result', 'Suggest a practical first stage'] },
    footer: { description: '1C implementation and development, integrations and support for practical business automation.', solutions: 'Solutions', implementation: '1C implementation', ai: 'AI for business', integrations: 'Integrations and EDI', company: 'Company', knowledge: 'Knowledge base', assistant: 'AI consultant', portal: 'Client portal', location: 'Riga, Latvia', stack: '1C · AI · Cloud · Integrations · Agent+' },
  },
};

export const assistantWidgetCopy: Record<Locale, {
  title: string;
  demo: string;
  initialMessage: string;
  fallbackAnswer: string;
  errorAnswer: string;
  loading: string;
  starters: string[];
  inputLabel: string;
  placeholder: string;
  submit: string;
}> = {
  ru: {
    title: 'Avantime AI-консультант', demo: 'Демонстрационная версия', initialMessage: 'Опишите процесс или проблему. Я предложу возможный первый этап автоматизации.', fallbackAnswer: 'Предлагаю начать с короткого обследования процесса.', errorAnswer: 'Не удалось получить ответ. Опишите задачу через форму контактов — мы разберем ее вручную.', loading: 'Анализирую задачу…', starters: ['Автоматизация обращений клиентов', 'Интеграция 1С и Jira', 'AI-помощник для сотрудников'], inputLabel: 'Сообщение AI-консультанту', placeholder: 'Например: хотим сократить ручной ввод заказов', submit: 'Отправить',
  },
  lv: {
    title: 'Avantime AI konsultants', demo: 'Demonstrācijas versija', initialMessage: 'Aprakstiet procesu vai problēmu. Piedāvāšu iespējamu pirmo automatizācijas posmu.', fallbackAnswer: 'Iesaku sākt ar īsu procesa izpēti.', errorAnswer: 'Neizdevās saņemt atbildi. Aprakstiet uzdevumu kontaktu formā — mēs to izskatīsim manuāli.', loading: 'Analizēju uzdevumu…', starters: ['Klientu pieprasījumu automatizācija', '1C un Jira integrācija', 'AI palīgs darbiniekiem'], inputLabel: 'Ziņojums AI konsultantam', placeholder: 'Piemēram: vēlamies samazināt pasūtījumu manuālu ievadi', submit: 'Nosūtīt',
  },
  en: {
    title: 'Avantime AI consultant', demo: 'Demonstration version', initialMessage: 'Describe your process or problem. I will suggest a possible first automation stage.', fallbackAnswer: 'I suggest starting with a short process assessment.', errorAnswer: 'We could not get an answer. Describe the task in the contact form and we will review it manually.', loading: 'Analysing the task…', starters: ['Automate customer requests', 'Integrate 1C and Jira', 'AI assistant for employees'], inputLabel: 'Message to the AI consultant', placeholder: 'For example: we want to reduce manual order entry', submit: 'Send',
  },
};

export type PortalCopy = {
  auth: {
    eyebrow: string;
    loginTitle: string;
    loginSubtitle: string;
    emailLabel: string;
    requestAccessLink: string;
    passwordLabel: string;
    mfaCodeLabel: string;
    mfaPolicyNotice: string;
    mfaSetupAction: string;
    mfaSetupTitle: string;
    mfaSetupDescription: string;
    mfaSetupStart: string;
    mfaSetupCodeLabel: string;
    mfaSetupConfirm: string;
    mfaSetupQrLabel: string;
    mfaSetupRecoveryNotice: string;
    mfaSetupContinue: string;
    mfaSetupExpired: string;
    forgotPasswordLink: string;
    submit: string;
    submitPending: string;
    submitConfirm: string;
    restartLogin: string;
    demoClientButton: string;
    demoAdminButton: string;
    demoNoticeClient: string;
    demoNoticeAdmin: string;
    genericError: string;
    invalidCredentials: string;
    requestRejected: string;
    rateLimitError: string;
    serviceUnavailable: string;
    mfaInvalidCode: string;
    mfaChallengeExpired: string;
    mfaRateLimited: string;
    oidcError: string;
    securityEyebrow: string;
    forgotTitle: string;
    forgotSubtitle: string;
    forgotSubmit: string;
    resetTitle: string;
    resetCodeLabel: string;
    resetPasswordLabel: string;
    resetPasswordHint: string;
    resetSubmit: string;
  };
  shell: {
    tagline: string;
    languageLabel: string;
    homeBreadcrumb: string;
    skipToContent: string;
    dataNotice: string;
    notifications: string;
    settingsAriaPrefix: string;
    menuOpen: string;
    menuClose: string;
    mobileNavAria: string;
    navigationAria: string;
    breadcrumbsAria: string;
  };
  nav: {
    home: string;
    requests: string;
    documents: string;
    knowledge: string;
    company: string;
    team: string;
    notifications: string;
    settings: string;
    platform: string;
    accessRequests: string;
    documentsAdmin: string;
    requestTitle: string;
    documentTitle: string;
  };
  requestAccess: {
    eyebrow: string;
    title: string;
    subtitle: string;
    verifyTitle: string;
    nameLabel: string;
    emailLabel: string;
    companyLabel: string;
    commentLabel: string;
    commentPlaceholder: string;
    submit: string;
    submitPending: string;
    successMessage: string;
    deliveryDisabledMessage: string;
    deliveryFailedMessage: string;
    emailVerificationNotice: string;
    emailDeliveryDisabledNotice: string;
    genericError: string;
    backToLogin: string;
    verifyPending: string;
    verifySuccess: string;
    verifyError: string;
  };
  accessRequests: {
    eyebrow: string;
    title: string;
    description: string;
    overview: string;
    roles: string;
    audit: string;
    support: string;
    approvals: string;
    operations: string;
    accessRequests: string;
    navigationAria: string;
    empty: string;
    reviewTitle: string;
    pendingVerificationTitle: string;
    requestedAt: string;
    name: string;
    email: string;
    requestedCompany: string;
    comment: string;
    noComment: string;
    status: string;
    assignedCompany: string;
    companyFor: string;
    companyPlaceholder: string;
    roleFor: string;
    roleLabels: Record<'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER', string>;
    emailVerificationLabel: string;
    emailVerificationConfirmed: string;
    emailVerificationPending: string;
    adminDecisionLabel: string;
    adminDecisionPending: string;
    adminDecisionApproved: string;
    adminDecisionRejected: string;
    emailVerificationBlocked: string;
    emailDeliveryDisabled: string;
    resendVerification: string;
    verificationResentAccepted: string;
    verificationResentDisabled: string;
    verificationResentFailed: string;
    resendRateLimited: string;
    selectCompanyReason: string;
    companiesUnavailable: string;
    rejectionReasonLabel: string;
    rejectionReasonRequired: string;
    approveDialogTitle: string;
    approveDialogDescription: string;
    rejectDialogTitle: string;
    rejectDialogDescription: string;
    cancel: string;
    confirmApprove: string;
    confirmReject: string;
    approve: string;
    reject: string;
    historyTitle: string;
    statusLabels: Record<'PENDING' | 'EMAIL_VERIFIED' | 'APPROVED' | 'REJECTED', string>;
    operationFailed: string;
    approvalCreatedInvitation: string;
    invitationEmailAccepted: string;
    invitationEmailNotAccepted: string;
    invitationEmailDeliveryUnconfirmed: string;
    invitationEmailDisabledNextStep: string;
    invitationEmailFailureNextStep: string;
    requestForbidden: string;
    requestNoLongerEligible: string;
    requestMissing: string;
    operationUnavailable: string;
    approved: string;
    rejected: string;
  };
  accessInvitation: {
    eyebrow: string;
    title: string;
    description: string;
    signedInDescription: string;
    passwordLabel: string;
    confirmPasswordLabel: string;
    passwordHint: string;
    submit: string;
    submitPending: string;
    accept: string;
    acceptPending: string;
    passwordMismatch: string;
    passwordPolicy: string;
    accountExists: string;
    signIn: string;
    accepted: string;
    continueToPortal: string;
    continueToLogin: string;
    invalidLink: string;
    genericError: string;
  };
};

export const portalCopy: Record<Locale, PortalCopy> = {
  lv: {
    auth: {
      eyebrow: 'Klienta kabinets',
      loginTitle: 'Pieslēgšanās',
      loginSubtitle: 'Pieprasījumi, dokumenti, statusi un zināšanu bāze vienuviet.',
      emailLabel: 'E-pasts',
      requestAccessLink: 'Pieprasīt piekļuvi',
      passwordLabel: 'Parole',
      mfaCodeLabel: 'MFA kods vai atkopšanas kods',
      mfaPolicyNotice: 'Lai turpinātu, iestatiet autentifikatora lietotni.',
      mfaSetupAction: 'Iestatīt autentifikatora lietotni',
      mfaSetupTitle: 'MFA iestatīšana',
      mfaSetupDescription: 'Noskenējiet QR kodu ar autentifikatora lietotni un ievadiet tajā redzamo sešciparu kodu.',
      mfaSetupStart: 'Parādīt QR kodu',
      mfaSetupCodeLabel: 'Apstiprinājuma kods',
      mfaSetupConfirm: 'Apstiprināt MFA',
      mfaSetupQrLabel: 'MFA autentifikatora QR kods',
      mfaSetupRecoveryNotice: 'Saglabājiet rezerves kodus drošā vietā. Tie tiek parādīti tikai vienu reizi.',
      mfaSetupContinue: 'Turpināt uz pieslēgšanos',
      mfaSetupExpired: 'Iestatīšanas sesija ir beigusies. Sāciet pieslēgšanos no jauna.',
      forgotPasswordLink: 'Aizmirsāt paroli?',
      submit: 'Ienākt',
      submitPending: 'Pārbaudām…',
      submitConfirm: 'Apstiprināt',
      restartLogin: 'Sākt pieslēgšanos no jauna',
      demoClientButton: 'Klients',
      demoAdminButton: 'Administrators',
      demoNoticeClient: 'Klients:',
      demoNoticeAdmin: 'Administrators:',
      genericError: 'Neizdevās pieslēgties.',
      invalidCredentials: 'Nepareizs e-pasts vai parole.',
      requestRejected: 'Pieslēgšanās pieprasījums tika noraidīts.',
      rateLimitError: 'Pārāk daudz mēģinājumu. Mēģiniet vēlāk.',
      serviceUnavailable: 'Pieslēgšanās īslaicīgi nav pieejama.',
      mfaInvalidCode: 'Nederīgs apstiprinājuma kods.',
      mfaChallengeExpired: 'Apstiprināšanas sesijas termiņš ir beidzies. Sāciet pieslēgšanos no jauna.',
      mfaRateLimited: 'Pārāk daudz mēģinājumu. Sāciet pieslēgšanos no jauna.',
      oidcError: 'Korporatīvā pieslēgšanās neizdevās. Sāciet pieslēgšanos no jauna.',
      securityEyebrow: 'Drošība',
      forgotTitle: 'Paroles atjaunošana',
      forgotSubtitle: 'Saite ir derīga 30 minūtes.',
      forgotSubmit: 'Saņemt instrukciju',
      resetTitle: 'Jauna parole',
      resetCodeLabel: 'Atjaunošanas kods',
      resetPasswordLabel: 'Jaunā parole',
      resetPasswordHint: 'No 12 līdz 128 rakstzīmēm; neizmantojiet e-pastu vai izplatītu paroli.',
      resetSubmit: 'Mainīt paroli',
    },
    shell: {
      tagline: 'Klienta kabinets',
      languageLabel: 'Valoda',
      homeBreadcrumb: 'Kabinets',
      skipToContent: 'Pāriet uz saturu',
      dataNotice: 'Dati ir pieejami tikai jūsu uzņēmuma dalībniekiem.',
      notifications: 'Paziņojumi',
      settingsAriaPrefix: 'Lietotāja iestatījumi',
      menuOpen: 'Atvērt izvēlni',
      menuClose: 'Aizvērt izvēlni',
      mobileNavAria: 'Mobilā navigācija',
      navigationAria: 'Galvenā navigācija',
      breadcrumbsAria: 'Navigācijas ceļš',
    },
    nav: {
      home: 'Sākums',
      requests: 'Pieprasījumi',
      documents: 'Dokumenti',
      knowledge: 'Zināšanu bāze',
      company: 'Uzņēmums',
      team: 'Komanda',
      notifications: 'Paziņojumi',
      settings: 'Iestatījumi',
      platform: 'Platformas pārvaldība',
      accessRequests: 'Piekļuves pieprasījumi',
      documentsAdmin: 'Dokumentu pārvaldība',
      requestTitle: 'Pieprasījums',
      documentTitle: 'Dokuments',
    },
    requestAccess: {
      eyebrow: 'Klienta kabinets',
      title: 'Pieprasīt piekļuvi',
      subtitle: 'Iesniedziet pieprasījumu piekļuvei klienta kabinetam.',
      verifyTitle: 'E-pasta apstiprināšana',
      nameLabel: 'Vārds, uzvārds',
      emailLabel: 'E-pasts',
      companyLabel: 'Uzņēmums',
      commentLabel: 'Komentārs (nav obligāts)',
      commentPlaceholder: 'Pastāstiet, kādam nolūkam nepieciešama piekļuve',
      submit: 'Nosūtīt pieprasījumu',
      submitPending: 'Sūtām…',
      successMessage: 'Pieprasījums ir saglabāts. E-pasta pakalpojums pieņēma apstiprinājuma vēstuli, taču piegāde vēl nav apstiprināta. Pārbaudiet e-pastu.',
      deliveryDisabledMessage: 'Pieprasījums ir saglabāts, bet e-pasta sūtīšana ir izslēgta. Neveidojiet dublikātu; lūdziet platformas administratoram atkārtoti nosūtīt apstiprinājumu šim pieprasījumam.',
      deliveryFailedMessage: 'Pieprasījums ir saglabāts, bet e-pasta pakalpojums to nepieņēma. Neveidojiet dublikātu; lūdziet administratoram atkārtoti nosūtīt apstiprinājumu šim pieprasījumam.',
      emailVerificationNotice: 'E-pasta apstiprināšana ir obligāta un neaizstāj administratora lēmumu par piekļuvi.',
      emailDeliveryDisabledNotice: 'E-pasta sūtīšana šajā vidē ir izslēgta. Pieprasījumu nevar izskatīt, kamēr adrese nav apstiprināta. Ja iesniegsiet pieprasījumu, administrators var atkārtoti nosūtīt apstiprinājumu esošajam ierakstam.',
      genericError: 'Pieprasījumu neizdevās nosūtīt. Mēģiniet vēlreiz.',
      backToLogin: 'Atpakaļ uz pieslēgšanos',
      verifyPending: 'Apstiprinām e-pasta adresi…',
      verifySuccess: 'E-pasta adrese apstiprināta. Piekļuves pieprasījums gaida administratora apstiprinājumu.',
      verifyError: 'Neizdevās apstiprināt e-pasta adresi. Pieprasiet jaunu apstiprinājuma saiti.',
    },
    accessRequests: {
      eyebrow: 'Platformas pārvaldība',
      title: 'Piekļuves pieprasījumi',
      description: 'Pārskatiet piekļuves pieprasījumus un piešķiriet apstiprinātajiem lietotājiem uzņēmumu un lomu.',
      overview: 'Pārskats',
      roles: 'Platformas lomas',
      audit: 'Globālais audits',
      support: 'Atbalsta sesijas',
      approvals: 'Apstiprinājumi',
      operations: 'Operācijas',
      accessRequests: 'Piekļuves pieprasījumi',
      navigationAria: 'Platformas pārvaldība',
      empty: 'Nav pieprasījumu, kas gaida izskatīšanu.',
      reviewTitle: 'Gaida izskatīšanu',
      pendingVerificationTitle: 'Gaida e-pasta apstiprinājumu',
      requestedAt: 'Iesniegts',
      name: 'Vārds',
      email: 'E-pasts',
      requestedCompany: 'Pieprasītais uzņēmums:',
      comment: 'Komentārs',
      noComment: 'Komentāra nav',
      status: 'Statuss',
      assignedCompany: 'Piešķirtais uzņēmums',
      companyFor: 'Uzņēmums lietotājam',
      companyPlaceholder: 'Izvēlieties uzņēmumu',
      roleFor: 'Loma lietotājam',
      roleLabels: { ADMIN: 'Administrators', MANAGER: 'Vadītājs', MEMBER: 'Dalībnieks', VIEWER: 'Skatītājs' },
      emailVerificationLabel: 'Pieteikuma iesniedzēja e-pasts',
      emailVerificationConfirmed: 'Apstiprināts',
      emailVerificationPending: 'Nav apstiprināts',
      adminDecisionLabel: 'Administratora lēmums',
      adminDecisionPending: 'Vēl nav pieņemts',
      adminDecisionApproved: 'Apstiprināts',
      adminDecisionRejected: 'Noraidīts',
      emailVerificationBlocked: 'Pieprasījumu nevar izskatīt, kamēr iesniedzējs nav apstiprinājis e-pastu. Nākamais solis: atveriet apstiprināšanas saiti un pēc tam atsvaidziniet rindu.',
      emailDeliveryDisabled: 'E-pasta sūtīšana ir izslēgta; iesniedzējs nesaņems apstiprināšanas saiti. Lēmums ir bloķēts līdz e-pasta apstiprināšanai. Nākamais solis: atjaunojiet e-pasta sūtīšanu un lūdziet iesniedzējam iesniegt jaunu pieprasījumu.',
      resendVerification: 'Atkārtoti nosūtīt apstiprinājumu',
      verificationResentAccepted: 'E-pasta pakalpojums pieņēma apstiprinājuma vēstuli. Piegāde vēl nav apstiprināta; pieprasījums gaida saites atvēršanu.',
      verificationResentDisabled: 'E-pasta sūtīšana ir izslēgta. Pieprasījums paliek neapstiprināts; atjaunojiet sūtīšanu un atkārtojiet šo darbību.',
      verificationResentFailed: 'Apstiprinājuma vēstuli neizdevās nosūtīt. Pieprasījums paliek neapstiprināts; pārbaudiet pasta pakalpojumu un mēģiniet vēlreiz.',
      resendRateLimited: 'Pārāk daudz mēģinājumu. Pirms atkārtota mēģinājuma uzgaidiet.',
      selectCompanyReason: 'Lai apstiprinātu, vispirms izvēlieties uzņēmumu.',
      companiesUnavailable: 'Uzņēmumu saraksts nav pieejams. Nākamais solis: pārbaudiet uzņēmumu katalogu vai sazinieties ar platformas administratoru.',
      rejectionReasonLabel: 'Noraidīšanas pamatojums',
      rejectionReasonRequired: 'Lai turpinātu, ievadiet noraidīšanas pamatojumu.',
      approveDialogTitle: 'Apstiprināt piekļuves pieprasījumu?',
      approveDialogDescription: 'Tiks izveidots uzaicinājums izvēlētajam uzņēmumam un lomai.',
      rejectDialogTitle: 'Noraidīt piekļuves pieprasījumu?',
      rejectDialogDescription: 'Pirms noraidīšanas norādiet pamatojumu.',
      cancel: 'Atcelt',
      confirmApprove: 'Apstiprināt piekļuvi',
      confirmReject: 'Noraidīt pieprasījumu',
      approve: 'Apstiprināt piekļuvi',
      reject: 'Noraidīt',
      historyTitle: 'Izskatītie pieprasījumi',
      statusLabels: { PENDING: 'Gaida e-pasta apstiprinājumu', EMAIL_VERIFIED: 'Gaida izskatīšanu', APPROVED: 'Apstiprināts', REJECTED: 'Noraidīts' },
      operationFailed: 'Neizdevās atjaunināt pieprasījumu.',
      approvalCreatedInvitation: 'Pieprasījums apstiprināts, ielūgums izveidots.',
      invitationEmailAccepted: 'Pasta pakalpojums pieņēma ielūguma vēstuli.',
      invitationEmailNotAccepted: 'Pasta pakalpojums vēstuli nenosūtīja.',
      invitationEmailDeliveryUnconfirmed: 'Piegāde nav apstiprināta.',
      invitationEmailDisabledNextStep: 'E-pasta sūtīšana ir izslēgta. Nākamais solis: atjaunojiet e-pasta sūtīšanu un lūdziet platformas administratoram droši izveidot un nosūtīt jaunu uzaicinājumu.',
      invitationEmailFailureNextStep: 'Nākamais solis: pārbaudiet e-pasta pakalpojumu un atkārtojiet uzaicināšanu, pirms paziņojat par piekļuves aktivizēšanu.',
      requestForbidden: 'Jums nav tiesību mainīt šo pieprasījumu. Nākamais solis: sazinieties ar platformas administratoru.',
      requestNoLongerEligible: 'Pieprasījums jau apstrādāts vai e-pasts vēl nav apstiprināts. Atsvaidziniet rindu un pārbaudiet abus statusus.',
      requestMissing: 'Pieprasījums vairs nav pieejams. Atsvaidziniet rindu.',
      operationUnavailable: 'Pieprasījumu neizdevās saglabāt servera kļūmes dēļ. Nākamais solis: atsvaidziniet rindu un mēģiniet vēlreiz.',
      approved: 'Pieprasījums apstiprināts.',
      rejected: 'Pieprasījums noraidīts.',
    },
    accessInvitation: {
      eyebrow: 'Klienta kabinets',
      title: 'Aktivizēt kontu',
      description: 'Izveidojiet paroli, lai pieņemtu apstiprināto uzaicinājumu klienta kabinetā.',
      signedInDescription: 'Pieņemiet uzaicinājumu ar savu esošo kontu.',
      passwordLabel: 'Jaunā parole',
      confirmPasswordLabel: 'Atkārtojiet paroli',
      passwordHint: 'Vismaz 12 rakstzīmes; neizmantojiet savu e-pastu vai plaši lietotu paroli.',
      submit: 'Izveidot kontu un pieņemt uzaicinājumu',
      submitPending: 'Veidojam kontu…',
      accept: 'Pieņemt uzaicinājumu',
      acceptPending: 'Pieņemam…',
      passwordMismatch: 'Paroles nesakrīt.',
      passwordPolicy: 'Parolei jāatbilst drošības prasībām.',
      accountExists: 'Šai e-pasta adresei jau ir konts. Pieslēdzieties, pēc tam atveriet uzaicinājuma saiti vēlreiz.',
      signIn: 'Pieslēgties',
      accepted: 'Uzaicinājums pieņemts. Konts ir aktivizēts.',
      continueToPortal: 'Atvērt klienta kabinetu',
      continueToLogin: 'Doties uz pieslēgšanos',
      invalidLink: 'Uzaicinājuma saite nav derīga vai ir beigusies.',
      genericError: 'Neizdevās pieņemt uzaicinājumu. Atveriet saiti vēlreiz vai sazinieties ar administratoru.',
    },
  },
  ru: {
    auth: {
      eyebrow: 'Кабинет клиента',
      loginTitle: 'Вход',
      loginSubtitle: 'Обращения, документы, статусы и база знаний в одном месте.',
      emailLabel: 'Электронная почта',
      requestAccessLink: 'Запросить доступ',
      passwordLabel: 'Пароль',
      mfaCodeLabel: 'Код MFA или резервный код',
      mfaPolicyNotice: 'Для продолжения настройте приложение-аутентификатор.',
      mfaSetupAction: 'Настроить приложение-аутентификатор',
      mfaSetupTitle: 'Настройка MFA',
      mfaSetupDescription: 'Отсканируйте QR-код приложением-аутентификатором и введите показанный им шестизначный код.',
      mfaSetupStart: 'Показать QR-код',
      mfaSetupCodeLabel: 'Код подтверждения',
      mfaSetupConfirm: 'Подтвердить MFA',
      mfaSetupQrLabel: 'QR-код приложения-аутентификатора',
      mfaSetupRecoveryNotice: 'Сохраните резервные коды в надёжном месте. Они показываются только один раз.',
      mfaSetupContinue: 'Перейти ко входу',
      mfaSetupExpired: 'Сеанс настройки истёк. Начните вход заново.',
      forgotPasswordLink: 'Забыли пароль?',
      submit: 'Войти',
      submitPending: 'Проверяем…',
      submitConfirm: 'Подтвердить',
      restartLogin: 'Начать вход заново',
      demoClientButton: 'Клиент',
      demoAdminButton: 'Администратор',
      demoNoticeClient: 'Клиент:',
      demoNoticeAdmin: 'Администратор:',
      genericError: 'Не удалось войти.',
      invalidCredentials: 'Неверный адрес электронной почты или пароль.',
      requestRejected: 'Запрос на вход отклонён.',
      rateLimitError: 'Слишком много попыток. Повторите позже.',
      serviceUnavailable: 'Вход временно недоступен.',
      mfaInvalidCode: 'Неверный код подтверждения.',
      mfaChallengeExpired: 'Сеанс подтверждения истёк. Начните вход заново.',
      mfaRateLimited: 'Слишком много попыток. Начните вход заново.',
      oidcError: 'Корпоративный вход не выполнен. Начните вход заново.',
      securityEyebrow: 'Безопасность',
      forgotTitle: 'Восстановление пароля',
      forgotSubtitle: 'Ссылка действует 30 минут.',
      forgotSubmit: 'Получить инструкцию',
      resetTitle: 'Новый пароль',
      resetCodeLabel: 'Код восстановления',
      resetPasswordLabel: 'Новый пароль',
      resetPasswordHint: 'От 12 до 128 символов; не используйте email или распространённый пароль.',
      resetSubmit: 'Изменить пароль',
    },
    shell: {
      tagline: 'Кабинет клиента',
      languageLabel: 'Язык',
      homeBreadcrumb: 'Кабинет',
      skipToContent: 'Перейти к содержимому',
      dataNotice: 'Данные доступны только участникам вашей компании.',
      notifications: 'Уведомления',
      settingsAriaPrefix: 'Настройки пользователя',
      menuOpen: 'Открыть меню',
      menuClose: 'Закрыть меню',
      mobileNavAria: 'Мобильная навигация',
      navigationAria: 'Основная навигация',
      breadcrumbsAria: 'Хлебные крошки',
    },
    nav: {
      home: 'Главная',
      requests: 'Обращения',
      documents: 'Документы',
      knowledge: 'База знаний',
      company: 'Компания',
      team: 'Команда',
      notifications: 'Уведомления',
      settings: 'Настройки',
      platform: 'Управление платформой',
      accessRequests: 'Заявки на доступ',
      documentsAdmin: 'Управление документами',
      requestTitle: 'Обращение',
      documentTitle: 'Документ',
    },
    requestAccess: {
      eyebrow: 'Кабинет клиента',
      title: 'Запросить доступ',
      subtitle: 'Отправьте запрос на доступ к клиентскому кабинету.',
      verifyTitle: 'Подтверждение email',
      nameLabel: 'Имя и фамилия',
      emailLabel: 'Электронная почта',
      companyLabel: 'Компания',
      commentLabel: 'Комментарий (необязательно)',
      commentPlaceholder: 'Расскажите, для чего вам нужен доступ',
      submit: 'Отправить запрос',
      submitPending: 'Отправляем…',
      successMessage: 'Запрос сохранён. Почтовый сервис принял письмо с подтверждением, но доставка ещё не подтверждена. Проверьте почту.',
      deliveryDisabledMessage: 'Запрос сохранён, но отправка email отключена. Не создавайте дубликат; попросите администратора повторно отправить подтверждение для этой заявки.',
      deliveryFailedMessage: 'Запрос сохранён, но почтовый сервис не принял письмо. Не создавайте дубликат; попросите администратора повторно отправить подтверждение для этой заявки.',
      emailVerificationNotice: 'Подтверждение email обязательно и не заменяет отдельное решение администратора о доступе.',
      emailDeliveryDisabledNotice: 'В этой среде отправка email отключена. Заявку нельзя рассмотреть, пока адрес не подтверждён. Если вы подадите заявку, администратор сможет повторно отправить подтверждение для уже сохранённой записи.',
      genericError: 'Не удалось отправить запрос. Попробуйте ещё раз.',
      backToLogin: 'Вернуться ко входу',
      verifyPending: 'Подтверждаем адрес электронной почты…',
      verifySuccess: 'Адрес электронной почты подтверждён. Запрос ожидает одобрения администратора.',
      verifyError: 'Не удалось подтвердить адрес электронной почты. Запросите новую ссылку для подтверждения.',
    },
    accessRequests: {
      eyebrow: 'Управление платформой',
      title: 'Заявки на доступ',
      description: 'Рассматривайте заявки на доступ и назначайте одобренным пользователям компанию и роль.',
      overview: 'Обзор',
      roles: 'Роли платформы',
      audit: 'Глобальный аудит',
      support: 'Сессии поддержки',
      approvals: 'Подтверждения',
      operations: 'Операции',
      accessRequests: 'Заявки на доступ',
      navigationAria: 'Управление платформой',
      empty: 'Нет запросов, ожидающих рассмотрения.',
      reviewTitle: 'Ожидают рассмотрения',
      pendingVerificationTitle: 'Ожидают подтверждения email',
      requestedAt: 'Дата заявки',
      name: 'Имя',
      email: 'Электронная почта',
      requestedCompany: 'Запрошенная компания:',
      comment: 'Комментарий',
      noComment: 'Комментарий не указан',
      status: 'Статус',
      assignedCompany: 'Назначенная компания',
      companyFor: 'Компания для пользователя',
      companyPlaceholder: 'Выберите компанию',
      roleFor: 'Роль для пользователя',
      roleLabels: { ADMIN: 'Администратор', MANAGER: 'Менеджер', MEMBER: 'Участник', VIEWER: 'Наблюдатель' },
      emailVerificationLabel: 'Подтверждение email заявителем',
      emailVerificationConfirmed: 'Подтверждён',
      emailVerificationPending: 'Не подтверждён',
      adminDecisionLabel: 'Решение администратора',
      adminDecisionPending: 'Ещё не принято',
      adminDecisionApproved: 'Одобрено',
      adminDecisionRejected: 'Отклонено',
      emailVerificationBlocked: 'Заявку нельзя рассматривать, пока заявитель не подтвердит email. Следующий шаг: заявитель открывает ссылку подтверждения, затем обновите очередь.',
      emailDeliveryDisabled: 'Отправка email отключена; заявитель не получит ссылку подтверждения. Решение заблокировано до подтверждения адреса. Восстановите отправку и повторно отправьте подтверждение для этой заявки; новую создавать не нужно.',
      resendVerification: 'Повторно отправить подтверждение',
      verificationResentAccepted: 'Почтовый сервис принял письмо с подтверждением. Доставка ещё не подтверждена; заявка ожидает открытия ссылки.',
      verificationResentDisabled: 'Отправка email отключена. Заявка остаётся неподтверждённой; восстановите отправку и повторите это действие.',
      verificationResentFailed: 'Не удалось отправить письмо с подтверждением. Заявка остаётся неподтверждённой; проверьте почтовый сервис и повторите попытку.',
      resendRateLimited: 'Слишком много попыток. Подождите перед повторной отправкой.',
      selectCompanyReason: 'Чтобы одобрить заявку, сначала выберите компанию.',
      companiesUnavailable: 'Список компаний недоступен. Следующий шаг: проверьте каталог компаний или обратитесь к администратору платформы.',
      rejectionReasonLabel: 'Причина отклонения',
      rejectionReasonRequired: 'Чтобы продолжить, укажите причину отклонения.',
      approveDialogTitle: 'Одобрить заявку на доступ?',
      approveDialogDescription: 'Для выбранных компании и роли будет создано приглашение.',
      rejectDialogTitle: 'Отклонить заявку на доступ?',
      rejectDialogDescription: 'Перед отклонением укажите причину.',
      cancel: 'Отмена',
      confirmApprove: 'Одобрить доступ',
      confirmReject: 'Отклонить заявку',
      approve: 'Одобрить доступ',
      reject: 'Отклонить',
      historyTitle: 'Рассмотренные запросы',
      statusLabels: { PENDING: 'Ожидает подтверждения email', EMAIL_VERIFIED: 'Ожидает рассмотрения', APPROVED: 'Одобрен', REJECTED: 'Отклонён' },
      operationFailed: 'Не удалось обновить запрос.',
      approvalCreatedInvitation: 'Заявка одобрена, приглашение создано.',
      invitationEmailAccepted: 'Почтовый сервис принял письмо-приглашение.',
      invitationEmailNotAccepted: 'Почтовый сервис не принял письмо к отправке.',
      invitationEmailDeliveryUnconfirmed: 'Доставка не подтверждена.',
      invitationEmailDisabledNextStep: 'Отправка email отключена. Следующий шаг: восстановите отправку email и обратитесь к администратору платформы, чтобы безопасно создать и отправить новое приглашение.',
      invitationEmailFailureNextStep: 'Следующий шаг: проверьте почтовый сервис и повторно отправьте приглашение до уведомления о доступе.',
      requestForbidden: 'У вас нет прав изменять эту заявку. Следующий шаг: обратитесь к администратору платформы.',
      requestNoLongerEligible: 'Заявка уже обработана или email ещё не подтверждён. Обновите очередь и проверьте оба статуса.',
      requestMissing: 'Заявка больше недоступна. Обновите очередь.',
      operationUnavailable: 'Не удалось сохранить решение из-за ошибки сервера. Следующий шаг: обновите очередь и повторите попытку.',
      approved: 'Запрос одобрен.',
      rejected: 'Запрос отклонён.',
    },
    accessInvitation: {
      eyebrow: 'Кабинет клиента',
      title: 'Активировать учётную запись',
      description: 'Создайте пароль, чтобы принять одобренное приглашение в клиентский кабинет.',
      signedInDescription: 'Примите приглашение под своей существующей учётной записью.',
      passwordLabel: 'Новый пароль',
      confirmPasswordLabel: 'Повторите пароль',
      passwordHint: 'Не менее 12 символов; не используйте email или распространённый пароль.',
      submit: 'Создать учётную запись и принять приглашение',
      submitPending: 'Создаём учётную запись…',
      accept: 'Принять приглашение',
      acceptPending: 'Принимаем…',
      passwordMismatch: 'Пароли не совпадают.',
      passwordPolicy: 'Пароль не соответствует требованиям безопасности.',
      accountExists: 'Для этого email уже есть учётная запись. Войдите, затем откройте ссылку приглашения ещё раз.',
      signIn: 'Войти',
      accepted: 'Приглашение принято. Учётная запись активирована.',
      continueToPortal: 'Открыть клиентский кабинет',
      continueToLogin: 'Перейти ко входу',
      invalidLink: 'Ссылка приглашения недействительна или истекла.',
      genericError: 'Не удалось принять приглашение. Откройте ссылку ещё раз или обратитесь к администратору.',
    },
  },
  en: {
    auth: {
      eyebrow: 'Client portal',
      loginTitle: 'Sign in',
      loginSubtitle: 'Requests, documents, statuses and the knowledge base in one place.',
      emailLabel: 'Email',
      requestAccessLink: 'Request access',
      passwordLabel: 'Password',
      mfaCodeLabel: 'MFA code or recovery code',
      mfaPolicyNotice: 'Set up an authenticator app to continue.',
      mfaSetupAction: 'Set up authenticator app',
      mfaSetupTitle: 'Set up MFA',
      mfaSetupDescription: 'Scan the QR code with an authenticator app and enter the six-digit code it displays.',
      mfaSetupStart: 'Show QR code',
      mfaSetupCodeLabel: 'Verification code',
      mfaSetupConfirm: 'Confirm MFA',
      mfaSetupQrLabel: 'Authenticator app QR code',
      mfaSetupRecoveryNotice: 'Store the backup codes securely. They are shown only once.',
      mfaSetupContinue: 'Continue to sign in',
      mfaSetupExpired: 'The setup session expired. Start sign-in again.',
      forgotPasswordLink: 'Forgot your password?',
      submit: 'Sign in',
      submitPending: 'Checking…',
      submitConfirm: 'Confirm',
      restartLogin: 'Start over',
      demoClientButton: 'Client',
      demoAdminButton: 'Administrator',
      demoNoticeClient: 'Client:',
      demoNoticeAdmin: 'Administrator:',
      genericError: 'Sign-in failed.',
      invalidCredentials: 'The email address or password is incorrect.',
      requestRejected: 'The sign-in request was rejected.',
      rateLimitError: 'Too many attempts. Please try again later.',
      serviceUnavailable: 'Sign-in is temporarily unavailable.',
      mfaInvalidCode: 'The verification code is invalid.',
      mfaChallengeExpired: 'The verification session expired. Start sign-in again.',
      mfaRateLimited: 'Too many attempts. Start sign-in again.',
      oidcError: 'Corporate sign-in was not completed. Please start over.',
      securityEyebrow: 'Security',
      forgotTitle: 'Password recovery',
      forgotSubtitle: 'The link is valid for 30 minutes.',
      forgotSubmit: 'Get instructions',
      resetTitle: 'New password',
      resetCodeLabel: 'Recovery code',
      resetPasswordLabel: 'New password',
      resetPasswordHint: '12 to 128 characters; do not use your email or a common password.',
      resetSubmit: 'Change password',
    },
    shell: {
      tagline: 'Client portal',
      languageLabel: 'Language',
      homeBreadcrumb: 'Portal',
      skipToContent: 'Skip to content',
      dataNotice: 'Data is only available to members of your company.',
      notifications: 'Notifications',
      settingsAriaPrefix: 'User settings',
      menuOpen: 'Open menu',
      menuClose: 'Close menu',
      mobileNavAria: 'Mobile navigation',
      navigationAria: 'Main navigation',
      breadcrumbsAria: 'Breadcrumbs',
    },
    nav: {
      home: 'Home',
      requests: 'Requests',
      documents: 'Documents',
      knowledge: 'Knowledge base',
      company: 'Company',
      team: 'Team',
      notifications: 'Notifications',
      settings: 'Settings',
      platform: 'Platform management',
      accessRequests: 'Access requests',
      documentsAdmin: 'Document management',
      requestTitle: 'Request',
      documentTitle: 'Document',
    },
    requestAccess: {
      eyebrow: 'Client portal',
      title: 'Request access',
      subtitle: 'Submit a request for access to the client portal.',
      verifyTitle: 'Verify your email address',
      nameLabel: 'Full name',
      emailLabel: 'Email',
      companyLabel: 'Company',
      commentLabel: 'Comment (optional)',
      commentPlaceholder: 'Tell us why you need access',
      submit: 'Send request',
      submitPending: 'Sending…',
      successMessage: 'The request was saved. The mail provider accepted the verification email, but delivery is not confirmed. Check your email.',
      deliveryDisabledMessage: 'The request was saved, but email sending is disabled. Do not create a duplicate; ask the platform administrator to resend verification for this saved request.',
      deliveryFailedMessage: 'The request was saved, but the mail provider did not accept the message. Do not create a duplicate; ask the administrator to resend verification for this saved request.',
      emailVerificationNotice: 'Email verification is required and is separate from the administrator access decision.',
      emailDeliveryDisabledNotice: 'Email sending is disabled in this environment. The request cannot be reviewed until the address is verified. If submitted, an administrator can resend verification for the saved request.',
      genericError: 'Could not send the request. Please try again.',
      backToLogin: 'Back to sign in',
      verifyPending: 'Verifying your email address…',
      verifySuccess: 'Email address verified. Your access request is awaiting administrator approval.',
      verifyError: 'Could not verify your email address. Request a new verification link.',
    },
    accessRequests: {
      eyebrow: 'Platform management',
      title: 'Access requests',
      description: 'Review access requests and assign approved users to a company and role.',
      overview: 'Overview',
      roles: 'Platform roles',
      audit: 'Global audit',
      support: 'Support sessions',
      approvals: 'Approvals',
      operations: 'Operations',
      accessRequests: 'Access requests',
      navigationAria: 'Platform management',
      empty: 'No requests are waiting for review.',
      reviewTitle: 'Awaiting review',
      pendingVerificationTitle: 'Awaiting email verification',
      requestedAt: 'Submitted',
      name: 'Name',
      email: 'Email',
      requestedCompany: 'Requested company:',
      comment: 'Comment',
      noComment: 'No comment provided',
      status: 'Status',
      assignedCompany: 'Assigned company',
      companyFor: 'Company for',
      companyPlaceholder: 'Select a company',
      roleFor: 'Role for',
      roleLabels: { ADMIN: 'Administrator', MANAGER: 'Manager', MEMBER: 'Member', VIEWER: 'Viewer' },
      emailVerificationLabel: 'Applicant email verification',
      emailVerificationConfirmed: 'Verified',
      emailVerificationPending: 'Not verified',
      adminDecisionLabel: 'Administrator decision',
      adminDecisionPending: 'Not decided',
      adminDecisionApproved: 'Approved',
      adminDecisionRejected: 'Rejected',
      emailVerificationBlocked: 'This request cannot be reviewed until the applicant verifies the email address. Next step: the applicant opens the verification link, then refresh the queue.',
      emailDeliveryDisabled: 'Email sending is disabled; the applicant cannot receive the verification link. The decision is blocked until verification. Restore delivery and resend verification for this request; do not create a duplicate.',
      resendVerification: 'Resend verification',
      verificationResentAccepted: 'The mail provider accepted the verification email. Delivery is not confirmed; the request remains pending until the link is opened.',
      verificationResentDisabled: 'Email sending is disabled. The request remains unverified; restore delivery and retry this action.',
      verificationResentFailed: 'The verification email could not be sent. The request remains unverified; check the mail provider and retry.',
      resendRateLimited: 'Too many attempts. Wait before resending.',
      selectCompanyReason: 'Select a company before approving this request.',
      companiesUnavailable: 'The company list is unavailable. Next step: check the company directory or contact the platform administrator.',
      rejectionReasonLabel: 'Reason for rejection',
      rejectionReasonRequired: 'Enter a reason before rejecting this request.',
      approveDialogTitle: 'Approve this access request?',
      approveDialogDescription: 'An invitation will be created for the selected company and role.',
      rejectDialogTitle: 'Reject this access request?',
      rejectDialogDescription: 'Enter a reason before rejecting the request.',
      cancel: 'Cancel',
      confirmApprove: 'Approve access',
      confirmReject: 'Reject request',
      approve: 'Approve access',
      reject: 'Reject',
      historyTitle: 'Reviewed requests',
      statusLabels: { PENDING: 'Pending email verification', EMAIL_VERIFIED: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected' },
      operationFailed: 'Could not update the request.',
      approvalCreatedInvitation: 'Request approved; invitation created.',
      invitationEmailAccepted: 'The mail provider accepted the invitation email.',
      invitationEmailNotAccepted: 'The mail provider did not accept the invitation email.',
      invitationEmailDeliveryUnconfirmed: 'Delivery is not confirmed.',
      invitationEmailDisabledNextStep: 'Email sending is disabled. Next step: restore email delivery and ask the platform administrator to create and send a replacement invitation securely.',
      invitationEmailFailureNextStep: 'Next step: check the mail provider and resend the invitation before telling the applicant access is ready.',
      requestForbidden: 'You do not have permission to change this request. Next step: contact the platform administrator.',
      requestNoLongerEligible: 'The request was already decided or its email is not verified. Refresh the queue and check both statuses.',
      requestMissing: 'This request is no longer available. Refresh the queue.',
      operationUnavailable: 'The decision could not be saved because the server is unavailable. Next step: refresh the queue and try again.',
      approved: 'Request approved.',
      rejected: 'Request rejected.',
    },
    accessInvitation: {
      eyebrow: 'Client portal',
      title: 'Activate your account',
      description: 'Create a password to accept your approved invitation to the client portal.',
      signedInDescription: 'Accept the invitation with your existing account.',
      passwordLabel: 'New password',
      confirmPasswordLabel: 'Confirm password',
      passwordHint: 'At least 12 characters; do not use your email or a common password.',
      submit: 'Create account and accept invitation',
      submitPending: 'Creating account…',
      accept: 'Accept invitation',
      acceptPending: 'Accepting…',
      passwordMismatch: 'Passwords do not match.',
      passwordPolicy: 'The password does not meet the security policy.',
      accountExists: 'An account already exists for this email. Sign in, then open the invitation link again.',
      signIn: 'Sign in',
      accepted: 'Invitation accepted. Your account is active.',
      continueToPortal: 'Open client portal',
      continueToLogin: 'Continue to sign in',
      invalidLink: 'This invitation link is invalid or has expired.',
      genericError: 'Could not accept the invitation. Reopen the link or contact an administrator.',
    },
  },
};
