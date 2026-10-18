// SW-BJ21:解析用户提供的 .plr(取 skinVariant/外观/装备),并探针该角色实机渲染
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const PLR = needInput(join(DOWNLOADS, '无名角色 (4).plr'));
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5212';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj21-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);
const b64 = readFileSync(PLR).toString('base64');
const parsed = await page.evaluate(async (b) => {
  const m = await import('/src/save/PlrImport.ts');
  const raw = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  try {
    const p = m.parsePlr(raw);
    const top = {};
    for (const k of Object.keys(p)) {
      const v = p[k];
      top[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : v;
    }
    return { top: { skinVariant: p.skinVariant, appearance: p.appearance ?? null, name: p.name, difficulty: p.difficulty, keys: Object.keys(p) } };
  } catch (e) { return { err: String(e).slice(0, 300) }; }
}, b64);
console.log('PLR-PARSED ' + JSON.stringify(parsed));
await browser.close();
