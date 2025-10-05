import { PrismaClient } from '@prisma/client';

// Trunca todas las tablas de dominio y reinicia los IDs.
// Usa CASCADE para respetar FKs. Se asume que el schema es público y Postgres.
// Si en el futuro agregas más modelos, añádelos aquí.
export async function resetDatabase(prisma?: PrismaClient) {
  const local = prisma ?? new PrismaClient();
  // Orden no necesario con TRUNCATE multiple + CASCADE
  await local.$executeRawUnsafe(
    'TRUNCATE "RefreshToken","ChannelMember","Message","Channel","User" RESTART IDENTITY CASCADE;'
  );
  if (!prisma) await local.$disconnect();
}
