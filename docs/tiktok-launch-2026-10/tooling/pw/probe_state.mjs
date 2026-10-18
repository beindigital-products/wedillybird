import { chromium } from 'playwright-core';
const [state, url, ...exprs] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ storageState: state, viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-US' });
await ctx.addCookies([{ name: 'wbb_locale_suggestion_dismissed', value: '1', url: new URL(url).origin }]);
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await p.waitForTimeout(1500);
for (const e of exprs) { try { console.log(JSON.stringify(await p.evaluate(e), null, 1)); } catch (err) { console.log('ERR', err.message); } }
await b.close();
