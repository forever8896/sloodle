import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('home', () => {
  test('the course list shows the demo courses with their progress', async ({ app, screen }) => {
    await app.open('/?demo');
    const courses = screen.getByRole('region', 'Home').getByRole('navigation', 'Courses');

    await expect(courses.getByRole('button', /Read Treble Clef and Play Along\s+1 of 6 mastered, 3 to review/)).toBeVisible();
    await expect(courses.getByRole('button', /Dinner-Table Spanish\s+14 of 22 mastered/)).toBeVisible();
    await expect(courses.getByRole('button', /how engines work\s+Getting started/)).toBeVisible();
  });

  test('the goal composer takes a goal and offers to begin', async ({ app, agent, screen }) => {
    await app.open('/?demo');
    const home = screen.getByRole('region', 'Home');
    await expect(home.getByRole('button', "Let's begin")).toBeDisabled();

    await agent.act('in the Home section, write {goal} as what you want to learn', {
      params: { goal: 'Hold a ten-minute conversation in Spanish on a trip to Mexico' },
    });

    await expect(home.getByRole('textbox', 'What do you want to learn?')).toHaveValue(
      'Hold a ten-minute conversation in Spanish on a trip to Mexico',
    );
    await expect(home.getByRole('button', "Let's begin")).toBeEnabled();
  });
});
