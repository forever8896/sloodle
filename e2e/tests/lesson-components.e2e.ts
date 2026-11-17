import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

// /?blocks is the development gallery of every lesson component. The first card of each
// section is answerable and graded by the engine's own code, running in the page.
describe('lesson components', () => {
  test('a flashcard flips and takes a recall rating', async ({ app, agent, screen }) => {
    await app.open('/?blocks');
    const card = screen.getByRole('region', 'Flashcard').getByRole('region', 'Flashcard').first();

    await agent.act('flip the flashcard, then rate your recall as Good');

    await expect(card).toContainText('FACE');
    await expect(card.getByRole('status')).toHaveText('You rated it: Good');
  });

  test('notes put in order from lowest to highest are graded correct', async ({ app, agent, screen }) => {
    await app.open('/?blocks');
    const exercise = screen
      .getByRole('region', 'Ordering')
      .getByRole('form', 'Put these notes in order from lowest to highest on the treble staff.')
      .first();

    await agent.act('in the Ordering section, put the notes in order from lowest to highest on the treble staff and check the order');

    await expect(exercise.getByRole('list', 'Your order')).toBeVisible();
    await expect(exercise.getByRole('status')).toHaveText('Correct!');
  });

  test('matching each staff line to its note is graded correct', async ({ app, agent, screen }) => {
    await app.open('/?blocks');
    const exercise = screen
      .getByRole('region', 'Matching')
      .getByRole('form', 'Match each line of the treble staff with the note that sits on it.')
      .first();

    await agent.act('in the Matching section, match each line of the treble staff with its note and check the matches');

    await expect(exercise.getByRole('status')).toHaveText('Correct!');
  });

  test('the JavaScript sample runs in its sandbox and prints its output', async ({ app, agent, screen }) => {
    await app.open('/?blocks');
    const sample = screen.getByRole('region', 'Code').getByRole('figure', 'Arrays count from 0, staff lines from 1: notice the n - 1.');

    await agent.act('run the JavaScript code sample "Lines to note names"');

    await expect(sample.getByRole('log', 'Output')).toHaveText('Line 1: E Line 2: G Line 3: B Line 4: D Line 5: F');
  });

  test('a picture opens enlarged with its credit', async ({ app, agent, screen }) => {
    await app.open('/?blocks');

    await agent.act('in the Picture section, enlarge the picture of the Mona Lisa');

    const enlarged = screen.getByRole('dialog', 'A face that is hard to read');
    await expect(enlarged.getByRole('img', /^The Mona Lisa/)).toBeVisible();
    await expect(enlarged).toContainText('by Leonardo da Vinci, Public domain');
    await expect(enlarged.getByRole('link', 'Wikimedia Commons')).toBeVisible();
  });

  // No agent step: the flowchart renders from its Mermaid source with a text description.
  test('a diagram renders as a described flowchart', async ({ app, screen }) => {
    await app.open('/?blocks');
    const diagram = screen.getByRole('region', 'Diagram').getByRole('figure', 'Two questions name any note on the staff.').first();

    await expect(diagram.getByRole('img', /^Flowchart: Find the note head\./)).toBeVisible();
    await expect(diagram.getByRole('heading', 'Naming a note')).toBeVisible();
  });
});
