import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Kết nối thành công đến RDS PostgreSQL!');
  } catch (error) {
    console.error('❌ Kết nối thất bại:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();