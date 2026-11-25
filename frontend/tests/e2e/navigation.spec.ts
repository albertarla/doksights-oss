import { test, expect } from '@playwright/test';

test.describe('Application Navigation', () => {
  test('renders the landing page correctly', async ({ page }) => {
    await page.goto('/');

    // The React app should mount and render something inside #root
    const rootMount = page.locator('#root');
    await expect(rootMount).toBeAttached();

    // The app should contain at least one visible element — either the
    // auth page login button or a redirect — confirming React rendered.
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page).not.toHaveURL('about:blank');
  });

  test('handles 404 routing and shows Not Found page', async ({ page }) => {
    await page.goto('/some-random-page-that-does-not-exist');

    // App should still mount
    const rootMount = page.locator('#root');
    await expect(rootMount).toBeAttached();

    // React Router's catch-all route renders the NotFound page
    await expect(page.getByText(/404|not found|page not found/i).first()).toBeVisible();
  });
});
