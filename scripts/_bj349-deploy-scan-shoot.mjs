// BJ349 部署站(方案A前旧域)射击复现:扫描 id 找星星炮(useAmmo 自耗)→弹 pid/vx+截屏
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'https://ab575621.sandboxworld.pages.dev';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
const vw = 1360, vh = 860;
// 第一步:扫描 id 1..900 找"挥出弹"的远程物品(弹药域同扫:先试同 id,再试 75/97/3823 等)
const scan = await page.evaluate(() => {
  const g = window.__swGame;
  const vw = 1360, vh = 860;
  g.input.mouseX = vw - 120; g.input.mouseY = Math.round(vh / 2);
  const found = [];
  for (let id = 1; id <= 900 && found.length < 8; id++) {
    g.player.inv.slots[0] = { id, stack: 1 };
    // 清弹药槽干扰:放 5 槽同 id(自耗弹药如星星炮)
    g.player.inv.slots[5] = { id: 75, stack: 999 };
    g.player.selectedSlot = 0;
    const before = new Set(g.entities.projectiles ?? []);
    g.input.mouseDown = true;
    for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    const nw = [];
    for (const e of (g.entities.projectiles ?? [])) if (!before.has(e)) nw.push({ pid: e.projId, vx: +Number(e.vx ?? 0).toFixed(2), vy: +Number(e.vy ?? 0).toFixed(2) });
    for (const e of (g.entities.projectiles ?? [])) { try { e.dead = true; } catch {} }
    for (let i = 0; i < 6; i++) g.fixedUpdate(1 / 60);
    if (nw.length) found.push({ id, projs: nw.slice(0, 2) });
  }
  return found;
});
console.log('SCAN=' + JSON.stringify(scan));
// 第二步:对命中的每个远程 id,做右/左射击对拍
const pairs = [];
for (const f of scan.slice(0, 4)) {
  const r = await page.evaluate(([id]) => {
    const g = window.__swGame;
    const vw = 1360, vh = 860;
    g.player.inv.slots[0] = { id, stack: 1 };
    g.player.inv.slots[5] = { id: 75, stack: 999 };
    g.player.selectedSlot = 0;
    const res = {};
    for (const side of ['R', 'L']) {
      g.input.mouseX = side === 'R' ? vw - 120 : 120; g.input.mouseY = Math.round(vh / 2);
      const before = new Set(g.entities.projectiles ?? []);
      g.input.mouseDown = true;
      for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
      const nw = [];
      for (const e of (g.entities.projectiles ?? [])) if (!before.has(e)) nw.push({ pid: e.projId, x: +Number(e.x).toFixed(0), vx: +Number(e.vx ?? 0).toFixed(2), vy: +Number(e.vy ?? 0).toFixed(2) });
      for (const e of (g.entities.projectiles ?? [])) { try { e.dead = true; } catch {} }
      for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
      res[side] = { facing: g.player.facing, projs: nw.slice(0, 3) };
    }
    return res;
  }, [f.id]);
  pairs.push({ id: f.id, ...r });
}
console.log('PAIRS=' + JSON.stringify(pairs));
const shot = await page.screenshot({ clip: { x: vw / 2 - 420, y: vh / 2 - 240, width: 840, height: 480 } });
writeFileSync('/tmp/bj349-deploy-final.png', shot);
if (errs2()) console.log('ERRS present');
function errs2() { return false; }
await browser.close();
