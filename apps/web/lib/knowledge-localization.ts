import type { Locale } from './i18n';
import type { Article } from './content';
import type { KnowledgeArticle } from './knowledge-store';

type ArticleTranslation = Pick<Article, 'category' | 'title' | 'summary' | 'readingTime' | 'sections'>;

const translations: Record<'lv' | 'en', Record<string, ArticleTranslation>> = {
  en: {
    'ai-first-step': {
      category: 'AI and automation',
      title: 'How to start AI implementation without a large risky project',
      summary: 'A practical approach: one process, a measurable result and controlled data.',
      readingTime: '6 min read',
      sections: [
        { title: 'Start with the work, not the technology', paragraphs: ['The first question is not which model to use, but where employees regularly spend time on repetitive knowledge work.', 'A good first scenario has a clear input, a verifiable result and a quick way to return the task to a person.'] },
        { title: 'Limit data and responsibility', paragraphs: ['For a first version, choose one knowledge base or one document type. This makes quality easier to control and reduces the risk of incorrect answers.', 'AI should show its sources, while critical actions should require user confirmation.'] },
        { title: 'Measure practical impact', paragraphs: ['Compare completion time, manual operations, correction rates and user satisfaction.', 'Scale only a scenario that has proved its value on real data.'] },
      ],
    },
    'develop-or-replace-1c': {
      category: '1C',
      title: 'When improving the current 1C system is better than replacing it',
      summary: 'Signs that targeted modernisation can deliver a faster and safer result.',
      readingTime: '7 min read',
      sections: [
        { title: 'Identify the source of the problem first', paragraphs: ['The difficulty may come not from the platform, but from outdated processes, data quality or accumulated customisations.', 'Before replacing a system, separate technical debt from organisational problems.'] },
        { title: 'When improvement makes sense', paragraphs: ['The current system holds quality data, key processes work and the main problems are local and measurable.', 'Extensions, exchange optimisation and focused workplace improvements can then deliver value faster than migration.'] },
        { title: 'When a new architecture is needed', paragraphs: ['Replacement makes sense when there are systemic limits, no support, no upgrade path or critical data fragmentation.', 'Even then, the transition is best delivered in stages while keeping the business under control.'] },
      ],
    },
    'portal-jira-1c': {
      category: 'Integrations',
      title: 'Client portal, Jira and 1C: how to divide system responsibility',
      summary: 'An architecture without duplicate data, manual transfer or unnecessary exposure of internal processes.',
      readingTime: '8 min read',
      sections: [
        { title: 'Give each system its role', paragraphs: ['The portal handles convenient client interaction, Jira handles the team’s internal work, and 1C handles accounting data and documents.', 'Trying to store everything identically in every system creates conflicts and complex synchronisation.'] },
        { title: 'Transfer events, not copies of everything', paragraphs: ['An integration should transfer the required fields, statuses and document links while preserving ownership of each data type.', 'Reliable operation needs correlation identifiers, an exchange log and error retries.'] },
        { title: 'Show the client only what is needed', paragraphs: ['An external request status can be simpler than Jira’s internal workflow. The client needs to see received, in progress, clarification and resolved.', 'The internal team keeps flexibility while the client gets a clear and stable view.'] },
      ],
    },
  },
  lv: {
    'ai-first-step': {
      category: 'AI un automatizācija',
      title: 'Kā sākt AI ieviešanu bez liela un riskanta projekta',
      summary: 'Praktiska pieeja: viens process, izmērāms rezultāts un kontrolēti dati.',
      readingTime: '6 min lasīšana',
      sections: [
        { title: 'Sāciet ar darbu, nevis tehnoloģiju', paragraphs: ['Pirmais jautājums nav par modeļa izvēli, bet par to, kur darbinieki regulāri tērē laiku atkārtojamam intelektuālam darbam.', 'Labam pirmajam scenārijam ir skaidra ievade, pārbaudāms rezultāts un iespēja ātri nodot uzdevumu cilvēkam.'] },
        { title: 'Ierobežojiet datus un atbildību', paragraphs: ['Pirmajai versijai izvēlieties vienu zināšanu bāzi vai dokumentu veidu. Tas atvieglo kvalitātes kontroli un samazina nepareizu atbilžu risku.', 'AI jāparāda avoti, bet kritiskām darbībām jāprasa lietotāja apstiprinājums.'] },
        { title: 'Izmēriet praktisko ieguvumu', paragraphs: ['Salīdziniet izpildes laiku, manuālo darbību skaitu, labojumu īpatsvaru un lietotāju apmierinātību.', 'Paplašiniet tikai to scenāriju, kura vērtība ir pierādīta ar reāliem datiem.'] },
      ],
    },
    'develop-or-replace-1c': {
      category: '1C',
      title: 'Kad esošās 1C sistēmas attīstīšana ir labāka par tās nomaiņu',
      summary: 'Pazīmes, ka mērķēta modernizācija dos ātrāku un drošāku rezultātu.',
      readingTime: '7 min lasīšana',
      sections: [
        { title: 'Vispirms nosakiet problēmas avotu', paragraphs: ['Neērtības var būt saistītas nevis ar platformu, bet ar novecojušiem procesiem, datu kvalitāti vai uzkrātiem pielāgojumiem.', 'Pirms nomaiņas nošķiriet tehnisko parādu no organizatoriskām problēmām.'] },
        { title: 'Kad attīstīšana ir pamatota', paragraphs: ['Esošā sistēma glabā kvalitatīvus datus, galvenie procesi darbojas un problēmas ir lokālas un izmērāmas.', 'Šādā gadījumā paplašinājumi, apmaiņas optimizācija un atsevišķu darba vietu uzlabošana var dot rezultātu ātrāk par migrāciju.'] },
        { title: 'Kad vajadzīga jauna arhitektūra', paragraphs: ['Nomaiņa ir pamatota sistēmiskiem ierobežojumiem, atbalsta trūkumam, neiespējamai atjaunināšanai vai kritiskai datu sadrumstalotībai.', 'Arī tad pāreju labāk veikt pa posmiem, saglabājot kontrolētu uzņēmuma darbu.'] },
      ],
    },
    'portal-jira-1c': {
      category: 'Integrācijas',
      title: 'Klienta kabinets, Jira un 1C: kā sadalīt sistēmu atbildību',
      summary: 'Arhitektūra bez dublētiem datiem, manuālas pārsūtīšanas un liekas iekšējo procesu atklāšanas.',
      readingTime: '8 min lasīšana',
      sections: [
        { title: 'Katrai sistēmai ir sava loma', paragraphs: ['Kabinets nodrošina ērtu saziņu ar klientu, Jira — komandas iekšējo darbu, bet 1C — uzskaites datus un dokumentus.', 'Mēģinājums glabāt visu vienādi katrā sistēmā rada konfliktus un sarežģītu sinhronizāciju.'] },
        { title: 'Pārsūtiet notikumus, nevis visu kopijas', paragraphs: ['Integrācijai jānodod vajadzīgie lauki, statusi un dokumentu saites, saglabājot katra datu veida īpašnieku.', 'Uzticamībai vajadzīgi sasaistes identifikatori, apmaiņas žurnāls un kļūdu atkārtota apstrāde.'] },
        { title: 'Rādiet klientam tikai vajadzīgo', paragraphs: ['Ārējais pieprasījuma statuss var būt vienkāršāks par Jira iekšējo procesu. Klientam svarīgi ir saņemts, darbā, precizēšana un atrisināts.', 'Iekšējā komanda saglabā elastību, bet klients saņem skaidru un stabilu pārskatu.'] },
      ],
    },
  },
};

export function getLocalizedKnowledgeArticle(article: KnowledgeArticle, locale: Locale): KnowledgeArticle {
  const translation = locale === 'ru' ? undefined : translations[locale][article.slug];
  return translation
    ? { ...article, ...translation, tags: [translation.category, ...translation.title.split(' ').filter((word) => word.length > 5).slice(0, 3)] }
    : article;
}
