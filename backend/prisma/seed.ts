import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('[seed] Starting seed...');
  // Create user if not exists
  const username = 'alice';
  // Permitir sobreescritura vía variable de entorno SEED_USER_PASSWORD
  const passwordPlain = process.env.SEED_USER_PASSWORD || 'Secret123';
  const existing = await prisma.user.findUnique({ where: { username } });
  let user;
  if (existing) {
    // Forzar actualización de contraseña para garantizar que coincida con la política actual
    const hash = await argon2.hash(passwordPlain);
    user = await prisma.user.update({ where: { id: existing.id }, data: { password: hash } });
    console.log('[seed] User already exists -> password refreshed');
  } else {
    const hash = await argon2.hash(passwordPlain);
    user = await prisma.user.create({ data: { username, email: 'alice@example.com', password: hash } });
    console.log('[seed] User created');
  }

  // Create channel if not exists
  let channel = await prisma.channel.findFirst({ where: { name: 'general' } });
  if (!channel) {
    channel = await prisma.channel.create({ data: { name: 'general' } });
    console.log('[seed] Channel created');
  } else {
    console.log('[seed] Channel already exists');
  }

  // Ensure membership (as owner) for the user in the channel
  const membership = await prisma.channelMember.findUnique({ where: { userId_channelId: { userId: user.id, channelId: channel.id } } });
  if (!membership) {
    await prisma.channelMember.create({ data: { userId: user.id, channelId: channel.id, role: 'owner' } });
    console.log('[seed] Membership created (owner)');
  } else {
    if (membership.role !== 'owner') {
      await prisma.channelMember.update({ where: { userId_channelId: { userId: user.id, channelId: channel.id } }, data: { role: 'owner' } });
      console.log('[seed] Membership role elevated to owner');
    } else {
      console.log('[seed] Membership already exists');
    }
  }

  // Create a sample message if none
  const existingMsg = await prisma.message.findFirst({ where: { channelId: channel.id } });
  if (!existingMsg) {
    await prisma.message.create({ data: { content: 'Mensaje inicial', channelId: channel.id, senderId: user.id } });
    console.log('[seed] Initial message created');
  } else {
    console.log('[seed] Message already exists');
  }

  console.log(`[seed] Done. Credentials -> username: ${username} / password: ${passwordPlain}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
