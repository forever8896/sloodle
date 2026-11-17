import { readFile } from 'node:fs/promises';
import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('course', () => {
  test('opening a course shows its path of modules, lessons and progress', async ({ app, agent, screen }) => {
    await app.open('/?demo');
    const home = screen.getByRole('region', 'Home');

    await agent.act('in the Home section, open the course "Read Treble Clef and Play Along"');

    const main = home.getByRole('main');
    await expect(main.getByRole('heading', 'Read Treble Clef and Play Along', { level: 1 })).toBeVisible();
    await expect(main.getByRole('progressbar', 'Skills in bloom')).toBeVisible();
    await expect(main.getByRole('heading', 'The staff and its anchors')).toBeVisible();
    await expect(main.getByRole('heading', 'From the page to the keys')).toBeVisible();
    await expect(main.getByRole('button', 'Start a session')).toBeVisible();
  });

  test('a course can be shared as a file', async ({ app, agent, screen, browser }) => {
    await app.open('/?demo');
    const course = screen.getByRole('region', 'Course');

    const file = await browser.waitForDownload(() => agent.act('in the Course section, share this course as a file'));

    await expect(course.getByRole('status')).toHaveText('Downloaded read-treble-clef-and-play-along.sloodle.json.');
    const shared = JSON.parse(await readFile(file.absolutePath, 'utf8'));
    expect(shared.format).toBe('sloodle.course');
  });
});
