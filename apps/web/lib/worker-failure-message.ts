// Masks the password in scheme://user:password@host; the greedy part keeps an unencoded "@" inside it.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/?#@]*):[^\s/?#]*@/giu;

export function redactUrlPasswords(text: string) {
  return text.replace(URL_PASSWORD, '$1:***@');
}

export function workerFailureMessage(worker: string, error: unknown) {
  return error instanceof Error
    ? `${worker} failed: ${redactUrlPasswords(error.message)}`
    : `${worker} failed.`;
}
