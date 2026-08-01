'use client';

import { useState } from 'react';

import type { TeamMember } from '../../lib/team';
import type { OrganizationRole } from '../../lib/session';

const roleLabels: Record<OrganizationRole, string> = {
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  MANAGER: 'Менеджер',
  MEMBER: 'Участник',
  VIEWER: 'Наблюдатель',
};

const statusLabels = {
  ACTIVE: 'Активен',
  INVITED: 'Приглашён',
  SUSPENDED: 'Приостановлен',
  REMOVED: 'Удалён',
} as const;

export function TeamManagement({
  initialMembers,
  assignableRoles,
  mayManageRoles,
  mayRemoveMembers,
  currentUserId,
  canBootstrapOwner,
}: {
  initialMembers: TeamMember[];
  assignableRoles: OrganizationRole[];
  mayManageRoles: boolean;
  mayRemoveMembers: boolean;
  currentUserId: string;
  canBootstrapOwner: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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
      setMessage(data.error ?? 'Не удалось изменить участника.');
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
    setMessage('Изменение сохранено. Активные сессии участника пересмотрены.');
  }

  async function changeRole(member: TeamMember, role: OrganizationRole) {
    if (role === member.role) return;
    const confirmation =
      role === 'OWNER' ? window.prompt('Введите ASSIGN OWNER для подтверждения.') : undefined;
    if (role === 'OWNER' && confirmation !== 'ASSIGN OWNER') {
      setMessage('Назначение владельца отменено.');
      return;
    }
    if (!window.confirm(`Изменить роль участника на «${roleLabels[role]}»?`)) return;
    await mutate(member, { action: 'role', role, confirmation });
  }

  async function changeStatus(member: TeamMember, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED') {
    const label =
      status === 'ACTIVE' ? 'восстановить' : status === 'SUSPENDED' ? 'приостановить' : 'удалить';
    if (!window.confirm(`Подтвердите действие: ${label} доступ участника.`)) return;
    await mutate(member, { action: 'status', status });
  }

  async function bootstrapOwner(member: TeamMember) {
    const confirmation = window.prompt('Введите ASSIGN OWNER для назначения первого владельца.');
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
                    {member.jobTitle || 'Должность не указана'}
                  </p>
                </div>
                <p className="break-all text-sm text-slate-600">{member.email}</p>
                <div>
                  <span className="sr-only">Роль: </span>
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
                        <option value={member.role}>{roleLabels[member.role]}</option>
                      )}
                      {assignableRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm font-bold text-slate-700">
                      {roleLabels[member.role]}
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-700">
                  {statusLabels[member.status]}
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
                      Приостановить
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === member.id}
                      onClick={() => void changeStatus(member, 'ACTIVE')}
                      className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-800"
                    >
                      Восстановить
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() => void changeStatus(member, 'REMOVED')}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700"
                  >
                    Удалить доступ
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
                  Назначить первого владельца
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
