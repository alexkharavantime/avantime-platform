# Public Translation Register

Statuses: `translated` means a localized resource exists; `checked` means direct URL/HTML was checked; `partial` means some nested content still uses source-language data.

| Page/block | Source | RU | LV | EN | Image | Check | Status/questions |
|---|---|---|---|---|---|---|---|
| Shared header, footer and form | `i18n.ts`, shared components | translated | translated | translated | none | lint and route checks | checked |
| Home | `app/page.tsx` | source | partial | partial | CSS visual | route checked | content translation remains |
| Solutions catalogue | `app/solutions/page.tsx` | translated | translated | translated | none | LV/RU/EN 200 | checked |
| 1C detail cards | `lib/solution-localization.ts` | source | partial | partial | none | markers checked | capabilities need completion for every direction |
| Trade Management 1.3 | `app/solutions/ut-1-3/page.tsx` | translated | translated | translated | localized WebP | image/text/URL checked | checked |
| Agent+ | `app/solutions/agent-plus/page.tsx` | source | partial | partial | pending | route checked | full page translation remains |
| AI, integrations, cloud, portals | `lib/content.ts`, dynamic detail page | source | partial | partial | pending | route checked | nested capability copy remains |
| Knowledge catalogue | `app/knowledge/page.tsx` | translated | translated | translated | none | route checked | checked |
| Knowledge articles | `lib/content.ts`, knowledge pages | source | partial | partial | none | route checked | article bodies need translation resources |
| Contacts | `app/contacts/page.tsx` | translated | translated | translated | none | lint and route checks | checked |
| AI consultant | `app/assistant/page.tsx` | translated | translated | translated | none | lint and route checks | checked |

## Term glossary

| RU | LV | EN |
|---|---|---|
| Решения | Risinājumi | Solutions |
| Внедрение | Ieviešana | Implementation |
| Сопровождение | Atbalsts | Support |
| Обмен данными | Datu apmaiņa | Data exchange |
| Управление торговлей | Tirdzniecības vadība | Trade Management |
| База знаний | Zināšanu bāze | Knowledge base |
| Клиентский кабинет | Klienta kabinets | Client portal |
| Взаиморасчёты | Norēķini | Balances |
| Склад | Noliktava | Inventory / Warehouse |

Open questions: confirm final legal/company copy and provide real 1C screenshots before replacing conceptual illustrations.
