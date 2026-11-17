import { expect, type TestFixtures } from 'e2e';
import type { Browser, WebApp } from '@e2e-dev/web';

type Page = Pick<TestFixtures, 'screen'> & { app: WebApp; browser: Browser };

/** Diagrams are drawn after the page loads: each says "Drawing…" and is aria-busy until its picture is in. */
function pending(): number {
  return document.querySelectorAll('[aria-busy="true"]').length + (document.body.innerText.includes('Drawing…') ? 1 : 0);
}

/**
 * Opens a page and waits until it stops changing on its own, before any agent step runs.
 * An agent step records what changed on screen while it acted. On a page still loading, the
 * page's own changes (the lazy gallery appearing, a diagram finishing) end up in that record,
 * and a slower or faster machine then fails the replay because they land at another moment.
 */
export async function openSettled({ app, screen, browser }: Page, path: '/?demo' | '/?blocks'): Promise<void> {
  await app.open(path);
  const landmark = path === '/?blocks' ? screen.getByRole('heading', 'Lesson components') : screen.getByRole('region', 'Chat with Sloo');
  await expect(landmark).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByRole('img', /^Flowchart: Find the note head\./).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => browser.evaluate(pending), { timeout: 30_000, message: 'the page kept drawing diagrams' }).toBe(0);
}
