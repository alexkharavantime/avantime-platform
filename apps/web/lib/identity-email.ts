import { defaultLocale, isLocale, type Locale } from './i18n';

export type IdentityEmailKind =
  | 'PASSWORD_RESET'
  | 'EMAIL_VERIFICATION'
  | 'INVITATION'
  | 'ACCESS_REQUEST_INVITATION'
  | 'ACCESS_REQUEST_VERIFICATION'
  | 'ACCESS_REQUEST_REVIEW_NOTIFICATION'
  | 'EMAIL_CHANGE_VERIFICATION';

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
    ACCESS_REQUEST_INVITATION: {
      subject: 'Доступ к порталу Avantime одобрен',
      message: (link) => `Заявка одобрена. Перейдите по ссылке, чтобы создать учётную запись и принять приглашение: ${link}. Ссылка действует 72 часа.`,
    },
    ACCESS_REQUEST_VERIFICATION: {
      subject: 'Подтвердите заявку на доступ к порталу Avantime',
      message: (link) =>
        `Перейдите по ссылке, чтобы подтвердить email и передать заявку администратору: ${link}. Ссылка действует 30 минут.`,
    },
    ACCESS_REQUEST_REVIEW_NOTIFICATION: {
      subject: 'Новая заявка Avantime готова к рассмотрению',
      message: (link) => `Поступила заявка с подтверждённым email. Откройте очередь: ${link}`,
    },
    EMAIL_CHANGE_VERIFICATION: {
      subject: 'Подтвердите новый email Avantime',
      message: (link) => `Перейдите по ссылке, чтобы сменить email входа: ${link}. Ссылка действует 30 минут.`,
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
    ACCESS_REQUEST_INVITATION: {
      subject: 'Piekļuve Avantime portālam ir apstiprināta',
      message: (link) => `Pieteikums ir apstiprināts. Atveriet saiti, lai izveidotu kontu un pieņemtu ielūgumu: ${link}. Saite derīga 72 stundas.`,
    },
    ACCESS_REQUEST_VERIFICATION: {
      subject: 'Apstipriniet pieteikumu Avantime portāla piekļuvei',
      message: (link) =>
        `Sekojiet saitei, lai apstiprinātu e-pastu un nodotu pieteikumu administratoram: ${link}. Saite derīga 30 minūtes.`,
    },
    ACCESS_REQUEST_REVIEW_NOTIFICATION: {
      subject: 'Jauns Avantime pieteikums ir gatavs izskatīšanai',
      message: (link) => `Saņemts pieteikums ar apstiprinātu e-pastu. Atveriet pieteikumu sarakstu: ${link}`,
    },
    EMAIL_CHANGE_VERIFICATION: {
      subject: 'Apstipriniet jauno Avantime e-pastu',
      message: (link) => `Atveriet saiti, lai mainītu pieteikšanās e-pastu: ${link}. Saite derīga 30 minūtes.`,
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
    ACCESS_REQUEST_INVITATION: {
      subject: 'Your Avantime portal access is approved',
      message: (link) => `Your request was approved. Follow this link to create an account and accept the invitation: ${link}. The link is valid for 72 hours.`,
    },
    ACCESS_REQUEST_VERIFICATION: {
      subject: 'Confirm your Avantime portal access request',
      message: (link) =>
        `Follow this link to verify your email and forward your request to an administrator: ${link}. The link is valid for 30 minutes.`,
    },
    ACCESS_REQUEST_REVIEW_NOTIFICATION: {
      subject: 'A new Avantime access request is ready for review',
      message: (link) => `A request with a verified email is ready for review. Open the queue: ${link}`,
    },
    EMAIL_CHANGE_VERIFICATION: {
      subject: 'Confirm your new Avantime email',
      message: (link) => `Follow this link to change your login email: ${link}. The link is valid for 30 minutes.`,
    },
  },
};

export function isIdentityEmailDeliveryEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return (
    environment.NODE_ENV === 'production' &&
    environment.IDENTITY_EMAIL_DRIVER === 'resend' &&
    Boolean(environment.RESEND_API_KEY?.trim() && environment.MAIL_FROM?.trim())
  );
}

export async function sendIdentityEmail(
  input: {
    kind: IdentityEmailKind;
    recipient: string;
    code: string;
    locale?: string;
  },
  dependencies: {
    environment?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
) {
  const environment = dependencies.environment ?? process.env;
  const request = dependencies.fetch ?? fetch;
  if (environment.NODE_ENV !== 'production') {
    return {
      accepted: false as const,
      deliveryConfirmed: false as const,
      suppressed: true as const,
    };
  }
  if (!isIdentityEmailDeliveryEnabled(environment)) {
    throw new Error('Identity email delivery is not configured.');
  }
  const locale = isLocale(input.locale) ? input.locale : defaultLocale;
  const copy = EMAIL_COPY[locale][input.kind];
  const response = await request('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${environment.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: environment.MAIL_FROM,
      to: [input.recipient],
      subject: copy.subject,
      text: copy.message(input.code),
    }),
  });
  if (!response.ok) {
    throw new Error('Identity email provider rejected the request.');
  }
  return {
    accepted: true as const,
    deliveryConfirmed: false as const,
    suppressed: false as const,
  };
}
