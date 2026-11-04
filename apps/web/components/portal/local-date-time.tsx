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

// False on the server and during hydration, true afterwards: values that depend on the visitor's
// time zone are rendered only once hydration is over.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

// An instant (ISO string) as the value of an <input type="datetime-local"> in the time zone of the
// runtime: the browser shows and edits wall-clock time, not UTC.
export function toDateTimeLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The value of a datetime-local input (wall-clock time of the runtime's time zone) as an instant.
export function fromDateTimeLocalInput(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/u.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// A timestamp shown in the visitor's time zone. During hydration React uses the server snapshot
// (false), then re-renders once with the browser's local time.
export function LocalDateTime({ value, locale }: { value: string; locale: string }) {
  const hydrated = useHydrated();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>—</span>;
  return (
    <time dateTime={date.toISOString()}>
      {hydrated ? date.toLocaleString(locale) : formatUtcDateTime(date)}
    </time>
  );
}
