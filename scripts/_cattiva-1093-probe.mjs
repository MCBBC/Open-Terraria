// 1093 白帧修复视觉实证：召唤基础捣蛋猫（物品 5663）→ 附近刷怪触发索敌/扑击 →
// 全程采样 palFrame（断言恒 <14，白帧带 14-27 不可达）+ 关键态实拍截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  g.setupDevMode();
  const items = window.__swItems;
  const staffKey = Object.keys(items).find((k) => /^vi_5663_/.test(k));
  if (!staffKey) return { fail: 'no staff 5663 key' };
  const inv = g.player.inv;
  inv.slots[10] = { id: items[staffKey], stack: 1 };
  inv.selected = 10;
  g.player.x = g.world.spawnX * 16;
  g.player.y = (g.world.spawnY - 4) * 16;
  return { ok: true, staffKey };
});
console.log(JSON.stringify(prep));
if (prep.fail) { await browser.close(); process.exit(1); }
// 召唤（按住左键）
await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })));
// 刷怪触发索敌→走行→扑击：在猫周围找平地落点（表面扫描），视线不被树冠挡
const spawn = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 1093 && !p.dead);
  if (!m) return { fail: 'no 1093 minion' };
  const st = g.world.store;
  const T = 16;
  const surfaceYAt = (px) => {
    const col = Math.floor(px / T);
    const row0 = Math.floor(m.cy / T);
    for (let row = row0 - 6; row < row0 + 8; row++) {
      if (st.isSolid(col, row)) return row;
    }
    return null;
  };
  for (const dx of [150, 220, 300, 120]) {
    const row = surfaceYAt(m.cx + dx);
    if (row === null) continue;
    // 平地校验：落点左右 2 格同高（防斜坡/台阶挡扑击侧翼点）
    const rL = surfaceYAt(m.cx + dx - 32), rR = surfaceYAt(m.cx + dx + 32);
    if (rL !== row || rR !== row) continue;
    const e = g.spawnEnemy('slime_green', m.cx + dx, row * T - 12);
    return { ok: true, dx, enemyHp: e.hp, ey: row * T - 12 };
  }
  return { fail: 'no flat spot' };
});
console.log(JSON.stringify(spawn));
if (spawn.fail) { await browser.close(); process.exit(1); }
// 采样 8 秒：palFrame 轨迹 + 态机
const frames = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const seen = [];
  const t0 = performance.now();
  const iv = setInterval(() => {
    const m = g.entities.projectiles.find((p) => p.projId === 1093 && !p.dead);
    if (m) seen.push({ f: m.palFrame, a0: m.palA0 });
    if (performance.now() - t0 > 8000) { clearInterval(iv); resolve(seen); }
  }, 100);
}));
const fs2 = frames.map((x) => x.f);
const summary = {
  samples: frames.length,
  maxFrame: Math.max(...fs2),
  minFrame: Math.min(...fs2),
  whiteBandHits: fs2.filter((f) => f >= 14).length,
  pounceSamples: frames.filter((x) => x.a0 === 2).length,
  walkFrames: [...new Set(fs2.filter((f) => f >= 7 && f < 14))],
};
console.log(JSON.stringify(summary));
// 实拍：扑击/走行期截猫周边
const loc = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 1093 && !p.dead);
  if (!m) return null;
  const [sx, sy] = g.camera.worldToScreen(m.cx, m.cy);
  return { sx: Math.round(sx), sy: Math.round(sy), palFrame: m.palFrame, a0: m.palA0 };
});
console.log(JSON.stringify(loc));
if (loc) {
  const clip = { x: Math.max(0, loc.sx - 90), y: Math.max(0, loc.sy - 90), width: 180, height: 180 };
  await page.screenshot({ path: '/tmp/cattiva-1093-live.png', clip });
  await page.screenshot({ path: '/tmp/cattiva-1093-full.png' });
}
await browser.close();
console.log('done');
