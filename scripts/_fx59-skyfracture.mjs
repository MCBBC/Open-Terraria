// FX59 裂天剑 3787 探针（2026-09-17 用户实报「一排剑+仅光标处伤害」收官验证）：
// ① 装备 3787 → 一挥三施（3 枚 660 弹,独立伤害 38）
// ② 出生几何 = 出手锚周 Lerp(20,60) 环带（vanilla pointPosition,Player.cs:49319）
// ③ 帧切片 = 单帧 38×38（绘制对拍:弹体绘制宽高 = 38×1.1 而非 532×38 整条）
// ④ 对靶伤害：假人锚定 zombie(3) life=600 → 三剑连击 HP 递减 3 次（独立判定）
// ⑤ 截图 /tmp/fx59-skyfracture.png（三剑可见）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ }
});
await page.goto(ORIGIN + '/?play=small&fx59=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const van = await page.evaluate(async () => {
  const r = await fetch('sprites/vanilla.json');
  const j = await r.json();
  return j.items ?? {};
});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};

// ---- 场景准备：玩家落平地、锚定靶（zombie life=600）、装备 3787 ----
const scene = await page.evaluate((key3787) => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let ground = null;
  for (const dx of [0, 6, -6, 12, -12, 20, -20]) {
    const tx = Math.min(st.w - 6, Math.max(6, px + dx));
    for (let y = 24; y < st.h - 24; y++) {
      if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) {
        g.player.x = tx * 16 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        g.player.vy = 0;
        ground = { tx, ty: y };
        break;
      }
    }
    if (ground) break;
  }
  if (!ground) return { noGround: true };
  // 靶：玩家右前方 240px（约 15 格）,锚定不移动,life 600 吃三剑
  // ★入 enemies 桶（spawnNpcByVanilla 落 critters 桶=小动物,弹幕只判 5 伤杀面）
  const ax = g.player.cx + 240;
  const ay = (ground.ty - 2) * 16;
  const vs = g.vanillaSpawner ?? (g.vanillaSpawner = g.makeVanillaSpawner(g.world));
  const rng = { next: () => Math.random(), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) };
  const zombie = vs.spawnNPC(ax, ay, 3, rng);
  if (zombie) {
    zombie.id = g.entities.nextId++;
    g.entities.enemies.push(zombie);
    zombie.hp = 600; zombie.maxHp = 600;
  }
  g.zombie = zombie;
  g.fx59 = { ax, ay };
  const id = window.__swItems?.[key3787];
  if (id === undefined) return { noItem: true, key3787 };
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();
  return { ground, ax, ay, hasZombie: !!zombie, equipped: key3787 };
}, keyFor(3787));
console.log('[scene]', JSON.stringify(scene));
if (scene.noGround || scene.noItem || !scene.hasZombie) { await browser.close(); process.exit(1); }

// ---- 一挥三施：按住 45t（窗 12 + reuseDelay 18 + 余量）,逐拍记录 660 弹 ----
const fire = await page.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.fx59.ax, g.fx59.ay);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.swing = null; g.player.useTime = 0;
  g.input.mouseDown = true;
  const seen = new Map();          // 弹对象 → 首见位置
  const spawnSamples = [];
  for (let t = 0; t < 45; t++) {
    const before = new Set();
    for (const m of g.entities.projectiles) if (m.projId === 660 && !m.dead) before.add(m);
    // 靶锚定（防 zombie 走位）
    if (g.zombie && !g.zombie.dead) { g.zombie.x = g.fx59.ax - g.zombie.w / 2; g.zombie.y = g.fx59.ay - g.zombie.h / 2; g.zombie.vx = 0; g.zombie.vy = 0; }
    g.fixedUpdate(1 / 60);
    for (const m of g.entities.projectiles) {
      if (m.projId === 660 && !m.dead && !seen.has(m)) {
        seen.set(m, true);
        const cx0 = m.x + m.w / 2, cy0 = m.y + m.h / 2;
        spawnSamples.push({
          cx: cx0, cy: cy0,
          distFromAnchor: Math.hypot(cx0 - g.player.cx, cy0 - g.player.cy),
          dmg: m.damage, w: m.w, h: m.h,
          age: m.age ?? 0,
        });
      }
    }
  }
  g.input.mouseDown = false;
  const shots = [...seen].map((m) => ({
    dmg: m.damage, w: m.w, h: m.h,
    cx: m.x + m.w / 2, cy: m.y + m.h / 2,
  }));
  return {
    spawnSamples, total: shots.length,
    zombieLife: g.zombie ? g.zombie.hp : null,
    zombieDead: !g.zombie || g.zombie.dead,
  };
});
console.log('[fire]', JSON.stringify(fire));

// ---- 命中结算：再挥一轮,观察 HP 逐次递减（独立判定证据） ----
const hits = await page.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.fx59.ax, g.fx59.ay);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.swing = null; g.player.useTime = 0;
  g.input.mouseDown = true;
  const lifeLog = [];
  for (let t = 0; t < 60; t++) {
    if (g.zombie && !g.zombie.dead) { g.zombie.x = g.fx59.ax - g.zombie.w / 2; g.zombie.y = g.fx59.ay - g.zombie.h / 2; g.zombie.vx = 0; g.zombie.vy = 0; }
    g.fixedUpdate(1 / 60);
    lifeLog.push(g.zombie && !g.zombie.dead ? g.zombie.hp : 0);
  }
  g.input.mouseDown = false;
  // 压缩为 HP 下降沿（每次独立命中一档）
  const drops = [];
  for (let i = 1; i < lifeLog.length; i++) {
    if (lifeLog[i] < lifeLog[i - 1]) drops.push({ t: i, from: lifeLog[i - 1], to: lifeLog[i] });
  }
  return { drops, finalLife: lifeLog[lifeLog.length - 1], dead: !g.zombie || g.zombie.dead };
});
console.log('[hits]', JSON.stringify(hits));

// ---- 截图：三剑飞行中可见帧 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.fx59.ax, g.fx59.ay);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.swing = null; g.player.useTime = 0;
  if (g.zombie && !g.zombie.dead) { g.zombie.hp = 600; g.zombie.maxHp = 600; }
  g.input.mouseDown = true;
});
await new Promise((r) => setTimeout(r, 260));   // 约 15t：三发已出、飞行中
await page.screenshot({ path: '/tmp/fx59-skyfracture.png' });
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
const alive = await page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  for (const m of g.entities.projectiles) if (m.projId === 660 && !m.dead) n++;
  return { live660: n };
});
console.log('[shot]', JSON.stringify(alive));

const asserts = [];
const ok = (name, pass, extra) => asserts.push({ name, pass: !!pass, ...(extra ?? {}) });
ok('three-swords-per-swing', fire.total === 3, { total: fire.total });
ok('ring-band-20-60', fire.spawnSamples.length > 0 && fire.spawnSamples.every((s) => s.distFromAnchor >= 18 && s.distFromAnchor <= 62), fire.spawnSamples.map((s) => Math.round(s.distFromAnchor)));
ok('independent-damage-38', fire.spawnSamples.length > 0 && fire.spawnSamples.every((s) => s.dmg === 38), fire.spawnSamples.map((s) => s.dmg));
ok('hitbox-10x10', fire.spawnSamples.length > 0 && fire.spawnSamples.every((s) => s.w === 10 && s.h === 10));
ok('three-independent-hits', hits.drops.length >= 3, hits.drops);
ok('screenshot-live', alive.live660 >= 1, alive);

const failed = asserts.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts, failed: failed.length, pageErrors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
