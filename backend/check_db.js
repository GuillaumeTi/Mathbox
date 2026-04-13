const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const count = await prisma.platformTransaction.count();
    console.log('PlatformTransaction count:', count);
    const first = await prisma.platformTransaction.findFirst();
    console.log('First transaction:', first);
  } catch (err) {
    console.error('Error checking PlatformTransaction:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
