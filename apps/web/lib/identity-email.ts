export type IdentityEmailKind = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' | 'INVITATION';

const SUBJECTS: Record<IdentityEmailKind, string> = {
  PASSWORD_RESET: 'Код восстановления пароля Avantime',
  EMAIL_VERIFICATION: 'Код подтверждения email Avantime',
  INVITATION: 'Приглашение в портал Avantime',
};

function identityMessage(kind: IdentityEmailKind, code: string) {
  if (kind === 'PASSWORD_RESET') {
    return `Введите этот одноразовый код на странице восстановления пароля: ${code}. Код действует 30 минут.`;
  }
  if (kind === 'EMAIL_VERIFICATION') {
    return `Введите этот одноразовый код для подтверждения email: ${code}. Код действует 30 минут.`;
  }
  return `Введите этот одноразовый код после входа в портал, чтобы принять приглашение: ${code}. Код действует 72 часа.`;
}

export async function sendIdentityEmail(input: {
  kind: IdentityEmailKind;
  recipient: string;
  code: string;
}) {
  if (process.env.NODE_ENV !== 'production') return { delivered: false as const };
  if (
    process.env.IDENTITY_EMAIL_DRIVER !== 'resend' ||
    !process.env.RESEND_API_KEY ||
    !process.env.MAIL_FROM
  ) {
    throw new Error('Identity email delivery is not configured.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [input.recipient],
      subject: SUBJECTS[input.kind],
      text: identityMessage(input.kind, input.code),
    }),
  });
  if (!response.ok) {
    throw new Error('Identity email provider rejected the request.');
  }
  return { delivered: true as const };
}
