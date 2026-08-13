// 一次性探针：可控导弹族（113→16 / 218→34 / 495→79，aiStyle 9）与老星怒
// （65→9）挂点验证——useCombatWeapon magic 分支是否真的分流到 MagicMissileProj、
// melee 链是否出 StarfuryStar，以及 channel 操控/松手语义在真机里成立。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&missileprobe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const van = await page.evaluate(async () => {
  const r = await fetch('sprites/vanilla.json');
  const j = await r.json();
  return j.items ?? {};
});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + String(m.key).replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};

const equip = async (vid) => page.evaluate((key) => {
  const g = window.__swGame;
  const id = window.__swItems?.[key];
  if (id === undefined) return false;
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();
  g.player.useTime = 0;
  g.swing = null;
  g.player.mana = 400;
  return true;
}, keyFor(vid));

// 注入点击器：清弹桶 → 设光标 → 边沿按下（可选保持）→ 步进一帧 → 回读弹桶
await page.evaluate(() => {
  window.__clickUse = (mx, my, hold) => {
    const g = window.__swGame;
    g.entities.projectiles.length = 0;
    g.input.mouseX = mx; g.input.mouseY = my;
    g.input.uiBlocking = false;
    g.input.mouseDown = true;
    if (hold) g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    return g.entities.projectiles.map((p) => ({
      ctor: p.constructor.name, projId: p.projId ?? null,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, w: p.w, h: p.h,
    }));
  };
  window.__stepTicks = (n, mx, my, hold) => {
    const g = window.__swGame;
    g.input.mouseX = mx; g.input.mouseY = my;
    g.input.mouseHeld = !!hold;
    g.input.mouseDown = false;
    for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60);
    return g.entities.projectiles.map((p) => ({
      ctor: p.constructor.name, projId: p.projId ?? null,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, cx: p.x + p.w / 2, cy: p.y + p.h / 2,
    }));
  };
});

const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });

// ---- ① 113 Magic Missile → MagicMissileProj(16) ----
if (!await equip(113)) { console.error('equip 113 失败（key=' + keyFor(113) + '）'); process.exit(1); }
let ps = await page.evaluate(() => window.__clickUse(900, 400, true));
ok('113 点击出 MagicMissileProj', ps.length === 1 && ps[0].ctor === 'MagicMissileProj' && ps[0].projId === 16, { ps });
ok('16 判定盒 32×32（SetDefaults :714-724）', ps[0]?.w === 32 && ps[0]?.h === 32, { w: ps[0]?.w, h: ps[0]?.h });

// channel 操控：光标甩到左侧 → 速度向左
let st = await page.evaluate(() => window.__stepTicks(10, 300, 400, true));
const m1 = st.find((p) => p.ctor === 'MagicMissileProj');
ok('channel 跟随光标（甩左 → vx<0）', m1 && m1.vx < 0, { vx: m1?.vx, vy: m1?.vy });
// 松手 → 顶速 32 直飞
st = await page.evaluate(() => window.__stepTicks(3, 300, 400, false));
const m2 = st.find((p) => p.ctor === 'MagicMissileProj');
ok('松手归一 32 直飞', m2 && Math.abs(Math.hypot(m2.vx, m2.vy) - 32) < 1.5, { sp: m2 && Math.hypot(m2.vx, m2.vy) });
// 清场
await page.evaluate(() => { window.__swGame.input.mouseHeld = false; });

// ---- ② 218 Flamelash → 34 ----
await equip(218);
ps = await page.evaluate(() => window.__clickUse(900, 400, false));
ok('218 点击出 MagicMissileProj(34)', ps.length === 1 && ps[0].ctor === 'MagicMissileProj' && ps[0].projId === 34, { ps });
await page.evaluate(() => { window.__swGame.entities.projectiles.length = 0; });

// ---- ③ 495 Rainbow Rod → 79 ----
await equip(495);
ps = await page.evaluate(() => window.__clickUse(900, 400, false));
ok('495 点击出 MagicMissileProj(79)', ps.length === 1 && ps[0].ctor === 'MagicMissileProj' && ps[0].projId === 79, { ps });
await page.evaluate(() => { window.__swGame.entities.projectiles.length = 0; });

// ---- ④ 65 老星怒 → StarfuryStar(9)：出生在玩家上方 600px ----
await equip(65);
const pinfo = await page.evaluate(() => {
  const g = window.__swGame;
  return { cx: g.player.cx, cy: g.player.cy, dmg: (g.swing && g.swing.dmg) || 0 };
});
ps = await page.evaluate(() => window.__clickUse(640, 400, false));
const star = ps.find((p) => p.ctor === 'StarfuryStar');
ok('65 点击出 StarfuryStar', !!star, { ps: ps.map((p) => p.ctor) });
if (star) {
  ok('落星出生 ≈ 玩家上方 600px（Player.cs:46619）',
    Math.abs((star.y + star.h / 2) - (pinfo.cy - 600)) < 40,
    { starY: star.y, wantY: pinfo.cy - 600 });
}
// ---- ⑤ 753 Seaweed / 579 Drax / 1262 叶绿锤钻 不应进导弹链（防误挂） ----
for (const [vid, nm] of [[753, 'Seaweed'], [579, 'Drax'], [1262, 'Jackhammer']]) {
  await equip(vid);
  const ps2 = await page.evaluate(() => window.__clickUse(640, 400, false));
  const bad = ps2.filter((p) => p.ctor === 'MagicMissileProj' || p.ctor === 'StarfuryStar');
  ok(nm + '（' + vid + '）不误挂导弹链', bad.length === 0, { got: ps2.map((p) => p.ctor) });
  await page.evaluate(() => { window.__swGame.entities.projectiles.length = 0; });
}

// ---- 汇总 ----
const fail = A.filter((a) => !a.pass);
for (const a of A) console.log((a.pass ? '✓' : '✗') + ' ' + a.name + (a.pass ? '' : '  ' + JSON.stringify(a)));
console.log(`\n${A.length - fail.length}/${A.length} 断言通过`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail.length || errors.length ? 1 : 0);
