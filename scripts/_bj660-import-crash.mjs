// 一次性（BJ660 件1）：用户 .wld 导入全链真机复现——window 错误收集 + 储蓄面板面。
// 走法：标题→单人→(建角)→世界列表→导入 .wld→进入世界→跑帧 8s→开背包→收错误。
import { HOME, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const WLD = process.env.BJ660_WLD
  ?? needInput(join(HOME, 'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-10/十周年纪念种子(2).wld'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, userDataDir: '/tmp/sw-pptr-bj660' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push({ kind: 'pageerror', msg: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') }));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push({ kind: 'console.error', msg: m.text().slice(0, 500) });
});
await page.evaluateOnNewDocument(() => {
  window.__swErrors = [];
  window.addEventListener('error', (ev) => {
    window.__swErrors.push({ kind: 'window.error', msg: String(ev.message), file: String(ev.filename ?? ''), line: ev.lineno, stack: String(ev.error?.stack ?? '').split('\n').slice(0, 6).join('\n') });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    window.__swErrors.push({ kind: 'unhandledrejection', msg: String(ev.reason?.message ?? ev.reason), stack: String(ev.reason?.stack ?? '').split('\n').slice(0, 6).join('\n') });
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('sw-boot-prime') && !document.getElementById('sw-splash'), { timeout: 240000, polling: 500 });
await sleep(800);

// ---- 单人 → 角色（空则建角）----
await page.click('[data-act=sp]');
await sleep(600);
let charRows = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length).catch(() => 0);
if (!charRows) {
  await page.click('[data-act=new]');
  await page.waitForSelector('[data-act=create]', { timeout: 10000 });
  await sleep(400);
  await page.click('[data-act=create]');
  await sleep(800);
  charRows = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length).catch(() => 0);
}
await page.click('.sw-vsel-list .sw-vitem');
await page.waitForSelector('[data-act=import]', { timeout: 10000 });
await sleep(400);

// ---- 导入 .wld ----
const rows0 = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length);
const wldInput = await page.$('.sw-vsel input[type=file]');
await wldInput.uploadFile(WLD);
await page.waitForFunction((n) => document.querySelectorAll('.sw-vsel-list .sw-vitem').length > n, { timeout: 120000, polling: 500 }, rows0);
await sleep(500);
const importedName = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.map((x) => x.textContent?.trim().slice(0, 40)));
const rows = await page.$$('.sw-vsel-list .sw-vitem');
await rows[rows.length - 1].click();   // 点导入的行 = onPlay → 进世界
const out = { importedName, errorsBefore: errors.length };

// ---- 等进世界（进度条消失 + 画布游戏态）----
try {
  await page.waitForFunction(() => {
    const prog = document.querySelector('.sw-progress');
    return !prog || prog.style.display === 'none';
  }, { timeout: 300000, polling: 1000 });
} catch { out.progressTimeout = true; }
await sleep(8000);   // 跑帧
// 开背包（Esc）强制 layoutVanilla/paintVanillaInvSlots
await page.keyboard.press('Escape');
await sleep(2500);
await page.keyboard.press('Escape');
await sleep(2000);

out.inGame = await page.evaluate(() => !!(document.querySelector('canvas') && document.querySelector('.sw-hud, .sw-hotbar, .sw-vinv, #sw-ui')));
out.vinv = await page.evaluate(() => !!document.querySelector('.sw-vinv'));
// 储蓄面板 DOM 面（vinvSavingsEl 类名探查）
out.savingsDom = await page.evaluate(() => {
  const v = document.querySelector('.sw-vinv');
  return { hasVinv: !!v, childCount: v ? v.querySelectorAll('*').length : -1 };
});
out.bankSnapshot = await page.evaluate(() => {
  const g = window.__swGame ?? window.__game ?? (window.__swFlow && window.__swFlow.game);
  try {
    const p = g && g.player;
    return { hasGame: !!g, hasPlayer: !!p, hasBanks: !!p?.banks, bankLens: p?.banks?.map((b) => b?.length ?? -1) ?? null };
  } catch (e) { return { err: String(e) }; }
});
out.errors = errors.concat(await page.evaluate(() => window.__swErrors ?? []));
out.errorCount = out.errors.length;
console.log(JSON.stringify(out, null, 1).slice(0, 12000));
await page.screenshot({ path: '/tmp/bj660-import-final.png' });
await browser.close();
