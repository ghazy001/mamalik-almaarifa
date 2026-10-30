import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONTENT_ACCOUNTS } from '../../game-server/tests/support/content-accounts';
test('an ordinary account joins guests, saves its result and keeps provider tokens out of browser storage', async ({
  page,
  browser,
}, info) => {
  const origin = 'http://127.0.0.1:3101';
  expect(
    (
      await page.request.post('/api/play-ticket', {
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post('/api/play-ticket', {
        headers: {
          Origin: 'https://untrusted.example',
          'Content-Type': 'application/json',
        },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('player-signin.png'),
    fullPage: true,
  });
  await page
    .getByLabel('البريد الإلكتروني')
    .fill(CONTENT_ACCOUNTS.ordinary.email);
  await page
    .getByLabel('كلمة المرور', { exact: true })
    .fill(CONTENT_ACCOUNTS.ordinary.password);
  await page
    .getByRole('button', { name: 'دخول إلى المملكة', exact: true })
    .click();
  await expect(page).toHaveURL(/\/online\?account=1$/);
  await expect(page.getByLabel('طريقة الدخول')).toHaveValue('account');
  expect((await page.request.get('/api/content?view=list')).status()).toBe(403);
  await page.getByLabel('اسمك في المباراة').fill('مملكة الحساب');
  await page
    .getByRole('button', { name: 'أنشئ غرفة خاصة', exact: true })
    .click();
  const invite = page.getByLabel('رمز الغرفة', { exact: true });
  await expect(invite).toHaveValue(/^[a-f0-9]{16}$/);
  const code = await invite.inputValue();
  const use = info.project.use;
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        baseURL: origin,
        viewport: use.viewport ?? { width: 1440, height: 1000 },
        isMobile: use.isMobile ?? false,
        hasTouch: use.hasTouch ?? false,
        reducedMotion: use.reducedMotion ?? 'no-preference',
      }),
    ),
  );
  try {
    const guests = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    for (const [index, guest] of guests.entries()) {
      await guest.goto(`/online?room=${code}`);
      await expect(guest.getByLabel('طريقة الدخول')).toHaveValue('guest');
      await guest
        .getByLabel('اسمك في المباراة')
        .fill(`مملكة الضيف ${index + 1}`);
      await guest
        .getByRole('button', { name: 'انضم إلى الغرفة', exact: true })
        .click();
    }
    for (const client of [page, ...guests]) {
      await expect(client.locator('.online-match')).toHaveAttribute(
        'data-phase',
        'LOBBY',
      );
      await client
        .getByRole('button', { name: 'أنا جاهز', exact: true })
        .click();
    }
    await expect(page.locator('.online-match')).toHaveAttribute(
      'data-phase',
      'ATTACK_SELECTION',
    );
    for (const guest of guests)
      await guest
        .getByRole('button', { name: 'مغادرة الغرفة والاستسلام', exact: true })
        .click();
    await expect(page.locator('[data-result-storage="saved"]')).toHaveText(
      'حُفظت نتيجة المباراة على الخادم.',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
      ),
    ).not.toMatch(/access_token|refresh_token|sb-publishable|sb_publishable/);
    expect(await page.content()).not.toContain(CONTENT_ACCOUNTS.ordinary.email);
    await page
      .locator('.match-results')
      .screenshot({ path: info.outputPath('account-result.png') });
    await page.goto('/account');
    await page
      .getByRole('button', { name: 'تسجيل الخروج من هذا المتصفح', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).filter((cookie) =>
            cookie.name.startsWith('mm-auth'),
          ).length,
      )
      .toBe(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
