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
        where: { id: session.userId },
        include: {
          memberships: {
            where: { companyId: session.companyId, active: true, status: 'ACTIVE' },
            include: { company: true },
            take: 1,
          },
        },
      });
      const membership = user?.memberships[0];
      if (
        user &&
        membership &&
        user.active &&
        user.email.toLowerCase() === session.email.toLowerCase()
      ) {
        return {
          name: user.name,
          email: user.email,
          phone: user.phone ?? '',
          jobTitle: user.jobTitle ?? '',
          companyName: membership.company.name ?? session.company,
          registrationNumber: membership.company.registrationNumber ?? '',
          address: membership.company.address ?? '',
        };
      }
    } catch {
      console.warn('Cannot load account profile from database.');
      return {
        name: session.name,
        email: session.email,
        phone: '',
        jobTitle: '',
        companyName: session.company,
        registrationNumber: '',
        address: '',
      };
    }
  }
  return session.role === 'ADMIN'
    ? {
        ...demoProfile,
        name: 'Администратор Avantime',
        email: session.email,
        companyName: 'Avantime',
      }
    : demoProfile;
}

export async function updateAccountProfile(
  session: AppSession,
  input: AccountProfile,
  options: { allowCompanyUpdate?: boolean } = {},
) {
  if (process.env.DATABASE_URL) {
    const prisma = await getPrisma();
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: {
          memberships: {
            where: { companyId: session.companyId, active: true, status: 'ACTIVE' },
            select: { companyId: true },
            take: 1,
          },
        },
      });
      if (
        user?.active &&
        user.email.toLowerCase() === session.email.toLowerCase() &&
        user.memberships[0]?.companyId === session.companyId
      ) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: {
              name: input.name,
              phone: input.phone || null,
              jobTitle: input.jobTitle || null,
            },
          }),
          ...(options.allowCompanyUpdate && session.companyId
            ? [
                prisma.company.update({
                  where: { id: session.companyId },
                  data: {
                    name: input.companyName,
                    registrationNumber: input.registrationNumber || null,
                    address: input.address || null,
                  },
                }),
              ]
            : []),
        ]);
        return input;
      } else {
        throw new Error('Account membership is no longer valid.');
      }
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Account storage is unavailable.');
  }
  Object.assign(demoProfile, input);
  return input;
}
