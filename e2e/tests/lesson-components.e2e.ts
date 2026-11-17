import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { openSettled } from '../support/settled';

// /?blocks is the development gallery of every lesson component. The first card of each
// section is answerable and graded by the engine's own code, running in the page.
describe('lesson components', () => {
  test('the JavaScript sample runs in its sandbox and prints its output', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?blocks');
    const sample = screen.getByRole('region', 'Code').getByRole('figure', 'Arrays count from 0, staff lines from 1: notice the n - 1.');

    await agent.act('run the JavaScript code sample "Lines to note names"');

    await expect(sample.getByRole('log', 'Output')).toHaveText('Line 1: E Line 2: G Line 3: B Line 4: D Line 5: F');
  });

  test('a picture opens enlarged with its credit', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?blocks');

    await agent.act('in the Picture section, enlarge the picture of the Mona Lisa');

    const enlarged = screen.getByRole('dialog', 'A face that is hard to read');
    await expect(enlarged.getByRole('img', /^The Mona Lisa/)).toBeVisible();
    await expect(enlarged).toContainText('by Leonardo da Vinci, Public domain');
    await expect(enlarged.getByRole('link', 'Wikimedia Commons')).toBeVisible();
  });

  // No agent step: the flowchart renders from its Mermaid source with a text description.
  test('a diagram renders as a described flowchart', async ({ app, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?blocks');
    const diagram = screen.getByRole('region', 'Diagram').getByRole('figure', 'Two questions name any note on the staff.').first();

    await expect(diagram.getByRole('img', /^Flowchart: Find the note head\./)).toBeVisible();
    await expect(diagram.getByRole('heading', 'Naming a note')).toBeVisible();
  });
});

// The answerable components inside a lesson, in the "Session with Sloo" section of the demo. They are
// tested there rather than in the ?blocks gallery: the gallery also shows each component's fixed
// states (graded, rated, reordered), so an answer there adds nothing new to the page, and the replay
// cache needs a visible change to know a recorded step reached its outcome.
describe('lesson components in a session', () => {
  test('a flashcard flips and takes a recall rating', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?demo');
    const card = screen.getByRole('region', 'Session with Sloo').getByRole('region', 'Flashcard');

    await agent.act('in the Session with Sloo section, flip the flashcard, then rate your recall as Good');

    await expect(card).toContainText('FACE');
    await expect(card.getByRole('status')).toHaveText('You rated it: Good');
  });

  // No agent step: the items arrive shuffled, and a recorded sequence of moves only fits the order
  // it was recorded against. The moves are worked out here from the order on screen, with the
  // keyboard the component documents (Space to pick up, arrows to move, Space to drop).
  test('notes put in order from lowest to highest are graded correct', async ({ app, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?demo');
    const exercise = screen
      .getByRole('region', 'Session with Sloo')
      .getByRole('form', 'Put these notes in order from lowest to highest on the treble staff.');
    const items = exercise.getByRole('listbox', 'Items to put in order').getByRole('option');
    const lowestToHighest = ['E, on the bottom line', 'F, in the bottom space', 'G, on the second line', 'A, in the second space', 'B, on the middle line'];
    await expect(items).toHaveCount(lowestToHighest.length);

    const shown = async () => Promise.all(lowestToHighest.map((_, index) => items.nth(index).textContent().then((text) => (text ?? '').trim())));
    for (const [target, name] of lowestToHighest.entries()) {
      const at = (await shown()).findIndex((text) => text.endsWith(name));
      if (at === target) continue;
      await items.filter({ hasText: name }).press('Space');
      for (let step = at; step > target; step--) await browser.keyboard.press('ArrowUp');
      await browser.keyboard.press('Space');
      await expect.poll(async () => (await shown()).findIndex((text) => text.endsWith(name))).toBe(target);
    }

    await exercise.getByRole('button', 'Check order').tap();

    await expect(exercise.getByRole('list', 'Your order')).toBeVisible();
    await expect(exercise.getByRole('status')).toHaveText('Correct!');
  });

  test('matching each staff line to its note is graded correct', async ({ app, agent, screen, browser }) => {
    await openSettled({ app, screen, browser }, '/?demo');
    const exercise = screen
      .getByRole('region', 'Session with Sloo')
      .getByRole('form', 'Match each line of the treble staff with the note that sits on it.');

    await agent.act('in the Session with Sloo section, match each line of the treble staff with its note and check the matches');

    await expect(exercise.getByRole('status')).toHaveText('Correct!');
  });
});
