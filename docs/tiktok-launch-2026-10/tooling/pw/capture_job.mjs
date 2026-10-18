// Scripted 1080x1920 capture of a mobile web page via CDP screencast (viewport 360x640 @ DPR 3).
// usage: node capture_job.mjs <job.json> <out.mp4>
// job: { url, early?: bool, cookies?: [{name,value,url}], localStorage?: {k:v}, w?, h?, dpr?, tail?,
//        route?: {pattern, file}, steps: [ ... ] }
// steps: {wait:ms} {tap:sel} {click:sel} {type:[sel,text,delayMs]} {fill:[sel,text]} {press:key}
//        {smoothScroll:[y,ms]} {scrollTo:[sel,ms]} {eval:js} {goto:url} {text:"label"} (taps getByText)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const [jobPath, out] = process.argv.slice(2);
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const W = job.w ?? 360, H = job.h ?? 640, DPR = job.dpr ?? 3, TAIL = job.tail ?? 1.0;
const work = resolve(out + '_frames');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const browser = await chromium.launch({
  executablePath: (process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'),
  args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
  locale: 'en-US', timezoneId: 'America/New_York', colorScheme: 'light',
  ...(job.storageState ? { storageState: job.storageState } : {}),
  ...(job.offlineAtStart ? { offline: true } : {}),
});
if (job.cookies) await ctx.addCookies(job.cookies);
if (job.localStorage) {
  await ctx.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch (e) {} }, job.localStorage);
}
if (job.sanitize) {
  await ctx.addInitScript((cfg) => {
    const climbCard = (el) => {
      let cur = el;
      for (let i = 0; i < 12 && cur && cur !== document.body; i++) {
        const cs = getComputedStyle(cur);
        const r = parseFloat(cs.borderTopLeftRadius) || 0;
        if (r >= 14 && (cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0)) return cur;
        cur = cur.parentElement;
      }
      return el;
    };
    const apply = () => {
      if (!document.body) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const o = n.nodeValue;
        if (!o || !o.trim()) continue;
        let t = o;
        for (const [k, v] of Object.entries(cfg.names || {})) if (t.includes(k)) t = t.split(k).join(v);
        for (const [re, rep] of cfg.regex || []) t = t.replace(new RegExp(re, 'g'), rep);
        if (t !== o) n.nodeValue = t;
      }
      for (const txt of cfg.hideText || []) {
        const needle = txt.toLowerCase();
        const hits = [...document.querySelectorAll('div, section, p, span, h2, h3, h4')].filter((e) => e.children.length < 4 && (e.textContent || '').toLowerCase().includes(needle) && (e.textContent || '').length < txt.length + 60);
        for (const h of hits) { const c = climbCard(h); if (c && c !== document.body) c.style.setProperty('display', 'none', 'important'); }
      }
      for (const re of cfg.hideRegex || []) {
        const rx = new RegExp(re, 'i');
        document.querySelectorAll('span, p, div, li').forEach((e) => { if (e.children.length <= 3 && rx.test((e.textContent || '').trim()) && (e.textContent || '').length < 60) e.style.setProperty('display', 'none', 'important'); });
      }
      for (const sel of cfg.hideSelectors || []) document.querySelectorAll(sel).forEach((e) => e.style.setProperty('display', 'none', 'important'));
      if (cfg.hideFloating) {
        document.querySelectorAll('button, a, div').forEach((e) => {
          const cs = getComputedStyle(e);
          if (cs.position !== 'fixed') return;
          const r = e.getBoundingClientRect();
          if (r.width < 90 && r.height < 90 && r.bottom > innerHeight * 0.6 && r.right > innerWidth * 0.6) e.style.setProperty('display', 'none', 'important');
        });
      }
      document.querySelectorAll('input').forEach((i) => {
        if (i.type === 'tel' && i.value) i.style.setProperty('filter', 'blur(4px)');
      });
    };
    const start = () => { apply(); new MutationObserver(apply).observe(document.documentElement, { subtree: true, childList: true, characterData: true }); setInterval(apply, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }, job.sanitize);
}
if (job.routeDir) {
  const { readdirSync, existsSync } = await import('node:fs');
  const files = readdirSync(job.routeDir.dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  await ctx.route(new RegExp(job.routeDir.pattern), (r) => {
    const u = new URL(r.request().url());
    const base = decodeURIComponent(u.pathname.split('/').pop() || '');
    const direct = `${job.routeDir.dir}/${base.replace(/\.webp$/, '.jpg')}`;
    if (existsSync(direct) && /^g\d+/.test(base)) return r.fulfill({ path: direct, contentType: 'image/jpeg' });
    let h = 0; for (const ch of u.pathname) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return r.fulfill({ path: `${job.routeDir.dir}/${files[h % files.length]}`, contentType: 'image/jpeg' });
  });
}
if (job.route) {
  await ctx.route(new RegExp(job.route.pattern), (r) => r.fulfill({ path: job.route.file }));
}
await ctx.addInitScript((extra) => {
  const css = '*{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important} ::selection{background:transparent!important}' + (extra || '');
  const add = () => { const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
}, job.css || '');
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, data });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
});
const start = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });

if (job.early) {
  await start();
  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
} else {
  await page.goto(job.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await start();
}
await page.waitForTimeout(400);

const smooth = (y, ms) => page.evaluate(([y, ms]) => new Promise((res) => {
  const y0 = window.scrollY, t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const step = (now) => {
    const p = Math.min((now - t0) / ms, 1);
    window.scrollTo(0, y0 + (y - y0) * ease(p));
    p < 1 ? requestAnimationFrame(step) : res();
  };
  requestAnimationFrame(step);
}), [y, ms]);

const marks = {};
const apiCall = async (body) => {
  const r = await fetch('http://127.0.0.1:3210/__test__/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
};
for (const s of job.steps ?? []) {
  if (s.mark) marks[s.mark] = Date.now() / 1000;
  else if (s.api) await apiCall(s.api);
  else if (s.shot) await page.screenshot({ path: s.shot });
  else if (s.wait != null) await page.waitForTimeout(s.wait);
  else if (s.tap) await page.tap(s.tap);
  else if (s.click) await page.click(s.click);
  else if (s.text) await page.getByText(s.text, { exact: false }).first().tap();
  else if (s.type) await page.locator(s.type[0]).first().pressSequentially(s.type[1], { delay: s.type[2] ?? 70 });
  else if (s.fill) await page.fill(s.fill[0], s.fill[1]);
  else if (s.press) await page.keyboard.press(s.press);
  else if (s.smoothScroll) await smooth(s.smoothScroll[0], s.smoothScroll[1]);
  else if (s.scrollTo) {
    const y = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top + window.scrollY - 120 : 0; }, s.scrollTo[0]);
    await smooth(y, s.scrollTo[1] ?? 1200);
  }
  else if (s.scrollToText) {
    const y = await page.evaluate(([t, off]) => { const el = [...document.querySelectorAll('h1,h2,h3,p,span,div,legend,label')].find((e) => e.children.length < 3 && (e.textContent || '').trim().startsWith(t)); return el ? el.getBoundingClientRect().top + window.scrollY + off : 0; }, [s.scrollToText[0], s.scrollToText[2] ?? -80]);
    await smooth(Math.max(0, y), s.scrollToText[1] ?? 1500);
  }
  else if (s.eval) await page.evaluate(s.eval);
  else if (s.goto) await page.goto(s.goto, { waitUntil: 'networkidle' });
  else if (s.reload) await page.reload({ waitUntil: 'networkidle' });
  else if (s.offline != null) await ctx.setOffline(!!s.offline);
  else if (s.tapXY) await page.touchscreen.tap(s.tapXY[0], s.tapXY[1]);
  else if (s.scrollSel) {
    const [sel, top, ms = 900] = s.scrollSel;
    const y = await page.locator(sel).first().evaluate((el, t) => el.getBoundingClientRect().top + window.scrollY - t, top);
    await smooth(Math.max(0, y), ms);
  }
  else if (s.drag) {
    const [a, b, ms = 900] = s.drag;
    const A = await page.locator(a).first().boundingBox();
    const B = await page.locator(b).first().boundingBox();
    if (A && B) {
      const ax = A.x + 44, ay = A.y + A.height / 2;
      const bx = B.x + B.width / 2, by = Math.min(Math.max(B.y + Math.min(B.height / 2, 90), 80), H - 80);
      await page.mouse.move(ax, ay);
      await page.mouse.down();
      await page.mouse.move(ax + 8, ay + 8, { steps: 3 });
      const n = Math.max(12, Math.round(ms / 16));
      for (let i = 1; i <= n; i++) {
        const k = i / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        await page.mouse.move(ax + (bx - ax) * e, ay + (by - ay) * e);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(350);
      await page.mouse.up();
    }
  }
  else if (s.dragBy) {
    const [sel, dx, dy] = s.dragBy;
    const A = await page.locator(sel).first().boundingBox();
    if (A) {
      const cx = A.x + A.width / 2, cy = A.y + A.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      const steps = 18;
      for (let i = 1; i <= steps; i++) { await page.mouse.move(cx + dx * i / steps, cy + dy * i / steps); await page.waitForTimeout(16); }
      await page.mouse.up();
    }
  }
  else if (s.dragFromTo) {
    const [a, b] = s.dragFromTo;
    const A = await page.locator(a).first().boundingBox();
    const B = await page.locator(b).first().boundingBox();
    if (A && B) {
      await page.mouse.move(A.x + A.width / 2, A.y + A.height / 2);
      await page.mouse.down();
      const steps = 14;
      for (let i = 1; i <= steps; i++) await page.mouse.move(A.x + A.width / 2 + ((B.x + B.width / 2) - (A.x + A.width / 2)) * i / steps, A.y + A.height / 2 + ((B.y + B.height / 2) - (A.y + A.height / 2)) * i / steps);
      await page.mouse.up();
    }
  }
}
await page.waitForTimeout(TAIL * 1000);
const stopT = Date.now() / 1000;
await cdp.send('Page.stopScreencast');
await browser.close();

if (frames.length < 2) throw new Error('no frames captured');
{
  const t0 = frames[0].t;
  const rel = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +(v - t0).toFixed(2)]));
  if (Object.keys(rel).length) writeFileSync(out + '.marks.json', JSON.stringify(rel, null, 1));
}
frames.forEach((f, i) => writeFileSync(join(work, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64')));
let list = '';
frames.forEach((f, i) => {
  const dur = i + 1 < frames.length ? frames[i + 1].t - f.t : Math.max(0.05, stopT - f.t);
  list += `file 'f${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(dur, 0.001).toFixed(4)}\n`;
});
list += `file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
writeFileSync(join(work, 'list.txt'), list);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'),
  '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '15', '-preset', 'medium', out]);
rmSync(work, { recursive: true, force: true });
console.log(`captured ${frames.length} frames -> ${out}`);
