// BJ349 贴图复现:星星炮朝右射→截屏×2(弹逻辑位置vs画面位置)+铁阔剑挥砍截屏
// 判据:弹逻辑 vx>0 向右飞,截屏中弹应出现在玩家右侧且 B 帧比 A 帧更靠右;
// 弹贴图(星星)方向;手持武器贴图位置与朝向。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR:' + String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 240000, polling: 1000 });
await new Promise(r => setTimeout(r, 2500));
const stage = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const vc = await import('/src/data/vanillaItemCombat.ts');
  const DEFS = items.ITEM_DEFS;
  const findDef = (vid) => { for (let i = 0; i < DEFS.length; i++) { const d = DEFS[i]; if (d && d.vid === vid) return { id: i, key: d.key, vid: d.vid }; } return null; };
  // 星星炮反查 shoot===15 + 坠星 vid75;阔剑扫 /sword/i melee
  let cannon = findDef(197);
  const star = findDef(75);
  let sword = null;
  for (let vid = 1; vid < 60 && !sword; vid++) { const uc = vc.itemCombat ? vc.itemCombat(vid) : null; if (uc && uc.melee === true && uc.shoot === 0 && (uc.damage ?? 0) >= 5) { const f = findDef(vid); if (f && /sword/i.test(f.key)) { sword = f; break; } } }
  const shootOf = cannon ? (vc.itemCombat ? vc.itemCombat(cannon.vid)?.shoot : null) : null;
  const inv = g.player.inv;
  if (cannon) inv.slots[0] = { id: cannon.id, stack: 1 };
  if (star) inv.slots[5] = { id: star.id, stack: 999 };
  g.player.selectedSlot = 0;
  const vw = innerWidth, vh = innerHeight;
  // 悬空防摔:冻结重力——直接把玩家 vy 清零+放到平地即可,play=small 出生点即地面
  g.input.mouseX = vw - 120; g.input.mouseY = Math.round(vh / 2);
  g.input.mouseDown = true;
  for (let i = 0; i < 6; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  return { vw, vh, cannon, star, sword, shootOf, px: +g.player.cx.toFixed(1), py: +g.player.cy.toFixed(1), facing: g.player.facing };
});
// 帧采样:两拍弹逻辑位置+两截屏
const samples = [];
for (let k = 0; k < 2; k++) {
  const s = await page.evaluate(() => {
    const g = window.__swGame;
    const ps = [];
    for (const e of (g.entities.projectiles ?? [])) ps.push({ cls: e.constructor?.name, pid: e.projId, x: +Number(e.x).toFixed(1), y: +Number(e.y).toFixed(1), vx: +Number(e.vx).toFixed(2), rot: e.rot !== undefined ? +Number(e.rot).toFixed(3) : undefined, dir: e.dir, spriteDirection: e.spriteDirection });
    return { ps, px: +g.player.cx.toFixed(1), py: +g.player.cy.toFixed(1), facing: g.player.facing, shotX: g.renderer && g.renderer.camera ? undefined : undefined };
  });
  samples.push(s);
  const shot = await page.screenshot({ clip: { x: Math.max(0, stage.vw / 2 - 420), y: Math.max(0, stage.vh / 2 - 240), width: 840, height: 480 } });
  writeFileSync(`/tmp/bj349-star-${k}.png`, shot);
  await new Promise(r => setTimeout(r, 700));
}
// 挥砍采样:换剑,鼠标右,挥
const swing = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const sword = null;
  return { swingShot: !!sword };
});
await page.evaluate(() => {
  const g = window.__swGame;
  const items = null;
});
// 找剑:重扫一次(上一段 evaluate 环境不可跨),直接再给
const swordInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const vc = await import('/src/data/vanillaItemCombat.ts');
  const DEFS = items.ITEM_DEFS;
  const findDef = (vid) => { for (let i = 0; i < DEFS.length; i++) { const d = DEFS[i]; if (d && d.vid === vid) return { id: i, key: d.key, vid: d.vid }; } return null; };
  let sword = findDef(122);
  if (!sword) { for (let vid = 1; vid < 500; vid++) { const uc = vc.itemCombat ? vc.itemCombat(vid) : null; if (uc && uc.melee === true && uc.shoot === 0 && (uc.damage ?? 0) >= 8) { const f = findDef(vid); if (f && /broadsword|sword/i.test(f.key)) { sword = f; break; } } } }
  if (sword) { g.player.inv.slots[0] = { id: sword.id, stack: 1 }; g.player.selectedSlot = 0; }
  const vw = innerWidth, vh = innerHeight;
  g.input.mouseX = vw - 120; g.input.mouseY = Math.round(vh / 2);
  g.input.mouseDown = true;
  for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  return { sword, facing: g.player.facing, swing: g.swing ? { t: g.swing.t, dur: g.swing.dur } : null };
});
const swingShot = await page.screenshot({ clip: { x: Math.max(0, stage.vw / 2 - 420), y: Math.max(0, stage.vh / 2 - 240), width: 840, height: 480 } });
writeFileSync('/tmp/bj349-swing.png', swingShot);
console.log('STAGE=' + JSON.stringify(stage));
console.log('S1=' + JSON.stringify(samples[0]).slice(0, 800));
console.log('S2=' + JSON.stringify(samples[1]).slice(0, 800));
console.log('SWING=' + JSON.stringify(swordInfo));
if (errs.length) console.log('ERRS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
