// BJ349 部署站射击复现:注入星星炮(索引197)+坠星(75)→右侧射击→弹逻辑+视觉对拍
// 自校验:弹 pid===955(星星弹)即注入成功;vx>0=逻辑向右;截屏弹在玩家右侧=视觉同相。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'https://ab575621.sandboxworld.pages.dev';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR:' + String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
const vw = 1360, vh = 860;
const out = await page.evaluate(([vw, vh]) => {
  const g = window.__swGame;
  const inv = g.player.inv;
  inv.slots[0] = { id: 197, stack: 1 };   // 星星炮(索引自校验:挥后弹 pid 955)
  inv.slots[5] = { id: 75, stack: 999 };  // 坠星
  g.player.selectedSlot = 0;
  g.input.mouseX = vw - 120; g.input.mouseY = Math.round(vh / 2);
  const before = new Set(g.entities.projectiles ?? []);
  g.input.mouseDown = true;
  for (let i = 0; i < 12; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const nw = [];
  for (const e of (g.entities.projectiles ?? [])) if (!before.has(e)) nw.push({ pid: e.projId, x: +Number(e.x).toFixed(0), vx: +Number(e.vx).toFixed(2), vy: +Number(e.vy).toFixed(2) });
  return { facing: g.player.facing, projs: nw.slice(0, 5), n: nw.length, px: +g.player.cx.toFixed(0), py: +g.player.cy.toFixed(0), heldName: undefined };
}, [vw, vh]);
await new Promise(r => setTimeout(r, 260));
const shot = await page.screenshot({ clip: { x: vw / 2 - 420, y: vh / 2 - 240, width: 840, height: 480 } });
writeFileSync('/tmp/bj349-deploy-shoot.png', shot);
console.log('SHOOT=' + JSON.stringify(out));
if (errs.length) console.log('ERRS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
