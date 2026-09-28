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

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split('/')[1];
  return isLocale(segment) ? segment : defaultLocale;
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
    passwordLabel: string;
    mfaCodeLabel: string;
    mfaPolicyNotice: string;
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
    documentsAdmin: string;
    requestTitle: string;
    documentTitle: string;
  };
};

export const portalCopy: Record<Locale, PortalCopy> = {
  lv: {
    auth: {
      eyebrow: 'Klienta kabinets',
      loginTitle: 'Pieslēgšanās',
      loginSubtitle: 'Pieprasījumi, dokumenti, statusi un zināšanu bāze vienuviet.',
      emailLabel: 'E-pasts',
      passwordLabel: 'Parole',
      mfaCodeLabel: 'MFA kods vai atkopšanas kods',
      mfaPolicyNotice: 'Organizācijas politika pieprasa MFA. Sazinieties ar administratoru par drošu sākotnējo pieslēgšanu.',
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
      documentsAdmin: 'Dokumentu pārvaldība',
      requestTitle: 'Pieprasījums',
      documentTitle: 'Dokuments',
    },
  },
  ru: {
    auth: {
      eyebrow: 'Кабинет клиента',
      loginTitle: 'Вход',
      loginSubtitle: 'Обращения, документы, статусы и база знаний в одном месте.',
      emailLabel: 'Email',
      passwordLabel: 'Пароль',
      mfaCodeLabel: 'Код MFA или recovery code',
      mfaPolicyNotice: 'Политика организации требует MFA. Обратитесь к администратору для безопасного первоначального подключения.',
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
      documentsAdmin: 'Управление документами',
      requestTitle: 'Обращение',
      documentTitle: 'Документ',
    },
  },
  en: {
    auth: {
      eyebrow: 'Client portal',
      loginTitle: 'Sign in',
      loginSubtitle: 'Requests, documents, statuses and the knowledge base in one place.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      mfaCodeLabel: 'MFA code or recovery code',
      mfaPolicyNotice: 'Your organization requires MFA. Contact an administrator for secure initial enrollment.',
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
      documentsAdmin: 'Document management',
      requestTitle: 'Request',
      documentTitle: 'Document',
    },
  },
};
