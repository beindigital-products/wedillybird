import { chromium } from 'playwright-core';
const handles = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', viewport: { width: 1280, height: 900 } });
for (const h of handles) {
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(`https://www.tiktok.com/@${h}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => {
      const el = document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      let scope = null;
      if (el) { try { const j = JSON.parse(el.textContent); scope = j.__DEFAULT_SCOPE__?.['webapp.user-detail'] ?? null; } catch (e) {} }
      return { title: document.title, hasData: !!el, scope: scope && { status: scope.statusCode, user: scope.userInfo?.user && { uniqueId: scope.userInfo.user.uniqueId, nickname: scope.userInfo.user.nickname, signature: scope.userInfo.user.signature, verified: scope.userInfo.user.verified }, stats: scope.userInfo?.stats }, body: document.body.innerText.slice(0, 300) };
    });
    console.log(h, resp?.status(), JSON.stringify(info));
  } catch (e) { console.log(h, 'ERR', String(e).slice(0, 200)); }
  await page.close();
}
await browser.close();
