# Public Site Structure

## Audience and actions

| Page | Audience | Visitor question | Content | Primary action |
|---|---|---|---|---|
| `/lv`, `/ru`, `/en` | Business owners and managers | What can Avantime improve? | Short value proposition, directions, approach, benefits and contact CTA | Discuss a task |
| `/solutions` | Visitors comparing directions | Which solution fits my situation? | Compact cards with summary, tags and outcomes | Open a solution |
| `/solutions/1c` | Companies using or considering 1C | How can 1C fit our process? | Implementation, development, migration and support | Discuss 1C |
| `/solutions/ut-1-3` | Trading companies | Can sales, purchasing and warehouse work together? | Trade Management 1.3 capabilities, integration, implementation and localized illustration | Request a demo |
| `/solutions/agent-plus` | Field sales teams | How can mobile sales connect to 1C? | Routes, visits, orders, stock, offline work and rollout | Discuss implementation |
| `/solutions/ai` | Managers exploring AI | Where is AI useful in our processes? | Assistants, documents, agents and 1C integration | Discuss a use case |
| `/solutions/integrations` | Teams with fragmented systems | How can systems exchange data reliably? | API, Jira, EDI, monitoring and recovery | Discuss integration |
| `/solutions/cloud` | Companies operating business systems | How should services be hosted and protected? | Hosting, backup, monitoring and access | Discuss infrastructure |
| `/solutions/portals` | Companies needing client self-service | How can clients access requests and knowledge? | Client portal, knowledge base, Jira and administration | Discuss a portal |
| `/knowledge` and `/knowledge/[slug]` | Managers and specialists | How should we approach automation? | Searchable articles and practical guidance | Read or contact Avantime |
| `/contacts` | Prospects with a concrete task | How do I start a conversation? | Contact context and demo form | Send request |
| `/assistant` | Visitors with an early-stage question | What could be a practical first step? | Demo AI consultant | Start a conversation |

## Navigation rules

- Public pages use `/lv`, `/ru`, and `/en`; Latvian is the default.
- Locale is preserved in internal links and language switching.
- The shared header contains language selection and a context-aware back button.
- `/portal`, `/admin`, and `/dashboard` keep their existing protected behavior.
- Existing unprefixed public URLs redirect to the Latvian equivalent.
- Long pages should use short sections, a local section navigation bar, and links to related solutions instead of repeating complete product descriptions.
