// 一次性探针:四柱(F6 召唤链)发光/护盾/召唤小怪三面机制取证
//  1) towerAI 是否运行(ai0 推进/ai1 复位)  2) Solar 519 小怪是否孵化
//  3) drawNpcGlow(vel4 halo)是否被调/ensureVImage 是否 null  4) drawTowerShield 是否被调
//  5) 屏幕像素采样:塔顶区域加性亮度(halo 实绘证据)  6) 截图存 /tmp
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&twr' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// —— 插桩:原型链包装(中立计数,不改语义) ——
await page.evaluate(() => {
  const g = window.__swGame;
  const rd = g.renderer;
  const proto = Object.getPrototypeOf(rd);
  window.__probe = { glow: [], shield: [], vimg: [] };
  const og = proto.drawNpcGlow;
  proto.drawNpcGlow = function (e, r, bx, by) {
    window.__probe.glow.push({ vid: e?.vanillaId ?? null, t: performance.now() | 0 });
    return og.call(this, e, r, bx, by);
  };
  const os = proto.drawTowerShield;
  proto.drawTowerShield = function (e, world) {
    const key = world?.lunarEvent ? { solar: world.lunarEvent.shield.solar, vortex: world.lunarEvent.shield.vortex, nebula: world.lunarEvent.shield.nebula, stardust: world.lunarEvent.shield.stardust } : null;
    window.__probe.shield.push({ vid: e?.vanillaId ?? null, shield: key, ai3: e?.ai3, t: performance.now() | 0 });
    return os.call(this, e, world);
  };
  const ai = g.renderer.atlas;
  const oi = ai.ensureVImage.bind(ai);
  ai.ensureVImage = (f) => {
    const v = oi(f);
    if (String(f).includes('Glow_') || String(f).includes('Perlin')) {
      window.__probe.vimg.push({ f, hit: !!v, t: performance.now() | 0 });
    }
    return v;
  };
});

// —— 找平地,把玩家放过去,再在玩家处 F6 召唤 517 日耀塔 ——
const placed = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = st.w, h = st.h;
  for (let x = Math.floor(w / 2) - 30; x < Math.floor(w / 2) + 30; x++) {
    for (let y = 60; y < h - 60; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        g.player.x = x * 16 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        return { x, y };
      }
    }
  }
  return null;
});
const spawn = await page.evaluate(() => {
  const g = window.__swGame;
  const err = g.debugSpawnNpc(517, 1, false);
  const t = [...g.entities.enemies].reverse().find((n) => n.vanillaId === 517);
  return { err, tower: t ? { x: t.x, y: t.y, w: t.w, h: t.h, ai0: t.ai0, ai1: t.ai1, ai2: t.ai2, ai3: t.ai3, spawnAlpha: t.spawnAlpha, dead: t.dead, vanillaId: t.vanillaId, aiStyle: t.vanilla?.aiStyle } : null,
    le: { active: g.world.lunarEvent.active, shield: { ...g.world.lunarEvent.shield }, towerActive: { ...g.world.lunarEvent.towerActive } } };
});
// 等 ~3.5s 游戏自然跑(约 210t)——塔悬停节律 ai0/300、Solar 每 60t 一只小怪
await new Promise((r) => setTimeout(r, 3500));
const state1 = await page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 517 && !n.dead);
  const minions = [...g.entities.enemies].filter((n) => n.vanillaId === 519 && !n.dead).length;
  const proj = g.entities.projectiles ? g.entities.projectiles.length : -1;
  return {
    tower: t ? { ai0: t.ai0, ai1: t.ai1, ai3: t.ai3, x: t.x, y: t.y, dead: t.dead, spawnAlpha: t.spawnAlpha } : null,
    minions,
    proj,
    player: { x: g.player.x, y: g.player.y, cx: g.player.cx, cy: g.player.cy },
    probe: { glowN: window.__probe.glow.length, glowTower: window.__probe.glow.filter((c) => c.vid === 517).length,
      shieldN: window.__probe.shield.length, shieldTower: window.__probe.shield.filter((c) => c.vid === 517).length,
      vimgGlow: window.__probe.vimg.filter((v) => v.f.includes('Glow_162')).slice(-3),
      vimgPerlin: window.__probe.vimg.filter((v) => v.f.includes('Perlin')).slice(-3) },
  };
});

// —— 屏幕像素采样:塔顶区域(塔精灵顶上方 halo 带) ——
const pix1 = await page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 517 && !n.dead);
  if (!t) return null;
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(t.cx, t.y);
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cv.getContext('2d');
  const x0 = Math.max(0, Math.floor(sx - 90)), y0 = Math.max(0, Math.floor(sy - 40));
  const w = Math.min(180, cv.width - x0), h = Math.min(70, cv.height - y0);
  const d = ctx.getImageData(x0, y0, w, h).data;
  let mx = 0, sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(d[i], d[i + 1], d[i + 2]); if (v > mx) mx = v; sum += v; n++; }
  return { sx, sy, canvas: { w: cv.width, h: cv.height }, maxCh: mx, avgCh: +(sum / n).toFixed(1) };
});
await page.screenshot({ path: '/tmp/tower-solar-noshield.png' });

// —— 护盾面:手动置满盾(自然触发 triggerLunarApocalypse 后的状态),再采样 ——
const shieldState = await page.evaluate(() => {
  const g = window.__swGame;
  const max = g.world.flags['downed_398'] ? 50 : 100;
  g.world.lunarEvent.shield.solar = max;
  g.world.lunarEvent.towerActive.solar = true;
  return { max };
});
await new Promise((r) => setTimeout(r, 1200));
const state2 = await page.evaluate(() => {
  const p = window.__probe;
  return { shieldCalls: p.shield.filter((c) => c.vid === 517).slice(-2),
    vimgPerlin: p.vimg.filter((v) => v.f.includes('Perlin')).slice(-2) };
});
const pix2 = await page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 517 && !n.dead);
  if (!t) return null;
  const [sx, sy] = g.camera.worldToScreen(t.cx, t.y);
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cv.getContext('2d');
  const x0 = Math.max(0, Math.floor(sx - 90)), y0 = Math.max(0, Math.floor(sy - 40));
  const w = Math.min(180, cv.width - x0), h = Math.min(70, cv.height - y0);
  const d = ctx.getImageData(x0, y0, w, h).data;
  let mx = 0, sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(d[i], d[i + 1], d[i + 2]); if (v > mx) mx = v; sum += v; n++; }
  return { maxCh: mx, avgCh: +(sum / n).toFixed(1) };
});
await page.screenshot({ path: '/tmp/tower-solar-shield100.png' });

console.log(JSON.stringify({ placed, spawn, state1, pix1, shieldState, state2, pix2, pageErrors: errors.slice(0, 3) }, null, 1));
await browser.close();
