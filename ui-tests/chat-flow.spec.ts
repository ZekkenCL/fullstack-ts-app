import { test, expect } from '@playwright/test';

// Helper to create a unique user each run
function uniqueUser() {
  const rand = Math.random().toString(36).slice(2, 8);
  return { username: `u_${rand}`, password: 'Passw0rd!' };
}

test.describe('Chat basic flow', () => {
  test('two users register, create channel, exchange messages', async ({ page }) => {
    const userA = uniqueUser();
    const userB = uniqueUser();
    const channelName = `ch-${Date.now().toString(36).slice(-4)}`;

    // Register first user (auto logged in)
    await page.goto('/register');
    await page.getByPlaceholder('Username').fill(userA.username);
    await page.getByPlaceholder('Password').fill(userA.password);
    await page.getByRole('button', { name: /crear/i }).click();
    await page.waitForURL('**/channels');

    // Create a channel
  await page.getByPlaceholder('Nuevo canal').fill(channelName);
  await page.getByRole('button', { name: 'Crear' }).click();
  // Click channel list item (exact match to avoid substring collisions)
  await page.getByRole('button', { name: channelName, exact: true }).click();

  // Send a message
    const firstMessage = 'Hola desde A';
    await page.getByPlaceholder('Escribe un mensaje').fill(firstMessage);
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(firstMessage)).toBeVisible();

    // Open new context for user B
    const pageB = await page.context().newPage();
    await pageB.goto('/register');
    await pageB.getByPlaceholder('Username').fill(userB.username);
    await pageB.getByPlaceholder('Password').fill(userB.password);
    await pageB.getByRole('button', { name: /crear/i }).click();
    await pageB.waitForURL('**/channels');

    // Join channel created by A
  await pageB.getByRole('button', { name: channelName, exact: true }).click();

    // User B sends message
    const reply = 'Hola A, soy B';
    await pageB.getByPlaceholder('Escribe un mensaje').fill(reply);
    await pageB.getByRole('button', { name: 'Enviar' }).click();
    await expect(pageB.getByText(reply)).toBeVisible();
    // Validate on user B side that first user's message is present (history) and reply is sent
    await expect(pageB.getByText(firstMessage)).toBeVisible();
    // Test ends here (cross-tab delivery to user A already covered by backend e2e WS tests)
  });
});
