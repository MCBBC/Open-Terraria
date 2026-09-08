// 幻影弓真实链探针:给玩家 3540+木箭,真实输入链开火(瞄准左下),采样速度+截图
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) { await new Promise(r => setTimeout(r, 5000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break; }
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = items;
  // 找 3540 与木箭(vid 40)的内部 id
  let bowId = -1, arrowId = -1;
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i]; if (!d) continue;
    const v = d.vid ?? VANILLA_ITEM_KEY_BY_ID?.indexOf?.(d.key) ?? -1;
    if (d.key === 'vi_3540_phantasm') bowId = i;
    if (d.key === 'vi_40_wooden_arrow') arrowId = i;
  }
  if (bowId < 0) { for (let i = 0; i < ITEM_DEFS.length; i++) { const d = ITEM_DEFS[i]; if (d && /phantasm/.test(d.key)) bowId = i; } }
  if (arrowId < 0) { for (let i = 0; i < ITEM_DEFS.length; i++) { const d = ITEM_DEFS[i]; if (d && /wooden_arrow/.test(d.key)) arrowId = i; } }
  const inv = g.player.inv;
  inv.slots[0] = { id: bowId, count: 1 };
  inv.slots[1] = { id: arrowId, count: 99 };
  inv.selected = 0;
  const p = g.player;
  // 清空附近敌弹干扰
  for (const e of g.entities.projectiles) e.dead = true;
  // 瞄准:玩家左下 300,100 → 屏幕坐标
  const [swx, swy] = g.camera.worldToScreen
    ? g.camera.worldToScreen(p.cx - 300, p.cy + 100)
    : [0, 0];
  g.input.mouseX = swx; g.input.mouseY = swy;
  g.input.mouseHeld = true;
  g.input.mouseDown = true;
  const snaps = [];
  for (let t = 0; t < 34; t++) {
    g.fixedUpdate(1 / 60);
    if (t === 12 || t === 22 || t === 32) {
      const volleys = [];
      for (const e of g.entities.projectiles) {
        if (e.dead || e.projId === 630) continue;
        volleys.push({ pid: e.projId, x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(1), vy: +e.vy.toFixed(1), age: e.age });
      }
      snaps.push({ t, volleys });
    }
  }
  return { bowId, arrowId, swx, swy, playerAt: { x: Math.round(p.cx), y: Math.round(p.cy) }, snaps };
});
console.log('REAL=' + JSON.stringify(out));
await page.screenshot({ path: '/tmp/phantom-real-final.png' });
await browser.close();
