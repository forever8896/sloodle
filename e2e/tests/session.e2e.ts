import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('lesson session', () => {
  test('Sloo teaches in conversation and grades an exercise in the lesson', async ({ app, agent, screen }) => {
    await app.open('/?demo');
    const session = screen.getByRole('region', 'Session with Sloo');
    await expect(session.getByText(/^Welcome back\. Before anything new/)).toBeVisible();
    await expect(session.getByText(/^Correct, and you did it without the mnemonic/)).toBeVisible();

    await agent.act(
      'in the Session with Sloo section, fill in the two missing line names in "The line names" exercise ({first} and {second}) and check the answer',
      { params: { first: 'E', second: 'D' } },
    );

    const exercise = session.getByRole('form', 'Fill in the missing line names.');
    await expect(exercise.getByRole('status')).toHaveText('Correct!');
    await expect(exercise.getByRole('textbox', 'Blank 1 of 2')).toHaveValue('E');
  });

  test('Sloo can read the lesson aloud', async ({ app, agent, screen }) => {
    await app.open('/?demo');
    const session = screen.getByRole('region', 'Session with Sloo');
    await expect(session.getByRole('switch', 'Sloo reads aloud')).not.toBeChecked();

    await agent.act('in the Session with Sloo section, turn on reading aloud');

    await expect(session.getByRole('switch', 'Sloo reads aloud')).toBeChecked();
  });
});
