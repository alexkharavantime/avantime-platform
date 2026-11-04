import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  LocalDateTime,
  formatUtcDateTime,
  fromDateTimeLocalInput,
  toDateTimeLocalInput,
} from '../components/portal/local-date-time';

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

test('datetime-local input shows and reads the instant in the browser time zone', () => {
  // Winter and summer instants in Riga (EET/EEST) and Los Angeles (PST/PDT).
  const cases: Array<[string, string, string]> = [
    ['UTC', '2026-12-01T08:00:00.000Z', '2026-12-01T08:00'],
    ['UTC', '2026-07-01T23:30:00.000Z', '2026-07-01T23:30'],
    ['Europe/Riga', '2026-12-01T08:00:00.000Z', '2026-12-01T10:00'],
    ['Europe/Riga', '2026-07-01T23:30:00.000Z', '2026-07-02T02:30'],
    ['America/Los_Angeles', '2026-12-01T08:00:00.000Z', '2026-12-01T00:00'],
    ['America/Los_Angeles', '2026-07-01T23:30:00.000Z', '2026-07-01T16:30'],
  ];
  for (const [zone, instant, local] of cases) {
    inZone(zone, () => {
      assert.equal(toDateTimeLocalInput(instant), local, `${zone} shows ${instant}`);
      assert.equal(fromDateTimeLocalInput(local), instant, `${zone} reads ${local}`);
    });
  }
  assert.equal(toDateTimeLocalInput(null), '');
  assert.equal(toDateTimeLocalInput('not a date'), '');
  assert.equal(fromDateTimeLocalInput(''), null);
  assert.equal(fromDateTimeLocalInput('2026-13-40T99:00'), undefined);
  assert.equal(fromDateTimeLocalInput('2026-12-01'), undefined);
});

test('an unedited enforcement date round-trips without a shift in every zone', () => {
  const stored = '2026-11-04T22:15:00.000Z';
  for (const zone of ['UTC', 'Europe/Riga', 'America/Los_Angeles']) {
    inZone(zone, () => {
      assert.equal(fromDateTimeLocalInput(toDateTimeLocalInput(stored)), stored, zone);
      // The previous implementation: UTC text read back as local time shifted the instant.
      const legacy = new Date(stored.slice(0, 16)).toISOString();
      assert.equal(legacy === stored, zone === 'UTC', `${zone} legacy shift`);
    });
  }
});
