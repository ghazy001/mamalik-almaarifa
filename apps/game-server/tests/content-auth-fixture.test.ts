import { expect, it } from 'vitest';
import { startAuthFixture } from './support/auth-server.js';
import { CONTENT_ACCOUNTS } from './support/content-accounts.js';

it('shares one local Auth rotation across concurrent refreshes', async () => {
  const fixture = await startAuthFixture({
    accounts: [CONTENT_ACCOUNTS.editor],
  });
  try {
    const request = (grant: string, body: unknown) =>
      fetch(`${fixture.url}/auth/v1/token?grant_type=${grant}`, {
        method: 'POST',
        headers: {
          apikey: fixture.key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const session = (await (
      await request('password', {
        email: CONTENT_ACCOUNTS.editor.email,
        password: CONTENT_ACCOUNTS.editor.password,
      })
    ).json()) as { refresh_token: string };
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request('refresh_token', { refresh_token: session.refresh_token }),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const results = (await Promise.all(
      responses.map((response) => response.json()),
    )) as { refresh_token: string }[];
    expect(new Set(results.map((result) => result.refresh_token)).size).toBe(1);
    expect(fixture.refreshes()).toBe(1);
  } finally {
    await fixture.close();
  }
});
