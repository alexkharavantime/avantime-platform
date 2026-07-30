import { getPrisma } from '@avantime/database';
export type NotificationPreferences = {
  requestCreated: boolean;
  requestUpdated: boolean;
  newMessage: boolean;
  slaAlerts: boolean;
  weeklySummary: boolean;
};
const defaults: NotificationPreferences = {
  requestCreated: true,
  requestUpdated: true,
  newMessage: true,
  slaAlerts: true,
  weeklySummary: false,
};
const demo = new Map<string, NotificationPreferences>();
export async function getNotificationPreferences(userId: string) {
  if (process.env.DATABASE_URL) {
    try {
      const p = await getPrisma();
      if (p)
        return p.notificationPreference.upsert({
          where: { userId },
          update: {},
          create: { userId },
        });
    } catch {
      console.warn('Notification preferences are unavailable.');
      throw new Error('Notification preferences are unavailable.');
    }
  }
  return demo.get(userId) ?? defaults;
}
export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferences,
) {
  if (process.env.DATABASE_URL) {
    try {
      const p = await getPrisma();
      if (p)
        return p.notificationPreference.upsert({
          where: { userId },
          update: input,
          create: { userId, ...input },
        });
    } catch {
      console.warn('Notification preferences are unavailable.');
      throw new Error('Notification preferences are unavailable.');
    }
  }
  demo.set(userId, input);
  return input;
}
