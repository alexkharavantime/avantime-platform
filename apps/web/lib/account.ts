import { getPrisma } from '@avantime/database';
import type { AppSession } from './session';

export type AccountProfile = {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyName: string;
  registrationNumber: string;
  address: string;
};

const demoProfile: AccountProfile = {
  name: 'Александр',
  email: 'demo@avantime.lv',
  phone: '+371 2000 0000',
  jobTitle: 'Руководитель',
  companyName: 'Demo Company',
  registrationNumber: '40000000000',
  address: 'Рига, Латвия',
};

export async function getAccountProfile(session: AppSession): Promise<AccountProfile> {
  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const user = await prisma?.user.findUnique({
        where: { email: session.email },
        include: { company: true },
      });
      if (user) {
        return {
          name: user.name,
          email: user.email,
          phone: user.phone ?? '',
          jobTitle: user.jobTitle ?? '',
          companyName: user.company?.name ?? session.company,
          registrationNumber: user.company?.registrationNumber ?? '',
          address: user.company?.address ?? '',
        };
      }
    } catch (error) {
      console.warn('Cannot load account profile from database.', error);
    }
  }
  return session.role === 'ADMIN'
    ? { ...demoProfile, name: 'Администратор Avantime', email: session.email, companyName: 'Avantime' }
    : demoProfile;
}

export async function updateAccountProfile(session: AppSession, input: AccountProfile) {
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (prisma) {
      const user = await prisma.user.findUnique({ where: { email: session.email } });
      if (user) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { name: input.name, phone: input.phone || null, jobTitle: input.jobTitle || null },
          }),
          ...(user.companyId
            ? [
                prisma.company.update({
                  where: { id: user.companyId },
                  data: {
                    name: input.companyName,
                    registrationNumber: input.registrationNumber || null,
                    address: input.address || null,
                  },
                }),
              ]
            : []),
        ]);
      }
    }
  }
  Object.assign(demoProfile, input);
  return input;
}
