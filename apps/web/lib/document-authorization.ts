import { authorizeApi, authorizeSession } from './authorization';
import type { AppSession } from './session';

export function authorizeDocumentSession(session: AppSession | null) {
  return authorizeSession(session, ['ADMIN']);
}

export function authorizeDocumentApi() {
  return authorizeApi(['ADMIN']);
}
