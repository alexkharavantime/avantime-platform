'use client';

import { useState } from 'react';

import type { TeamMember } from '../../lib/team';
import type { OrganizationRole } from '../../lib/session';
import type { Locale } from '../../lib/i18n';

const copy: Record<Locale, { roles: Record<OrganizationRole, string>; statuses: Record<TeamMember['status'], string>; error: string; saved: string; ownerPrompt: string; ownerCancelled: string; roleConfirm: string; statusConfirm: string; restore: string; suspend: string; remove: string; jobMissing: string; suspendButton: string; restoreButton: string; removeButton: string; bootstrapPrompt: string; bootstrapButton: string }> = {
  lv: { roles: { OWNER: 'Īpašnieks', ADMIN: 'Administrators', MANAGER: 'Vadītājs', MEMBER: 'Dalībnieks', VIEWER: 'Skatītājs' }, statuses: { ACTIVE: 'Aktīvs', INVITED: 'Uzaicināts', SUSPENDED: 'Apturēts', REMOVED: 'Noņemts' }, error: 'Neizdevās mainīt dalībnieku.', saved: 'Izmaiņas saglabātas. Dalībnieka aktīvās sesijas ir pārskatītas.', ownerPrompt: 'Ievadiet ASSIGN OWNER, lai apstiprinātu.', ownerCancelled: 'Īpašnieka piešķiršana atcelta.', roleConfirm: 'Mainīt dalībnieka lomu uz', statusConfirm: 'Apstipriniet darbību: mainīt dalībnieka piekļuvi.', restore: 'atjaunot', suspend: 'apturēt', remove: 'noņemt', jobMissing: 'Amats nav norādīts', suspendButton: 'Apturēt', restoreButton: 'Atjaunot', removeButton: 'Noņemt piekļuvi', bootstrapPrompt: 'Ievadiet ASSIGN OWNER, lai piešķirtu pirmo īpašnieku.', bootstrapButton: 'Piešķirt pirmo īpašnieku' },
  ru: { roles: { OWNER: 'Владелец', ADMIN: 'Администратор', MANAGER: 'Менеджер', MEMBER: 'Участник', VIEWER: 'Наблюдатель' }, statuses: { ACTIVE: 'Активен', INVITED: 'Приглашён', SUSPENDED: 'Приостановлен', REMOVED: 'Удалён' }, error: 'Не удалось изменить участника.', saved: 'Изменение сохранено. Активные сессии участника пересмотрены.', ownerPrompt: 'Введите ASSIGN OWNER для подтверждения.', ownerCancelled: 'Назначение владельца отменено.', roleConfirm: 'Изменить роль участника на', statusConfirm: 'Подтвердите действие: изменить доступ участника.', restore: 'восстановить', suspend: 'приостановить', remove: 'удалить', jobMissing: 'Должность не указана', suspendButton: 'Приостановить', restoreButton: 'Восстановить', removeButton: 'Удалить доступ', bootstrapPrompt: 'Введите ASSIGN OWNER для назначения первого владельца.', bootstrapButton: 'Назначить первого владельца' },
  en: { roles: { OWNER: 'Owner', ADMIN: 'Administrator', MANAGER: 'Manager', MEMBER: 'Member', VIEWER: 'Viewer' }, statuses: { ACTIVE: 'Active', INVITED: 'Invited', SUSPENDED: 'Suspended', REMOVED: 'Removed' }, error: 'Could not update the member.', saved: 'Changes saved. The member’s active sessions were reviewed.', ownerPrompt: 'Enter ASSIGN OWNER to confirm.', ownerCancelled: 'Owner assignment cancelled.', roleConfirm: 'Change the member role to', statusConfirm: 'Confirm this action: change the member’s access.', restore: 'restore', suspend: 'suspend', remove: 'remove', jobMissing: 'Job title not provided', suspendButton: 'Suspend', restoreButton: 'Restore', removeButton: 'Remove access', bootstrapPrompt: 'Enter ASSIGN OWNER to assign the first owner.', bootstrapButton: 'Assign first owner' },
};

export function TeamManagement({
  initialMembers,
  assignableRoles,
  mayManageRoles,
  mayRemoveMembers,
  currentUserId,
  canBootstrapOwner,
  locale,
}: {
  initialMembers: TeamMember[];
  assignableRoles: OrganizationRole[];
  mayManageRoles: boolean;
  mayRemoveMembers: boolean;
  currentUserId: string;
  canBootstrapOwner: boolean;
  locale: Locale;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const text = copy[locale];

  async function mutate(member: TeamMember, body: Record<string, unknown>) {
    setBusyId(member.id);
    setMessage('');
    const response = await fetch(`/api/team/members/${encodeURIComponent(member.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, expectedVersion: member.version }),
    });
    const data = (await response.json()) as {
      error?: string;
      membership?: {
        id: string;
        role: OrganizationRole;
        status: TeamMember['status'];
        version: number;
      };
      version?: number;
    };
    setBusyId(null);
    if (!response.ok) {
      setMessage(text.error);
      return;
    }
    if (data.membership) {
      setMembers((current) =>
        data.membership?.status === 'REMOVED'
          ? current.filter((item) => item.id !== member.id)
          : current.map((item) =>
              item.id === member.id
                ? {
                    ...item,
                    role: data.membership!.role,
                    status: data.membership!.status,
                    version: data.membership!.version,
                    active: data.membership!.status === 'ACTIVE',
                  }
                : item,
            ),
      );
    } else if (typeof data.version === 'number') {
      setMembers((current) =>
        current.map((item) =>
          item.id === member.id ? { ...item, role: 'OWNER', version: data.version! } : item,
        ),
      );
    }
    setMessage(text.saved);
  }

  async function changeRole(member: TeamMember, role: OrganizationRole) {
    if (role === member.role) return;
    const confirmation =
      role === 'OWNER' ? window.prompt(text.ownerPrompt) : undefined;
    if (role === 'OWNER' && confirmation !== 'ASSIGN OWNER') {
      setMessage(text.ownerCancelled);
      return;
    }
    if (!window.confirm(`${text.roleConfirm} «${text.roles[role]}»?`)) return;
    await mutate(member, { action: 'role', role, confirmation });
  }

  async function changeStatus(member: TeamMember, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED') {
    const label =
      status === 'ACTIVE' ? text.restore : status === 'SUSPENDED' ? text.suspend : text.remove;
    if (!window.confirm(`${text.statusConfirm} (${label}).`)) return;
    await mutate(member, { action: 'status', status });
  }

  async function bootstrapOwner(member: TeamMember) {
    const confirmation = window.prompt(text.bootstrapPrompt);
    if (confirmation !== 'ASSIGN OWNER') return;
    await mutate(member, { action: 'bootstrap-owner', confirmation });
  }

  return (
    <div className="mt-8 space-y-4">
      {message && (
        <p
          role="status"
          className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
        >
          {message}
        </p>
      )}
      <ul className="grid gap-4">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          return (
            <li key={member.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1.5fr_1fr_1fr] lg:items-center">
                <div>
                  <p className="font-black">{member.name}</p>
                  <p className="text-sm text-slate-500">
                    {member.jobTitle || text.jobMissing}
                  </p>
                </div>
                <p className="break-all text-sm text-slate-600">{member.email}</p>
                <div>
                      <span className="sr-only">{text.roles[member.role]}: </span>
                  {mayManageRoles ? (
                    <select
                      aria-label={`Роль участника ${member.name}`}
                      value={member.role}
                      disabled={busyId === member.id}
                      onChange={(event) =>
                        void changeRole(member, event.target.value as OrganizationRole)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    >
                      {!assignableRoles.includes(member.role) && (
                        <option value={member.role}>{text.roles[member.role]}</option>
                      )}
                      {assignableRoles.map((role) => (
                        <option key={role} value={role}>
                          {text.roles[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm font-bold text-slate-700">
                      {text.roles[member.role]}
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-700">
                  {text.statuses[member.status]}
                </span>
              </div>
              {mayRemoveMembers && !isSelf && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {member.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={busyId === member.id}
                      onClick={() => void changeStatus(member, 'SUSPENDED')}
                      className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800"
                    >
                      {text.suspendButton}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === member.id}
                      onClick={() => void changeStatus(member, 'ACTIVE')}
                      className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-800"
                    >
                      {text.restoreButton}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() => void changeStatus(member, 'REMOVED')}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700"
                  >
                    {text.removeButton}
                  </button>
                </div>
              )}
              {canBootstrapOwner && isSelf && member.role === 'ADMIN' && (
                <button
                  type="button"
                  disabled={busyId === member.id}
                  onClick={() => void bootstrapOwner(member)}
                  className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white"
                >
                  {text.bootstrapButton}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
