const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.systemCalendarObservance.findMany({ orderBy: { startAt: 'asc' } });
  process.stdout.write(JSON.stringify(rows, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
