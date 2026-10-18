// usage: node shots.mjs <state.json> <outdir> <url1> <url2> ...
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [state, outdir, ...urls] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'), args: ['--no-sandbox', '--hide-scrollbars'] });
const ctx = await browser.newContext({ storageState: state, viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York' });
await ctx.addCookies([{ name: 'wbb_locale_suggestion_dismissed', value: '1', url: 'http://localhost:3000' }, { name: 'wbb_ccy', value: 'USD', url: 'http://localhost:3000' }]);
await ctx.addInitScript(() => { try { localStorage.setItem('wedillybird-cookie-consent', 'declined'); } catch (e) {} });
let i = 0;
for (const u of urls) {
  const page = await ctx.newPage();
  const name = String(++i).padStart(2, '0') + '_' + u.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 50);
  try {
    await page.goto(u.startsWith('http') ? u : 'http://localhost:3000' + u, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outdir}/${name}.png` });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(name, page.url().replace('http://localhost:3000', ''), 'h=' + h);
  } catch (e) { console.log(name, 'ERR', String(e).slice(0, 120)); }
  await page.close();
}
await browser.close();
