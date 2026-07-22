import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@avantime/database';
import { hashPassword } from './password';
import { recordSystemEvent } from './system-events';

const demoTokens = new Map<string, { email: string; expiresAt: number; used: boolean }>();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = digest(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const user = await prisma?.user.findUnique({ where: { email: normalized } });
      if (prisma && user) await prisma.passwordResetToken.create({ data: { tokenHash, userId: user.id, expiresAt } });
    } catch (error) { console.warn('Cannot persist password reset token.', error); }
  }
  demoTokens.set(tokenHash, { email: normalized, expiresAt: expiresAt.getTime(), used: false });
  await recordSystemEvent({ level: 'INFO', category: 'AUTH', message: 'Запрошено восстановление пароля', actorEmail: normalized });
  return token;
}

export async function resetPassword(token: string, password: string) {
  const tokenHash = digest(token);
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const item = await prisma?.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (prisma && item && !item.usedAt && item.expiresAt > new Date()) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: item.userId }, data: { passwordHash: hashPassword(password) } }),
          prisma.passwordResetToken.update({ where: { id: item.id }, data: { usedAt: new Date() } }),
        ]);
        await recordSystemEvent({ level: 'INFO', category: 'AUTH', message: 'Пароль успешно изменён', actorEmail: item.user.email });
        return true;
      }
    } catch (error) { console.warn('Cannot reset password in database.', error); }
  }
  const demo = demoTokens.get(tokenHash);
  if (!demo || demo.used || demo.expiresAt < Date.now()) return false;
  demo.used = true;
  await recordSystemEvent({ level: 'INFO', category: 'AUTH', message: 'Демонстрационный пароль изменён', actorEmail: demo.email });
  return true;
}
