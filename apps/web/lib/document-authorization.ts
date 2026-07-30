import { authorizeSession } from './authorization';
import {
  authorizePortalApi,
  authorizePortalSession,
  getValidatedPortalSession,
} from './portal-session';
import type { AppSession } from './session';

export function authorizeDocumentSession(session: AppSession | null) {
  return authorizeSession(session, ['ADMIN']);
}

export async function authorizeDocumentApi() {
  return authorizeSession(await getValidatedPortalSession(), ['ADMIN']);
}

export function authorizeDocumentReadSession(session: AppSession | null) {
  return authorizePortalSession(session);
}

export function authorizeDocumentReadApi() {
  return authorizePortalApi();
}
