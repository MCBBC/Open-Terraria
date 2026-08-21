// NPC 洗掠实测:在水域放一条敌怪,读波场 R 在 NPC 位置的变化 + 截图。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (7).json', 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wash-profile3',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找水域
  let spot = null;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  outer:
  for (let r = 10; r < 200; r += 4) {
    for (const dx of [-r, r]) {
      for (let dy = -30; dy < 30; dy += 3) {
        const x = px + dx, y = py + dy;
        if (!st.inBounds(x, y)) continue;
        if (st.liquid[st.idx(x, y)] > 200 && st.liquid[st.idx(x, y - 3)] === 0
          && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 3)]) { spot = { x, y }; break outer; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  g.player.debugGod = true;
  g.player.x = spot.x * 16; g.player.y = (spot.y - 6) * 16;
  g.camera.follow = function () {};
  g.camera.x = spot.x * 16; g.camera.y = spot.y * 16;
  if (g.world.clock) g.world.clock.timeOfDay = 0.4;
  // 生成水中敌怪(金鱼):Game.spawnEnemy(权威入口,联机同步)
  const npc = g.spawnEnemy('v_59', spot.x * 16, (spot.y - 2) * 16) ?? g.spawnEnemy('slime_green', spot.x * 16, (spot.y - 2) * 16);
  const samples = [];
  for (let f = 0; f < 120; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f % 20 === 0) {
      const d = (await import('/src/render/WaterWaves.ts')).waterWaves.debug();
      samples.push({ f, active: d.activeTexels, steps: d.stepsLastFrame,
        npcWet: npc?.wet, npcX: Math.round(npc?.x ?? 0), npcY: Math.round(npc?.y ?? 0),
        vx: Math.round((npc?.vx ?? 0) * 100) / 100, vy: Math.round((npc?.vy ?? 0) * 100) / 100 });
    }
  }
  return { spot, samples, npcKind: npc?.constructor?.name };
}, );
console.log(JSON.stringify(out, null, 1));
await browser.close();
