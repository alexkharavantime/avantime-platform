'use client';

import { useEffect, useRef, useState } from 'react';
import type { AccessRequestSummary } from '../../lib/access-requests';
import { portalCopy, type Locale, type PortalCopy } from '../../lib/i18n';
import type { OrganizationRole } from '../../lib/session';

type AssignableOrganizationRole = Exclude<OrganizationRole, 'OWNER'>;

function RequestDetails({
  request,
  companies,
  copy,
  locale,
}: {
  request: AccessRequestSummary;
  companies: Array<{ id: string; name: string }>;
  copy: PortalCopy['accessRequests'];
  locale: Locale;
}) {
  const dateLocale = locale === 'lv' ? 'lv-LV' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  const submittedAt = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(request.createdAt);
  const assignedCompany = companies.find((company) => company.id === request.decisionCompanyId);
  const emailVerification = request.emailVerifiedAt
    ? copy.emailVerificationConfirmed
    : copy.emailVerificationPending;
  const adminDecision =
    request.status === 'APPROVED'
      ? copy.adminDecisionApproved
      : request.status === 'REJECTED'
        ? copy.adminDecisionRejected
        : copy.adminDecisionPending;

  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-bold text-slate-500">{copy.requestedAt}</dt>
        <dd>{submittedAt}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-500">{copy.emailVerificationLabel}</dt>
        <dd>{emailVerification}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-500">{copy.adminDecisionLabel}</dt>
        <dd>{adminDecision}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-500">{copy.name}</dt>
        <dd>{request.name}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-500">{copy.email}</dt>
        <dd className="break-all">{request.email}</dd>
      </div>
      <div>
        <dt className="font-bold text-slate-500">{copy.requestedCompany}</dt>
        <dd>{request.companyName}</dd>
      </div>
      {assignedCompany && (
        <div>
          <dt className="font-bold text-slate-500">{copy.assignedCompany}</dt>
          <dd>{assignedCompany.name}</dd>
        </div>
      )}
      {request.status === 'REJECTED' && request.rejectionReason && (
        <div className="sm:col-span-2">
          <dt className="font-bold text-slate-500">{copy.rejectionReasonLabel}</dt>
          <dd className="whitespace-pre-wrap">{request.rejectionReason}</dd>
        </div>
      )}
      <div className="sm:col-span-2">
        <dt className="font-bold text-slate-500">{copy.comment}</dt>
        <dd className="whitespace-pre-wrap">{request.comment || copy.noComment}</dd>
      </div>
    </dl>
  );
}

export function AccessRequestsQueue({
  initialRequests,
  companies,
  locale,
  emailDeliveryEnabled,
}: {
  initialRequests: AccessRequestSummary[];
  companies: Array<{ id: string; name: string }>;
  locale: Locale;
  emailDeliveryEnabled: boolean;
}) {
  const copy = portalCopy[locale].accessRequests;
  const [requests, setRequests] = useState(initialRequests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [companyByRequest, setCompanyByRequest] = useState<Record<string, string>>({});
  const [roleByRequest, setRoleByRequest] = useState<Record<string, AssignableOrganizationRole>>({});
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmation, setConfirmation] = useState<{
    request: AccessRequestSummary;
    decision:
      | { action: 'approve'; companyId: string; role: AssignableOrganizationRole }
      | { action: 'reject'; reason: string };
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) dialog.showModal();
    if (!confirmation && dialog.open) dialog.close();
  }, [confirmation]);

  async function decide(
    request: AccessRequestSummary,
    body:
      | { action: 'approve'; companyId: string; role: AssignableOrganizationRole }
      | { action: 'reject'; reason: string },
  ) {
    setBusyId(request.id);
    setMessage('');
    try {
      const response = await fetch(
        `/api/platform/access-requests/${encodeURIComponent(request.id)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json()) as {
        status?: string;
        invitationCreated?: boolean;
        emailAccepted?: boolean;
        emailDeliveryConfirmed?: boolean;
        emailDeliveryEnabled?: boolean;
        emailDeliverySuppressed?: boolean;
      };
      if (!response.ok) {
        const errorCopy: Record<number, string> = {
          403: copy.requestForbidden,
          404: copy.requestMissing,
          409: copy.requestNoLongerEligible,
          503: copy.operationUnavailable,
        };
        setMessage(errorCopy[response.status] ?? copy.operationFailed);
        setMessageIsError(true);
        return;
      }
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: (data.status as AccessRequestSummary['status']) ?? item.status,
                decisionCompanyId: body.action === 'approve' ? body.companyId : item.decisionCompanyId,
                decisionRole: body.action === 'approve' ? body.role : item.decisionRole,
                rejectionReason: body.action === 'reject' ? body.reason : item.rejectionReason,
              }
            : item,
        ),
      );
      setMessageIsError(false);
      if (data.status === 'APPROVED' && data.invitationCreated) {
        const deliveryNextStep =
          data.emailDeliverySuppressed || data.emailDeliveryEnabled === false
            ? copy.invitationEmailDisabledNextStep
            : data.emailAccepted
              ? ''
              : copy.invitationEmailFailureNextStep;
        setMessage(
          [
            copy.approvalCreatedInvitation,
            data.emailAccepted ? copy.invitationEmailAccepted : copy.invitationEmailNotAccepted,
            data.emailDeliveryConfirmed ? '' : copy.invitationEmailDeliveryUnconfirmed,
            deliveryNextStep,
          ]
            .filter(Boolean)
            .join(' '),
        );
      } else {
        setMessage(copy.rejected);
      }
      setConfirmation(null);
      setRejectionReason('');
    } catch {
      setMessage(copy.operationFailed);
      setMessageIsError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function resendVerification(request: AccessRequestSummary) {
    setBusyId(request.id);
    setMessage('');
    try {
      const response = await fetch(
        `/api/platform/access-requests/${encodeURIComponent(request.id)}/resend-verification`,
        { method: 'POST' },
      );
      const data = (await response.json()) as { deliveryStatus?: string };
      if (!response.ok) {
        const errorCopy: Record<number, string> = {
          403: copy.requestForbidden,
          404: copy.requestMissing,
          409: copy.requestNoLongerEligible,
          429: copy.resendRateLimited,
          503: copy.operationUnavailable,
        };
        setMessage(errorCopy[response.status] ?? copy.operationFailed);
        setMessageIsError(true);
        return;
      }
      const deliveryCopy: Record<string, string> = {
        accepted: copy.verificationResentAccepted,
        disabled: copy.verificationResentDisabled,
        failed: copy.verificationResentFailed,
      };
      setMessage(deliveryCopy[data.deliveryStatus ?? ''] ?? copy.verificationResentFailed);
      setMessageIsError(data.deliveryStatus !== 'accepted');
    } catch {
      setMessage(copy.operationFailed);
      setMessageIsError(true);
    } finally {
      setBusyId(null);
    }
  }

  const pendingVerification = requests.filter((item) => item.status === 'PENDING');
  const reviewable = requests.filter((item) => item.status === 'EMAIL_VERIFIED');
  const decided = requests.filter((item) => item.status === 'APPROVED' || item.status === 'REJECTED');
  const confirmationApproval =
    confirmation?.decision.action === 'approve' ? confirmation.decision : null;

  function renderRequest(item: AccessRequestSummary, canDecide: boolean) {
    return (
      <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-black">{item.name}</h3>
        <RequestDetails request={item} companies={companies} copy={copy} locale={locale} />
        {item.status === 'PENDING' && (
          <div className="mt-4 space-y-3">
            <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              {emailDeliveryEnabled ? copy.emailVerificationBlocked : copy.emailDeliveryDisabled}
            </p>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => void resendVerification(item)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-60"
            >
              {copy.resendVerification}
            </button>
          </div>
        )}
        {canDecide && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <select
              aria-label={`${copy.companyFor} ${item.name}`}
              value={companyByRequest[item.id] ?? ''}
              onChange={(event) =>
                setCompanyByRequest((current) => ({ ...current, [item.id]: event.target.value }))
              }
              className="rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{copy.companyPlaceholder}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              aria-label={`${copy.roleFor} ${item.name}`}
              value={roleByRequest[item.id] ?? 'MEMBER'}
              onChange={(event) =>
                setRoleByRequest((current) => ({
                  ...current,
                  [item.id]: event.target.value as AssignableOrganizationRole,
                }))
              }
              className="rounded-xl border border-slate-300 px-3 py-2"
            >
              {(Object.keys(copy.roleLabels) as Array<Exclude<OrganizationRole, 'OWNER'>>).map((role) => (
                <option key={role} value={role}>
                  {copy.roleLabels[role]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyId === item.id || companies.length === 0 || !companyByRequest[item.id]}
              onClick={() => {
                setMessage('');
                setConfirmation({
                  request: item,
                  decision: {
                    action: 'approve',
                    companyId: companyByRequest[item.id],
                    role: roleByRequest[item.id] ?? 'MEMBER',
                  },
                });
              }}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {copy.approve}
            </button>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => {
                setMessage('');
                setRejectionReason('');
                setConfirmation({ request: item, decision: { action: 'reject', reason: '' } });
              }}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-60"
            >
              {copy.reject}
            </button>
            {companies.length === 0 ? (
              <p role="note" className="text-sm text-amber-900 sm:col-span-4">
                {copy.companiesUnavailable}
              </p>
            ) : !companyByRequest[item.id] ? (
              <p role="note" className="text-sm text-slate-600 sm:col-span-4">
                {copy.selectCompanyReason}
              </p>
            ) : null}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {message && (
        <p role={messageIsError ? 'alert' : 'status'} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
          {message}
        </p>
      )}
      {requests.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
          {copy.empty}
        </p>
      ) : null}
      {reviewable.length > 0 && (
        <section aria-labelledby="access-requests-review">
          <h2 id="access-requests-review" className="text-lg font-black">{copy.reviewTitle}</h2>
          <ul className="mt-3 grid gap-4">{reviewable.map((item) => renderRequest(item, true))}</ul>
        </section>
      )}
      {pendingVerification.length > 0 && (
        <section aria-labelledby="access-requests-verification">
          <h2 id="access-requests-verification" className="text-lg font-black">{copy.pendingVerificationTitle}</h2>
          <ul className="mt-3 grid gap-4">{pendingVerification.map((item) => renderRequest(item, false))}</ul>
        </section>
      )}
      {decided.length > 0 && (
        <div>
          <h2 className="text-lg font-black">{copy.historyTitle}</h2>
          <ul className="mt-3 grid gap-4">{decided.map((item) => renderRequest(item, false))}</ul>
        </div>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="access-request-confirmation-title"
        aria-describedby="access-request-confirmation-description"
        onCancel={(event) => {
          event.preventDefault();
          setConfirmation(null);
        }}
        className="m-auto max-h-[90vh] w-[min(34rem,calc(100%-2rem))] rounded-xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl backdrop:bg-slate-950/50"
      >
        {confirmation && (
          <div className="space-y-4">
            <div>
              <h2 id="access-request-confirmation-title" className="text-xl font-black">
                {confirmation.decision.action === 'approve'
                  ? copy.approveDialogTitle
                  : copy.rejectDialogTitle}
              </h2>
              <p id="access-request-confirmation-description" className="mt-2 text-sm leading-6 text-slate-600">
                {confirmation.decision.action === 'approve'
                  ? copy.approveDialogDescription
                  : copy.rejectDialogDescription}
              </p>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-sm font-bold">
              {confirmation.request.name} · {confirmation.request.email}
              {confirmationApproval && (
                <span className="mt-1 block font-normal">
                  {companies.find((company) => company.id === confirmationApproval.companyId)?.name}
                  {' · '}
                  {copy.roleLabels[confirmationApproval.role]}
                </span>
              )}
            </p>
            {confirmation.decision.action === 'reject' && (
              <label className="block">
                <span className="mb-2 block text-sm font-bold">{copy.rejectionReasonLabel}</span>
                <textarea
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                {!rejectionReason.trim() && (
                  <span className="mt-1 block text-sm text-amber-800">{copy.rejectionReasonRequired}</span>
                )}
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={
                  busyId === confirmation.request.id ||
                  (confirmation.decision.action === 'reject' && !rejectionReason.trim())
                }
                onClick={() => {
                  const decision = confirmation.decision;
                  void decide(
                    confirmation.request,
                    decision.action === 'approve'
                      ? decision
                      : { action: 'reject', reason: rejectionReason.trim() },
                  );
                }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {confirmation.decision.action === 'approve'
                  ? copy.confirmApprove
                  : copy.confirmReject}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
