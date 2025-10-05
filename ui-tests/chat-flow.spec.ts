import { test, expect } from '@playwright/test';

// Helper to create a unique user each run
function uniqueUser() {
  const rand = Math.random().toString(36).slice(2, 8);
  return { username: `u_${rand}`, password: 'Passw0rd!' };
}

test.describe('Chat basic flow', () => {
  test('register, create channel, send & receive messages, unread badge', async ({ page }) => {
    const userA = uniqueUser();
    const userB = uniqueUser();
  const channelName = `ch-${Date.now().toString(36).slice(-4)}`;
  const otherChannel = `ch-${(Date.now()+1).toString(36).slice(-4)}`;

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

  // Create a second channel and switch to it so new messages in the first channel become unread
  await page.getByPlaceholder('Nuevo canal').fill(otherChannel);
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByRole('button', { name: otherChannel, exact: true }).click();

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
  // Give a moment for message propagation to first user's background tab
  await pageB.waitForTimeout(900);

  // Switch back to user A page: ensure unread badge appears on list before selecting
    await page.bringToFront();

  // Wait for badge (1 unread)
  // Allow a short delay for WS message to arrive and unread to update
  const unreadBadge = page.getByTestId(`unread-${channelName}`);
  await unreadBadge.waitFor({ state: 'visible', timeout: 8000 });
  const text = await unreadBadge.textContent();
  expect(text).toMatch(/^[1-9][0-9]*$/);

    // Re-select channel to mark read
  await page.getByRole('button', { name: channelName, exact: true }).click();
    await expect(unreadBadge).toHaveCount(0);

    // Confirm reply visible for user A
    await expect(page.getByText(reply)).toBeVisible();
  });
});
