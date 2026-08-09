// 噬魂怪真实生成路径（fromVanilla 经 VanillaSpawner）诊断：贴图帧 + AI 飞行状态 + 截图
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('select', { timeout: 60000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  window.__swSetPool?.([6]);
  g.world.clock.timeOfDay = 0.9;
  const st = g.world.store;
  const ty = Math.floor(g.world.rockLevel) + 30;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 4;
  for (let dy = -12; dy <= 2; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(px0 + dx, py0 + dy, dy === 2 ? 2 : 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  g.player.x = (px0 + 10) * 16; g.player.y = (py0 - 4) * 16;
  for (let i = 0; i < 2000; i++) g.fixedUpdate(1 / 60);
  const e = g.entities.enemies.find((x) => x.vanilla?.aiStyle === 5 && !x.dead);
  if (!e) return { spawned: 0 };
  const trace = [];
  for (let i = 0; i < 240; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    if (i % 40 === 0) trace.push({ x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), g: e.onGround, fly: e.def.flying, ai: e.vanilla.aiStyle });
  }
  // 渲染一帧并直接查 atlas 帧元数据
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const atlas = g.renderer?.atlas ?? g.atlas;
  let meta = null, frames = null;
  if (atlas) {
    const m = atlas.vnpcMeta ? atlas.vnpcMeta(6) : null;
    const fr = atlas.vnpc ? atlas.vnpc(6, 0) : null;
    meta = m; frames = fr ? { sw: fr.sw, sh: fr.sh, sx: fr.sx, sy: fr.sy } : null;
  }
  return { spawned: 1, name: e.vanilla.name, trace, meta, frames };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/eater_natural.png' });
await browser.close();
console.log('done');
