import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('you and Sloo', () => {
  test('the profile shows how Sloo teaches, with a lock on each dial', async ({ app, agent, screen }) => {
    await app.open('/?demo');

    await agent.act('in the Home section, open "You and Sloo" and show what Sloo keeps about how it teaches');

    const dialog = screen.getByRole('dialog', 'You and Sloo');
    await expect(dialog.getByRole('heading', 'How Sloo teaches you')).toBeVisible();
    for (const dial of ['Explanations', 'Pace', 'Challenge', 'Hints']) {
      await expect(dialog.getByRole('radiogroup', dial)).toBeVisible();
    }
    await expect(dialog.getByRole('button', 'Locked')).toHaveCount(4);
  });
});

describe('settings', () => {
  test('appearance switches to dark and sounds switch off', async ({ app, agent, screen, browser }) => {
    await app.open('/?demo');
    const dialog = screen.getByRole('dialog', 'Settings');

    await agent.act('in the Home section, open Settings and switch the appearance to dark');
    await expect(dialog.getByRole('radio', 'Dark')).toBeChecked();

    await agent.act('turn off sounds in Settings');

    await expect(dialog.getByRole('switch', 'Play sounds')).not.toBeChecked();
    await expect(dialog.getByRole('slider', 'Sound volume')).toBeDisabled();
    expect(await browser.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
  });
});
