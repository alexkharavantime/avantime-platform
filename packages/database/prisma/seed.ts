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
    create: { id: 'demo-company', name: 'Demo Company', registrationNumber: '40000000000', address: 'Рига, Латвия' },
  });

  const user = await prisma.user.upsert({
    where: { email: 'demo@avantime.lv' },
    update: { name: 'Demo Client', companyId: company.id, passwordHash: passwordHash('avantime', 'demo-client-salt'), phone: '+371 2000 0000', jobTitle: 'Руководитель' },
    create: {
      id: 'demo-user',
      email: 'demo@avantime.lv',
      name: 'Demo Client',
      companyId: company.id,
      passwordHash: passwordHash('avantime', 'demo-client-salt'),
      phone: '+371 2000 0000',
      jobTitle: 'Руководитель',
    },
  });


  await prisma.user.upsert({
    where: { email: 'admin@avantime.lv' },
    update: { role: 'ADMIN', passwordHash: passwordHash('admin', 'demo-admin-salt') },
    create: {
      id: 'demo-admin',
      email: 'admin@avantime.lv',
      name: 'Администратор Avantime',
      role: 'ADMIN',
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
