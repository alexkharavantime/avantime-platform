import { PrismaClient } from '@prisma/client';
import { pbkdf2Sync } from 'node:crypto';

const prisma = new PrismaClient();

function passwordHash(password: string, salt: string) {
  const iterations = 210_000;
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${digest}`;
}

async function main() {
  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: { registrationNumber: '40000000000', address: 'Рига, Латвия' },
    create: {
      id: 'demo-company',
      name: 'Demo Company',
      registrationNumber: '40000000000',
      address: 'Рига, Латвия',
    },
  });

  const user = await prisma.user.upsert({
    where: { id: 'demo-user' },
    update: {
      name: 'Demo Client',
      companyId: company.id,
      passwordHash: null,
      phone: '+371 2000 0000',
      jobTitle: 'Руководитель',
    },
    create: {
      id: 'demo-user',
      email: 'demo@avantime.lv',
      emailNormalized: 'demo@avantime.lv',
      name: 'Demo Client',
      companyId: company.id,
      phone: '+371 2000 0000',
      jobTitle: 'Руководитель',
    },
  });

  await prisma.organizationMembership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    update: { active: true, role: 'CLIENT' },
    create: { userId: user.id, companyId: company.id, role: 'CLIENT' },
  });
  await prisma.userCredential.upsert({
    where: { userId_kind: { userId: user.id, kind: 'PASSWORD' } },
    update: { passwordHash: passwordHash('avantime', 'demo-client-salt') },
    create: {
      userId: user.id,
      kind: 'PASSWORD',
      identifierNormalized: 'demo@avantime.lv',
      passwordHash: passwordHash('avantime', 'demo-client-salt'),
    },
  });

  const admin = await prisma.user.upsert({
    where: { id: 'demo-admin' },
    update: { role: 'ADMIN', passwordHash: null },
    create: {
      id: 'demo-admin',
      email: 'admin@avantime.lv',
      emailNormalized: 'admin@avantime.lv',
      name: 'Администратор Avantime',
      role: 'ADMIN',
    },
  });
  await prisma.userCredential.upsert({
    where: { userId_kind: { userId: admin.id, kind: 'PASSWORD' } },
    update: { passwordHash: passwordHash('admin', 'demo-admin-salt') },
    create: {
      userId: admin.id,
      kind: 'PASSWORD',
      identifierNormalized: 'admin@avantime.lv',
      passwordHash: passwordHash('admin', 'demo-admin-salt'),
    },
  });

  const count = await prisma.supportRequest.count();
  if (count === 0) {
    await prisma.supportRequest.create({
      data: {
        publicId: 'AV-1042',
        title: 'Обмен заказами с интернет-магазином',
        description: 'Необходимо проверить задержку обмена заказами между сайтом и 1С.',
        category: 'Интеграция',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        jiraKey: 'SUP-1042',
        requesterId: user.id,
        companyId: company.id,
        messages: {
          create: [
            { body: 'Обращение принято в работу.', authorId: user.id },
            { body: 'Подготовлены журналы обмена за последние сутки.', authorId: user.id },
          ],
        },
      },
    });
  }
}

main().finally(() => prisma.$disconnect());
