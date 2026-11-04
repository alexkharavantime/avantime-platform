import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { LocalDateTime, formatUtcDateTime } from '../components/portal/local-date-time';

const zones = ['UTC', 'Europe/Riga', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata'];

function inZone<T>(zone: string, run: () => T) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test('server markup of a timestamp is identical in every time zone', () => {
  const value = '2026-11-04T23:45:10.000Z';
  const rendered = zones.map((zone) =>
    inZone(zone, () => renderToString(createElement(LocalDateTime, { value, locale: 'lv-LV' }))),
  );
  // The zones really differ for this instant (local date changes), so equality is meaningful.
  assert.notEqual(
    inZone('Pacific/Kiritimati', () => new Date(value).getDate()),
    inZone('America/Los_Angeles', () => new Date(value).getDate()),
  );
  assert.equal(new Set(rendered).size, 1);
  assert.equal(
    rendered[0],
    '<time dateTime="2026-11-04T23:45:10.000Z">2026-11-04 23:45 UTC</time>',
  );
});

test('the deterministic text ignores the locale and handles invalid values', () => {
  assert.equal(formatUtcDateTime(new Date('2026-01-02T03:04:59.999Z')), '2026-01-02 03:04 UTC');
  assert.equal(
    renderToString(createElement(LocalDateTime, { value: 'not a date', locale: 'ru-RU' })),
    '<span>—</span>',
  );
});
