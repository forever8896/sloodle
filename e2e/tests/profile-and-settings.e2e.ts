import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { openSettled } from '../support/settled';

describe('you and Sloo', () => {
  test('the profile shows how Sloo teaches, with a lock on each dial', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?demo');

    await agent.act('in the Home section, open "You and Sloo" and show what Sloo keeps about how it teaches');

    const dialog = screen.getByRole('dialog', 'You and Sloo');
    await expect(dialog.getByRole('heading', 'How Sloo teaches you')).toBeVisible();
    for (const dial of ['Explanations', 'Pace', 'Challenge', 'Hints']) {
      await expect(dialog.getByRole('radiogroup', dial)).toBeVisible();
    }
    await expect(dialog.getByRole('button', 'Locked')).toHaveCount(4);
  });

  test('choosing a teaching dial yourself locks it, and it can be unlocked', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?demo');
    const dialog = screen.getByRole('dialog', 'You and Sloo');
    // The dials are Explanations, Pace, Challenge and Hints, each followed by its Locked toggle.
    const paceLock = dialog.getByRole('button', 'Locked').nth(1);

    await agent.act('in the Home section, open "You and Sloo" and show what Sloo keeps about how it teaches');
    await expect(paceLock).toHaveAttribute('aria-pressed', 'false');

    await agent.act('set the Pace dial to brisk');
    await expect(dialog.getByRole('radiogroup', 'Pace').getByRole('radio', 'brisk')).toBeChecked();
    await expect(paceLock).toHaveAttribute('aria-pressed', 'true');

    await agent.act('unlock the Pace dial');

    await expect(paceLock).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByRole('radiogroup', 'Pace').getByRole('radio', 'brisk')).toBeChecked();
  });
});

describe('settings', () => {
  test('appearance switches to dark and sounds switch off', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?demo');
    const dialog = screen.getByRole('dialog', 'Settings');

    await agent.act('in the Home section, open Settings and switch the appearance to dark');
    await expect(dialog.getByRole('radio', 'Dark')).toBeChecked();

    await agent.act('turn off sounds in Settings');

    await expect(dialog.getByRole('switch', 'Play sounds')).not.toBeChecked();
    await expect(dialog.getByRole('slider', 'Sound volume')).toBeDisabled();
    expect(await browser.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
  });
});
