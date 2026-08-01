import {
  authorizeOrganizationApi,
  authorizeOrganizationSessionSync,
} from './organization-authorization';
import type { AppSession } from './session';

export function authorizeDocumentSession(session: AppSession | null) {
  return authorizeOrganizationSessionSync(session, 'documents.manage');
}

export async function authorizeDocumentApi() {
  return authorizeOrganizationApi('documents.manage');
}

export function authorizeDocumentReadSession(session: AppSession | null) {
  return authorizeOrganizationSessionSync(session, 'documents.view');
}

export function authorizeDocumentReadApi() {
  return authorizeOrganizationApi('documents.view');
}

export function authorizeDocumentDownloadApi() {
  return authorizeOrganizationApi('documents.download');
}

export function authorizeDocumentUploadApi() {
  return authorizeOrganizationApi('documents.upload');
}

export function authorizeDocumentReprocessApi() {
  return authorizeOrganizationApi('documents.reprocess');
}

export function authorizeDocumentDeleteApi() {
  return authorizeOrganizationApi('documents.delete');
}
