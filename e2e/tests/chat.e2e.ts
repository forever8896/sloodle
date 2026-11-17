import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('chat with Sloo', () => {
  test('a proposed course change shows Now and After, and accepting it applies it', async ({ app, agent, screen }) => {
    await app.open('/?demo');
    const chat = screen.getByRole('region', 'Chat with Sloo');
    const proposal = chat.getByRole('article', 'Proposed change to Read Treble Clef and Play Along');
    await expect(proposal.getByRole('region', 'Now')).toBeVisible();
    await expect(proposal.getByRole('region', 'After')).toContainText('Can play a note the moment it is named, with eyes on the page.');

    await agent.act('in the Chat with Sloo section, accept the change Sloo proposed to the course');

    await expect(proposal.getByRole('status')).toContainText('Accepted. The course is updated.');
    await expect(proposal.getByRole('button', 'Accept change')).toBeHidden();
  });
});
