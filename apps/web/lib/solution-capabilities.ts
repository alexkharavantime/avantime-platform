import type { Locale } from './i18n';
import type { Solution } from './content';

type Capabilities = Solution['capabilities'];

const capabilities: Record<'lv' | 'en', Record<string, Capabilities>> = {
  en: {
    ai: [
      { title: 'AI consultants', text: 'Answer client and employee questions using a verified knowledge base.' },
      { title: 'Document processing', text: 'Extract data, compare versions, create summaries and prepare drafts.' },
      { title: 'AI agents', text: 'Run sequences of actions under business rules and human control.' },
      { title: '1C integration', text: 'Add AI to familiar workflows without creating a separate interface.' },
    ],
    'agent-plus': [
      { title: 'Mobile orders', text: 'The representative sees the customer, assortment, prices and history during the visit.' },
      { title: 'Routes and visits', text: 'Plan visits, record results and control field tasks.' },
      { title: 'Two-way exchange', text: 'Synchronise orders, payments, stock, directories and statuses with 1C.' },
      { title: 'Analytics', text: 'Track indicators by employee, customer, territory and execution quality.' },
    ],
    integrations: [
      { title: 'API integrations', text: 'Design reliable interfaces, queues, logging and error retries.' },
      { title: 'Jira and service desk', text: 'Transfer requests, statuses, attachments and feedback without manual copying.' },
      { title: 'Electronic documents', text: 'Automate receiving, checking, approval and accounting of documents.' },
      { title: 'Exchange monitoring', text: 'Create diagnostics, notifications and recovery tools.' },
    ],
    cloud: [
      { title: 'Design', text: 'Define requirements for capacity, availability, security and scaling.' },
      { title: 'Resilience', text: 'Configure backups, restore checks and outage response plans.' },
      { title: 'Monitoring', text: 'Monitor resources, services, exchanges and critical business indicators.' },
      { title: 'Secure access', text: 'Separate permissions, protect external interfaces and manage remote work.' },
    ],
    portals: [
      { title: 'Client portal', text: 'Requests, statuses, documents, interaction history and personal materials.' },
      { title: 'Knowledge base', text: 'Instructions, answers, search and future AI consultant integration.' },
      { title: 'Jira integration', text: 'Create and update tasks without exposing the internal system to clients.' },
      { title: 'Administration', text: 'Manage content, users, permissions and processing routes.' },
    ],
  },
  lv: {
    ai: [
      { title: 'AI konsultanti', text: 'Atbild uz klientu un darbinieku jautājumiem, izmantojot pārbaudītu zināšanu bāzi.' },
      { title: 'Dokumentu apstrāde', text: 'Iegūst datus, salīdzina versijas, veido kopsavilkumus un sagatavo uzmetumus.' },
      { title: 'AI aģenti', text: 'Izpilda darbību secības biznesa noteikumu un cilvēka kontrolē.' },
      { title: '1C integrācija', text: 'Pievieno AI ierastiem darba scenārijiem bez atsevišķas saskarnes.' },
    ],
    'agent-plus': [
      { title: 'Mobilie pasūtījumi', text: 'Pārstāvis vizītes laikā redz klientu, sortimentu, cenas un vēsturi.' },
      { title: 'Maršruti un vizītes', text: 'Plānojiet vizītes, fiksējiet rezultātu un kontrolējiet lauka uzdevumus.' },
      { title: 'Divvirzienu apmaiņa', text: 'Sinhronizējiet pasūtījumus, maksājumus, atlikumus, katalogus un statusus ar 1C.' },
      { title: 'Analītika', text: 'Sekojiet rādītājiem pēc darbinieka, klienta, teritorijas un izpildes kvalitātes.' },
    ],
    integrations: [
      { title: 'API integrācijas', text: 'Projektējiet uzticamas saskarnes, rindas, žurnalēšanu un kļūdu atkārtotu apstrādi.' },
      { title: 'Jira un servisa dienests', text: 'Pārsūtiet pieprasījumus, statusus, pielikumus un atbildes bez manuālas kopēšanas.' },
      { title: 'Elektroniskie dokumenti', text: 'Automatizējiet dokumentu saņemšanu, pārbaudi, saskaņošanu un iegrāmatošanu.' },
      { title: 'Apmaiņas uzraudzība', text: 'Veidojiet diagnostiku, paziņojumus un atjaunošanas rīkus.' },
    ],
    cloud: [
      { title: 'Projektēšana', text: 'Nosakiet jaudas, pieejamības, drošības un mērogošanas prasības.' },
      { title: 'Noturība', text: 'Konfigurējiet rezerves kopijas, atjaunošanas pārbaudes un rīcības plānus.' },
      { title: 'Uzraudzība', text: 'Kontrolējiet resursus, servisus, apmaiņas un kritiskos biznesa rādītājus.' },
      { title: 'Droša piekļuve', text: 'Nošķiriet tiesības, aizsargājiet ārējās saskarnes un pārvaldiet attālināto darbu.' },
    ],
    portals: [
      { title: 'Klienta kabinets', text: 'Pieprasījumi, statusi, dokumenti, saziņas vēsture un personalizēti materiāli.' },
      { title: 'Zināšanu bāze', text: 'Instrukcijas, atbildes, meklēšana un turpmāka AI konsultanta integrācija.' },
      { title: 'Jira integrācija', text: 'Veidojiet un atjauniniet uzdevumus, neatklājot klientam iekšējo sistēmu.' },
      { title: 'Administrēšana', text: 'Pārvaldiet saturu, lietotājus, tiesības un apstrādes maršrutus.' },
    ],
  },
};

export function getLocalizedCapabilities(slug: string, locale: Locale, fallback: Capabilities) {
  return locale === 'ru' ? fallback : capabilities[locale][slug] ?? fallback;
}
