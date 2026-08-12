// 噬魂怪(id 6) 贴图+AI 诊断：生成 → 截图 + 逐帧采样位置/帧索引/绘制区域
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// 清理周围 + 平整地面 + 玩家站立
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  for (let dy = -8; dy <= 4; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(px + dx, py + dy, dy === 4 ? 2 : 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
  }
  g.player.x = px * 16; g.player.y = (py - 2) * 16;
  // 直接生成噬魂怪（玩家左侧 8 格，离地 3 格空中）
  const e = g.spawnEnemy('v_6', (px - 8) * 16, (py - 5) * 16);
  const n = g.entities.enemies.length;
  const found = g.entities.enemies.find((x) => x.vanillaId === 6);
  return { spawned: !!e, eKey: e && e.key, eVanilla: e && e.vanillaId, enemies: n, found: !!found, eid: e && e.id };
});
console.log('setup:', JSON.stringify(setup));

await new Promise((r) => setTimeout(r, 500));

// 找到它并采样 300 tick
const sample = await page.evaluate(() => {
  const g = window.__swGame;
  const e = g.entities.enemies.find((x) => x.vanillaId === 6) ?? g.entities.enemies[0];
  if (!e) return { found: false };
  const trace = [];
  const baseY = e.y;
  for (let i = 0; i < 300; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    if (i % 30 === 0) trace.push({ t: i, x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), onGround: e.onGround, flying: e.def.flying, noGrav: e.vanilla.noGravity });
  }
  // 渲染一帧后检查 atlas 帧数据
  return { found: true, trace, hp: e.hp, w: e.w, h: e.h };
});
console.log('sample:', JSON.stringify(sample, null, 1));

await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/eater_dbg.png' });

// 再抓一帧近距离：把镜头对准怪
await page.evaluate(() => {
  const g = window.__swGame;
  const e = g.entities.enemies.find((x) => x.vanillaId === 6);
  if (e) g.camera.centerOn?.(e.cx, e.cy);
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/eater_close.png' });

await browser.close();
console.log('done');
