// usage: node login.mjs <email> <out_state.json>
import { chromium } from 'playwright-core';
const [email, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'), args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
await ctx.addCookies([{ name: 'wbb_locale_suggestion_dismissed', value: '1', url: 'http://localhost:3000' }, { name: 'wbb_ccy', value: 'USD', url: 'http://localhost:3000' }]);
await ctx.addInitScript(() => { try { localStorage.setItem('wedillybird-cookie-consent', 'declined'); } catch (e) {} });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/en/sign-in', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'Email' }).click().catch(() => page.getByText('Email', { exact: true }).first().click());
await page.locator('input[type=email]').first().fill(email);
await page.getByRole('button', { name: /send my link/i }).click();
let link = null;
for (let i = 0; i < 20 && !link; i++) {
  await page.waitForTimeout(700);
  const res = await fetch('http://127.0.0.1:3210/__test__/emails');
  const j = await res.json();
  const list = Array.isArray(j) ? j : j.emails ?? [];
  const mine = list.filter((m) => JSON.stringify(m).toLowerCase().includes(email.toLowerCase()));
  const last = mine[mine.length - 1];
  if (last) {
    const blob = JSON.stringify(last);
    const m = blob.match(/https?:\\?\/\\?\/[^"\\\s<>]*(?:magic|verify|token)[^"\\\s<>]*/i) || blob.match(/https?:\/\/localhost:3000[^"\\\s<>]+/);
    if (m) link = m[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (i === 0 && !link) console.log('email shape:', blob.slice(0, 600));
  }
}
console.log('link:', link);
if (!link) { await browser.close(); process.exit(2); }
await page.goto(link, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('landed:', page.url());
await ctx.storageState({ path: out });
await browser.close();
