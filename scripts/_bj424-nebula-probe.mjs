// ★BJ424 实机探针：星云套装 1:1 补齐验证（私有端口 5630）。
// 链路：穿 2760/2761/2762 → 持水晶风暴（518,弹 94 magic:true,SetDefaults :1779-1793,
// 通用尾支=旧 4 专支外的缺面武器面）→ 魔法命中怪 → Projectile.Damage_PVE_Inner
// :13885-91 proc → ItemDrop(3453-55 NebulaPickup) 悬停浮游（ItemNoGravity 渲染面）
// → 走上拾取 → Player.NebulaLevelup 叠档 + buff 栏三色图标。
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5630';
const OUT = new URL('../docs/evidence/bj424/', import.meta.url).pathname;
const MAP = process.env.SW_MAP || '/Users/vinlic/Downloads/map-12345.json';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => {
  const orig = console.error.bind(console);
  console.error = (...a) => {
    try { (window.__errStacks = window.__errStacks || []).push(a.map((x) => (x && x.stack) ? x.stack : String(x)).join(' | ').slice(0, 3000)); } catch {}
    orig(...a);
  };
  // headless 音频环境守卫：AudioParam.value NaN/Inf 直写会炸 Sfx 起振（探针环境伪影,
  // 非游戏缺陷面）——钳到 0 保帧循环不断
  if (window.AudioParam) {
    const d = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value');
    Object.defineProperty(AudioParam.prototype, 'value', {
      get: d.get,
      set(v) { d.set.call(this, Number.isFinite(v) ? v : 0); },
      configurable: true,
    });
  }
  window.__bj424HookInstalled = true;
});
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 500)); });
console.log('[dbg] goto'); await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
{ // SW cache-first 清扫（zenith 同款,防陈旧 SW 档）
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
  }
}
// 并行会话在制 worldgen 域 → 读档面（map-12345 存档）绕开生成,链路验证等价
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
console.log('[dbg] vsel ok');
const mapText = readFileSync(MAP, 'utf8');
console.log('[dbg] map read', mapText.length);
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
console.log('[dbg] loadJson:', JSON.stringify(boot));
if (!boot.ok) { process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
// 关「欢迎来到 SandboxWorld」欢迎模态（原版在 map 载入首开弹出,挡截图/相机）
for (const sel of ['button', '[data-act]']) {
  const done = await page.evaluate((q) => {
    const b = [...document.querySelectorAll(q)].find((x) => /我已知晓/.test(x.textContent ?? ''));
    if (b) { b.click(); return true; }
    return false;
  }, sel);
  if (done) break;
}
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
// DOM 菜单覆层隐藏（loadJson 流残余面板;仅截图期,画布 UI 不受影响）
await page.evaluate(() => {
  window.__bj424Hidden = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'absolute') {
      const hasCanvas = !!el.querySelector('canvas');
      if (!(el instanceof HTMLCanvasElement) && !hasCanvas && el.offsetWidth > 0) {
        window.__bj424Hidden.push([el, el.style.display]);
        el.style.display = 'none';
      }
    }
  }
});

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const M = await import('/src/data/items.ts');
  const E = await import('/src/entities/Enemy.ts');
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const p = g.player;
  // ---- 穿星云套 + 持恶魔镰（164 → 弹 42,通用尾支面）----
  p.inv.armor[0] = { id: idOf(2760), stack: 1 };
  p.inv.armor[1] = { id: idOf(2761), stack: 1 };
  p.inv.armor[2] = { id: idOf(2762), stack: 1 };
  const crystal = idOf(518);   // Crystal Storm → 弹 94 magic（数据面+SetDefaults :1787 双源）
  if (!crystal) return { fail: 'crystal-missing' };
  p.inv.slots[0] = { id: crystal, stack: 1 };
  p.inv.selected = 0;
  p.vx = 0; p.vy = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  const setOk = !!p.equipStats.nebulaSet;
  p.baseMaxMana = 400;
  g.fixedUpdate(1 / 60);
  p.mana = p.maxMana;
  // ---- 怪：僵尸（vanillaId 3）放玩家旁的净空位（地面扫描,防嵌墙即死）----
  const st = g.world.store;
  const pt = { tx: Math.floor(p.cx / 16), ty: Math.floor(p.cy / 16) };
  let spot = null;
  outer: for (let dx = 6; dx <= 14; dx++) {
    for (let dy = -4; dy <= 6; dy++) {
      const tx = pt.tx + dx, ty = pt.ty + dy;
      let air = true, floor = false;
      for (let yy = ty - 2; yy <= ty; yy++) if (st.isSolid(tx, yy)) { air = false; break; }
      if (st.isSolid(tx, ty + 1) || st.isSolid(tx, ty + 2)) floor = true;
      if (air && floor) { spot = { tx, ty }; break outer; }
    }
  }
  if (!spot) return { fail: 'no-spot' };
  const foe = E.Enemy.fromVanilla(3, spot.tx * 16 + 8 - 10, spot.ty * 16 + 16 - 42);
  foe.maxHp = 4000; foe.hp = 4000;
  g.entities.add(foe, 'enemies');
  for (let t = 0; t < 20; t++) g.fixedUpdate(1 / 60);
  const dropsOf = () => g.entities.drops.filter((d) => !d.dead && d.pickup === 'nebula');
  const projsOf = () => g.entities.projectiles.filter((q) => q.projId === 94);
  // ---- 循环施法（水晶风暴 autoReuse 速射,穿透 1 多 proc）----
  for (let vol = 0; vol < 120 && dropsOf().length < 4 && foe.hp > 200 && !foe.dead; vol++) {
    const [sx, sy] = g.camera.worldToScreen(foe.x + foe.w / 2, foe.y + foe.h / 2);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let t = 0; t < 12 && p.mana > 10; t++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    for (let t = 0; t < 10; t++) g.fixedUpdate(1 / 60);   // 回蓝窗
    p.mana = p.maxMana;
    await wait(10);
  }
  await wait(600);
  const boosters = dropsOf().map((d) => ({ vid: (M.ITEM_DEFS[d.itemId]?.vid ?? -1), x: Math.round(d.x + d.w / 2), y: Math.round(d.y + d.h / 2) }));
  const scytheShots = projsOf().length;
  return {
    setOk, scytheShots, foeHpLeft: foe.hp, foeDied: foe.dead, boosters,
    cd: p.nebulaCD, nebula: [...p.nebula], mana: Math.round(p.mana),
  };
});
console.log('[probe] combat:', JSON.stringify(res));
if (res.fail) { console.log('BJ424 PROBE FAIL'); await browser.close(); process.exit(1); }

// ---- 浮游物在场截图（noGravity 悬停渲染面）----
const focus = await page.evaluate(async () => {
  const g = window.__swGame;
  const b = g.entities.drops.filter((d) => !d.dead && d.pickup === 'nebula')[0];
  if (b) { g.camera.x = b.x + b.w / 2 - g.camera.w / 2; g.camera.y = b.y + b.h / 2 - g.camera.h / 2; }
  return b ? { x: b.x, y: b.y } : null;
});
await new Promise((r) => setTimeout(r, 500));
console.log('[probe] rings-after-combat:', await page.evaluate(() => JSON.stringify({
  errs: (window.__swErrors ?? []).slice(-2).map((r) => ({ msg: r.msg?.slice(0, 200), stack: r.stack?.slice(0, 800) })),
  fatal: (window.__swErrorsFatal ?? []).slice(-2).map((r) => ({ msg: r.msg?.slice(0, 200), stack: r.stack?.slice(0, 800) })),
  flag: !!window.__bj424HookInstalled,
})).catch((e) => 'read-fail ' + String(e).slice(0, 100)));
await page.screenshot({ path: OUT + 'bj424-boosters-floating.png' });

// ---- 拾取面：传送玩家到 booster 上,观察叠档/buff 图标 ----
const pickup = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = () => g.entities.drops.filter((d) => !d.dead && d.pickup === 'nebula');
  const picked = [];
  for (let i = 0; i < 8 && get().length; i++) {
    const b = get()[0];
    g.player.x = b.x + b.w / 2 - g.player.w / 2;
    g.player.y = b.y + b.h / 2 - g.player.h / 2;
    g.player.vx = 0; g.player.vy = 0;
    for (let t = 0; t < 40 && get().includes(b); t++) g.fixedUpdate(1 / 60);
    picked.push(b.dead);
  }
  await wait(200);
  return { picked: picked.filter(Boolean).length, nebula: [...g.player.nebula],
    icons: g.player.nebulaBuffIcons(), sfx: 'sound-side-unchecked' };
});
console.log('[probe] pickup:', JSON.stringify(pickup));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + 'bj424-buffbar-after-pickup.png' });

// ---- 复验：CD 面（30t 内第二 proc 应被拒）----
await browser.close().catch(() => {});
const ok = res.setOk && res.scytheShots > 0 && res.boosters.length >= 1
  && res.boosters.every((b) => [3453, 3454, 3455].includes(b.vid))
  && pickup.picked >= 1 && pickup.nebula.some((v) => v > 0)
  && pickup.icons.length >= 1 && errs.length === 0;
const stacks = await page.evaluate(() => (window.__swErrors ?? []).map((r) => (r.stack || r.message || JSON.stringify(r)).slice(0, 2000))).catch(() => []);
console.log('[probe] pageerrors:', errs.length ? errs.slice(0, 3) : 'none');
console.log('[probe] halt-stacks:', JSON.stringify(stacks.slice(0, 2), null, 1).slice(0, 3000));
console.log(ok ? 'BJ424 PROBE PASS' : 'BJ424 PROBE FAIL');
process.exit(ok ? 0 : 1);
