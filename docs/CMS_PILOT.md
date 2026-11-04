# Strapi CMS pilot: Accounting page

The public page `/{lv|ru|en}/solutions/buhgalteriya-predpriyatiya` can take its content from a
separate Strapi 5.60.0 service (repository `D:\avantime-site`). Design, URL and the page component
are unchanged; only the data source differs. Every other page, the portal, authorization, access
requests and the AI knowledge base are not connected to the CMS.

## Configuration

| Variable                | Meaning                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CMS_PILOT_MODE`        | `off` (default) — repository content (`content/*.json`), `/api/cms/*` return 404; `on` — CMS                        |
| `CMS_URL`               | CMS origin for server-side reads (e.g. `http://cms:1337` inside a network)                                          |
| `CMS_MEDIA_URL`         | public media origin; also read by `next.config.ts` for the `next/image` allow-list (`/uploads/**`)                  |
| `CMS_API_TOKEN`         | Strapi **read-only** API token (server-side only)                                                                   |
| `CMS_PREVIEW_SECRET`    | HMAC key of preview links, shared with the CMS (`SITE_PREVIEW_SECRET`)                                              |
| `CMS_REVALIDATE_SECRET` | bearer secret of the publish webhook, shared with the CMS (`SITE_REVALIDATE_SECRET`)                                |
| `CMS_TIMEOUT_MS`        | CMS request timeout, default 3000                                                                                   |
| `CMS_CACHE_SECONDS`     | reconciliation interval of published content without a webhook, default 300                                         |
| `CMS_MAX_STALE_SECONDS` | longest time a published version is served without a fresh CMS confirmation, default 86400 (≥ `CMS_CACHE_SECONDS`)  |
| `CMS_SNAPSHOT_DIR`      | last known state per page/locale for outages; must be persistent (Docker: volume `/var/lib/avantime-cms-snapshots`) |

`CMS_MEDIA_URL` must also be passed to the Docker build (`--build-arg CMS_MEDIA_URL=…`, wired in
`docker-compose.staging.yml`): the standalone server fixes the `next/image` allow-list at build time.

With `on`, a missing or placeholder value stops the page with a configuration error (same
fail-fast policy as other `*-configuration.ts` loaders).

## Content states

| State                                                                            | Behaviour                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CMS disabled (`off`)                                                             | repository content, no CMS calls                                                |
| Published in this locale                                                         | CMS content from the tagged data cache (`cms:product-page:accounting:<locale>`) |
| Unpublished in this locale (draft remains)                                       | 404, `noindex`                                                                  |
| No entry for this locale                                                         | 404, `noindex`, log event `cms.product_page.missing`                            |
| CMS unavailable, last known "published", confirmed ≤ `CMS_MAX_STALE_SECONDS` ago | last published version (stale), log `cms.product_page.unavailable`              |
| CMS unavailable, last known "published", older than that                         | 5xx "temporarily unavailable", log `fallback: expired`                          |
| CMS unavailable, last known "withdrawn"                                          | 404 — withdrawn content is never shown again (does not expire)                  |
| CMS unavailable, no snapshot                                                     | 5xx with the localized "temporarily unavailable" page                           |

"Last known" is the newest of the data-cache entry and the snapshot, by the time the CMS confirmed it
(`checkedAt`).

Repository content is never used as an automatic fallback while the pilot is `on`: during an
outage the site cannot know whether the page was withdrawn. To serve repository content, switch
`CMS_PILOT_MODE=off` deliberately.

Every successful CMS read writes the snapshot. The revalidation endpoint also refreshes it
immediately (and records "withdrawn" after unpublish/delete if the CMS cannot be read), so a later
outage cannot resurrect an unpublished page.

## Lost notifications and staleness

The webhook is an accelerator, not the source of truth. The CMS sends it 3 times within ~15 s; a
notification that still fails is lost. The site reconciles on its own:

- **Site running, CMS available:** the published state is re-read from the CMS when the cache entry
  is older than `CMS_CACHE_SECONDS`. A publish, unpublish or delete whose notification was lost is
  visible after at most `CMS_CACHE_SECONDS` plus one request (the first request after the interval
  may still get the previous version while the refresh runs in the background).
- **Site restarted:** the data-cache key contains the process start time, so a restarted process never
  reuses a previous cache entry; `instrumentation.ts` re-reads every page and locale from the CMS at
  start (6 attempts, back-off 1–15 s) and then requests each page once to warm the cache. Changes made
  while the site was down are visible right after the start.
- **CMS unavailable as well:** the site cannot learn about the change. It serves the last known state:
  a withdrawn page stays withdrawn indefinitely; a published version is served for at most
  `CMS_MAX_STALE_SECONDS` (default 24 h) after the CMS last confirmed it, then the page answers 5xx
  until the CMS is reachable again. This bounds how long an unpublished page can remain online in
  the worst case (lost notification and CMS outage at the same time).

In short, for an unpublished or deleted locale:

| What the site knows                                                     | Answer                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The withdrawal (webhook delivered, or any later read of the CMS saw it) | `404` + `noindex`, also during a later CMS outage (the withdrawn snapshot never expires)           |
| Nothing (notification lost) and the CMS is reachable                    | the previous version for at most `CMS_CACHE_SECONDS` + one request, then `404`                     |
| Nothing (notification lost) and the CMS is unreachable                  | the previous version until `CMS_MAX_STALE_SECONDS` after the CMS last confirmed it                 |
| Nothing, and that limit has passed                                      | temporary error (`500`, localized "temporarily unavailable" page, `noindex`) until the CMS answers |

No cache can extend that limit: the age is checked on every request against `checkedAt` of the data
cache entry and of the snapshot, whichever is newer, never against when an entry was cached. When the
cached entry is past the limit (for example after a quiet period without visitors), the site asks the
CMS directly before answering, so a reachable CMS never produces the temporary error. The page
is rendered per request (`Cache-Control: private, no-cache, no-store`), so neither the Next.js
route cache, the browser nor a proxy keeps a copy of the HTML. Edge caches (CDN) must not be put
in front of the site with their own caching rules for these pages.

## Deployment notes

- Snapshots: named volume at `/var/lib/avantime-cms-snapshots` (created owned by uid 10001 in the
  image; staging and production compose set `CMS_SNAPSHOT_DIR`). The volume survives container
  recreation; without it the first start during a CMS outage has no last known state (5xx).
- `/app/apps/web/.next/cache` is a tmpfs in staging/production compose: the root file system is
  read-only, and the data cache and the optimized images need a writable directory. It is empty after
  every restart by design.
- Images are served by the CMS through `/_next/image`; during a CMS outage only images already in
  the optimizer cache are available.
- hreflang of the pilot page lists only locales currently published in the CMS (x-default only while
  LV is published); a withdrawn or unavailable page has no alternates and is `noindex`.
- canonical and hreflang URLs are absolute on every page, built from `AUTH_PUBLIC_ORIGIN`
  (`lib/site-public-origin.ts`), never from the request's `Host` header. Production accepts only a
  public HTTPS origin that is not a staging host (also enforced by `production:config-check`);
  staging accepts its own HTTPS host. A missing or rejected value leaves the URLs relative and
  logs `site.public_origin.rejected` instead of emitting a wrong host.

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

1. Open the CMS admin, _Content Manager → Страницы продуктов → Бухгалтерия предприятия_.
2. Choose the language in the locale switch (top right): Latvian, Russian or English.
3. Edit the fields. Labels and help texts in the form are grouped as _Текст · …_, _Изображение · …_
   and _SEO · …_; card titles also form the "Результат" list.
4. Image: _Изображение · Файл → Add asset → Upload from device_ (or _Browse library_), then update
   _Изображение · Описание (alt)_ for this language. Wait until the upload has finished.
5. _Save_ stores a draft. Visitors still see the published version.
6. _Open preview_ shows the draft in the site design with a yellow banner.
7. _Publish_ publishes **only the current language**. Other languages keep their published version
   and their own drafts. The site updates within a few seconds.
8. _⋯ → Unpublish_ removes this language from the site (404). _⋯ → Discard changes_ drops the draft.

Important for editors:

- **Uploaded files are public by URL immediately**, before the page is published (`/uploads/…`).
  Upload only images meant for the public site; never confidential documents.
- **Strapi Community keeps no version history.** A published or saved text cannot be restored from
  the CMS; recovery is only possible from a whole-CMS backup. Copy important text before large edits.
- Field labels, help texts and order are defined in code (`cms/src/editor-layout.ts` in the CMS
  repository) and re-applied on every CMS start; changes made in _Configure the view_ are overwritten.
