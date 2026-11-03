# Strapi CMS pilot: Accounting page

The public page `/{lv|ru|en}/solutions/buhgalteriya-predpriyatiya` can take its content from a
separate Strapi 5.60.0 service (repository `D:\avantime-site`). Design, URL and the page component
are unchanged; only the data source differs. Every other page, the portal, authorization, access
requests and the AI knowledge base are not connected to the CMS.

## Configuration

| Variable | Meaning |
|---|---|
| `CMS_PILOT_MODE` | `off` (default) — repository content (`content/*.json`), `/api/cms/*` return 404; `on` — CMS |
| `CMS_URL` | CMS origin for server-side reads (e.g. `http://cms:1337` inside a network) |
| `CMS_MEDIA_URL` | public media origin; also read by `next.config.ts` for the `next/image` allow-list (`/uploads/**`) |
| `CMS_API_TOKEN` | Strapi **read-only** API token (server-side only) |
| `CMS_PREVIEW_SECRET` | HMAC key of preview links, shared with the CMS (`SITE_PREVIEW_SECRET`) |
| `CMS_REVALIDATE_SECRET` | bearer secret of the publish webhook, shared with the CMS (`SITE_REVALIDATE_SECRET`) |
| `CMS_TIMEOUT_MS` | CMS request timeout, default 3000 |
| `CMS_CACHE_SECONDS` | safety-net revalidation interval of published content, default 300 |
| `CMS_SNAPSHOT_DIR` | last known state per page/locale for outages; must be persistent in production |

With `on`, a missing or placeholder value stops the page with a configuration error (same
fail-fast policy as other `*-configuration.ts` loaders).

## Content states

| State | Behaviour |
|---|---|
| CMS disabled (`off`) | repository content, no CMS calls |
| Published in this locale | CMS content from the tagged data cache (`cms:product-page:accounting:<locale>`) |
| Unpublished in this locale (draft remains) | 404, `noindex` |
| No entry for this locale | 404, `noindex`, log event `cms.product_page.missing` |
| CMS unavailable, snapshot "published" | last published version (stale), log `cms.product_page.unavailable` |
| CMS unavailable, snapshot "withdrawn" | 404 — withdrawn content is never shown again |
| CMS unavailable, no snapshot | 5xx with the localized "temporarily unavailable" page |

Repository content is never used as an automatic fallback while the pilot is `on`: during an
outage the site cannot know whether the page was withdrawn. To serve repository content, switch
`CMS_PILOT_MODE=off` deliberately.

Every successful CMS read writes the snapshot. The revalidation endpoint also refreshes it
immediately (and records "withdrawn" after unpublish/delete if the CMS cannot be read), so a later
outage cannot resurrect an unpublished page.

## Preview and publishing

- `GET /api/cms/preview?type&key&locale&status&exp&sig` — HMAC-SHA256 link issued by the CMS
  (15 minutes, at most 1 hour accepted). Valid link: Draft Mode on/off and a 307 to the fixed
  page path from `lib/cms-product-page-routes.ts`; query parameters can never choose the target.
  Invalid link: 401. Drafts are read live (`status=draft`, `no-store`), never cached or written
  to snapshots, rendered with a banner and `noindex`.
- `GET /api/cms/preview/exit?key&locale` — disables Draft Mode, redirects to the page or `/`.
- `POST /api/cms/revalidate` — `Authorization: Bearer CMS_REVALIDATE_SECRET`, body
  `{model:"product-page", key, locales[], action: publish|unpublish|delete}`, at most 8 KB.
  Only allow-listed keys and `lv/ru/en` are accepted; only their tags are invalidated.

`middleware.ts` does not need changes: `/api/cms/*` is not a protected prefix, so it passes
without a portal session and is protected by the signature/secret above.

## Switching back to repository content

Set `CMS_PILOT_MODE=off` and **restart** the web process (the value is read from the process
environment; a running process does not pick up changes). No rebuild is needed. Measured locally:
standalone server ready in ≈3 s, the page then served from `content/*.json` with identical visible
text and markup.

## Editor guide (Strapi admin)

1. Open the CMS admin, *Content Manager → Product page → Бухгалтерия предприятия*.
2. Choose the language in the locale switch (top right): Latvian, Russian or English.
3. Edit text fields. `name` is the page title; `lead` is the introduction; `benefits` are the cards
   (their titles also form the "result" list); `approachTitle/approachText`, `ctaText/ctaButton`
   are the lower blocks; `seo` sets the search title and description.
4. Image: *Add asset → Upload from device* (or *Browse library*), then update `imageAlt`
   for this language. Wait until the upload has finished.
5. *Save* stores a draft. Visitors still see the published version.
6. *Open preview* shows the draft in the site design with a yellow banner.
7. *Publish* publishes **only the current language**. Other languages keep their published version
   and their own drafts. The site updates within a few seconds.
8. *⋯ → Unpublish* removes this language from the site (404). *⋯ → Discard changes* drops the draft.
