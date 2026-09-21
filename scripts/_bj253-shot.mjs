// BJ253 视觉快照:弹生成在玩家视口内(上方 6 格),1.5s(淡入完成+喷币期)与
// 3.6s(收缩淡出期)各截一帧,验证 GetAlpha 0.392 半透观感+帧推进+收缩。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ } });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp menu failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  void window.__swLoadJson(t).catch(() => {});
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
}, mapText);
await page.waitForFunction(() => window.__swGame?.world && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(async () => {
  const g = window.__swGame;
  const { CoinPortalProj } = await import('/src/entities/CoinPortalProj.ts');
  // 玩家上方 6 格空中(视口中心附近)
  const p = new CoinPortalProj(g.player.cx - 40, g.player.cy - 40);
  g.entities.add(p, 'projectiles');
});
await new Promise((r) => setTimeout(r, 1100));
let shot = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
(await import('node:fs')).writeFileSync('/tmp/bj253-visual-fadein.png', Buffer.from(shot.split(',')[1], 'base64'));
await new Promise((r) => setTimeout(r, 2100));
shot = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
(await import('node:fs')).writeFileSync('/tmp/bj253-visual-fadeout.png', Buffer.from(shot.split(',')[1], 'base64'));
console.log('[probe] shots saved: /tmp/bj253-visual-fadein.png /tmp/bj253-visual-fadeout.png');
await browser.close().catch(() => {});
process.exit(0);
