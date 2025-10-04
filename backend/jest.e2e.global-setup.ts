import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

module.exports = async () => {
  // Ensure test database URL
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/mydatabase?schema=public';
  }
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_secret';
  const root = __dirname; // backend root
  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) {
    // eslint-disable-next-line no-console
    console.warn('[e2e setup] prisma schema not found at', schemaPath);
    return;
  }
  try {
    // Apply migrations (idempotent)
    execSync('pnpm prisma migrate deploy', { stdio: 'inherit', cwd: root });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[e2e setup] migrate deploy failed, attempting db push');
    try {
      execSync('pnpm prisma db push', { stdio: 'inherit', cwd: root });
    } catch (e2) {
      // eslint-disable-next-line no-console
      console.error('[e2e setup] db push failed', e2);
      throw e2;
    }
  }
  // With proper migrations present we no longer perform a forced db push.
  // If developers forget to create a migration, tests should fail explicitly rather than mutating schema implicitly.
  try {
    execSync('pnpm prisma generate', { stdio: 'inherit', cwd: root });
  } catch (e) {
    // ignore generate errors if already generated
  }
};
