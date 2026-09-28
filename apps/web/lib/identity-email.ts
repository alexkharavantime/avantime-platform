import { defaultLocale, isLocale, type Locale } from './i18n';

export type IdentityEmailKind =
  | 'PASSWORD_RESET'
  | 'EMAIL_VERIFICATION'
  | 'INVITATION'
  | 'ACCESS_REQUEST_VERIFICATION';

const EMAIL_COPY: Record<
  Locale,
  Record<IdentityEmailKind, { subject: string; message: (value: string) => string }>
> = {
  ru: {
    PASSWORD_RESET: {
      subject: 'Код восстановления пароля Avantime',
      message: (code) =>
        `Введите этот одноразовый код на странице восстановления пароля: ${code}. Код действует 30 минут.`,
    },
    EMAIL_VERIFICATION: {
      subject: 'Код подтверждения email Avantime',
      message: (code) =>
        `Введите этот одноразовый код для подтверждения email: ${code}. Код действует 30 минут.`,
    },
    INVITATION: {
      subject: 'Приглашение в портал Avantime',
      message: (code) =>
        `Введите этот одноразовый код после входа в портал, чтобы принять приглашение: ${code}. Код действует 72 часа.`,
    },
    ACCESS_REQUEST_VERIFICATION: {
      subject: 'Подтвердите заявку на доступ к порталу Avantime',
      message: (link) =>
        `Перейдите по ссылке, чтобы подтвердить email и передать заявку администратору: ${link}. Ссылка действует 30 минут.`,
    },
  },
  lv: {
    PASSWORD_RESET: {
      subject: 'Avantime paroles atjaunošanas kods',
      message: (code) =>
        `Ievadiet šo vienreizējo kodu paroles atjaunošanas lapā: ${code}. Kods derīgs 30 minūtes.`,
    },
    EMAIL_VERIFICATION: {
      subject: 'Avantime e-pasta apstiprināšanas kods',
      message: (code) => `Ievadiet šo vienreizējo kodu, lai apstiprinātu e-pastu: ${code}. Kods derīgs 30 minūtes.`,
    },
    INVITATION: {
      subject: 'Ielūgums uz Avantime portālu',
      message: (code) =>
        `Ievadiet šo vienreizējo kodu pēc pieslēgšanās portālam, lai pieņemtu ielūgumu: ${code}. Kods derīgs 72 stundas.`,
    },
    ACCESS_REQUEST_VERIFICATION: {
      subject: 'Apstipriniet pieteikumu Avantime portāla piekļuvei',
      message: (link) =>
        `Sekojiet saitei, lai apstiprinātu e-pastu un nodotu pieteikumu administratoram: ${link}. Saite derīga 30 minūtes.`,
    },
  },
  en: {
    PASSWORD_RESET: {
      subject: 'Your Avantime password reset code',
      message: (code) =>
        `Enter this one-time code on the password recovery page: ${code}. The code is valid for 30 minutes.`,
    },
    EMAIL_VERIFICATION: {
      subject: 'Your Avantime email verification code',
      message: (code) => `Enter this one-time code to verify your email: ${code}. The code is valid for 30 minutes.`,
    },
    INVITATION: {
      subject: 'Your Avantime portal invitation',
      message: (code) =>
        `After signing in to the portal, enter this one-time code to accept the invitation: ${code}. The code is valid for 72 hours.`,
    },
    ACCESS_REQUEST_VERIFICATION: {
      subject: 'Confirm your Avantime portal access request',
      message: (link) =>
        `Follow this link to verify your email and forward your request to an administrator: ${link}. The link is valid for 30 minutes.`,
    },
  },
};

export async function sendIdentityEmail(input: {
  kind: IdentityEmailKind;
  recipient: string;
  code: string;
  locale?: string;
}) {
  if (process.env.NODE_ENV !== 'production') return { delivered: false as const };
  if (
    process.env.IDENTITY_EMAIL_DRIVER !== 'resend' ||
    !process.env.RESEND_API_KEY ||
    !process.env.MAIL_FROM
  ) {
    throw new Error('Identity email delivery is not configured.');
  }
  const locale = isLocale(input.locale) ? input.locale : defaultLocale;
  const copy = EMAIL_COPY[locale][input.kind];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [input.recipient],
      subject: copy.subject,
      text: copy.message(input.code),
    }),
  });
  if (!response.ok) {
    throw new Error('Identity email provider rejected the request.');
  }
  return { delivered: true as const };
}
