import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('first run', () => {
  test('Sloo welcomes a new learner and the welcome ends on Home', async ({ app, agent, screen }) => {
    await app.open('/?demo&onboarding');
    await expect(screen.getByText("Hi! I'm Sloo. I'll be your tutor.")).toBeVisible();
    await expect(screen.getByRole('heading', 'Learn anything, at your own pace')).toBeVisible();

    await agent.act('say hi to Sloo');
    await expect(screen.getByRole('heading', 'What should I call you?')).toBeVisible();

    await agent.act('tell Sloo your name is {name}', { params: { name: 'Ada' } });
    await expect(screen.getByText('Nice to meet you, Ada. How do you like to learn?')).toBeVisible();

    await agent.act('choose "Pictures and diagrams" as a way you like to learn, then continue');
    await expect(screen.getByRole('heading', 'Voice and sound')).toBeVisible();

    await agent.act('keep the voice and sound choices as they are and continue to the next step');
    await expect(screen.getByRole('heading', 'What powers Sloo')).toBeVisible();

    await agent.act('keep the Claude Code login and continue');
    await expect(screen.getByRole('textbox', 'What do you want to learn?')).toBeVisible();

    await agent.act('finish the welcome without picking a subject yet');

    await expect(screen.getByRole('navigation', 'Courses')).toBeVisible();
    await expect(screen.getByRole('button', "Let's begin")).toBeDisabled();
  });
});
