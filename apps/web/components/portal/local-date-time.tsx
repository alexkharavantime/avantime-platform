'use client';
/** @jsxRuntime automatic */

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

// Text of the server render and of hydration. It does not depend on the time zone or the ICU data of
// the runtime, so the server (container time zone) and the browser (visitor time zone) produce the
// same markup.
export function formatUtcDateTime(value: Date) {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// A timestamp shown in the visitor's time zone. During hydration React uses the server snapshot
// (false), then re-renders once with the browser's local time.
export function LocalDateTime({ value, locale }: { value: string; locale: string }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>—</span>;
  return (
    <time dateTime={date.toISOString()}>
      {hydrated ? date.toLocaleString(locale) : formatUtcDateTime(date)}
    </time>
  );
}
