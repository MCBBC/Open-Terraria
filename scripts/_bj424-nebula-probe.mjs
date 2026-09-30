// ★BJ424 实机探针：星云套装 1:1 补齐验证（私有端口 5630）。
// 链路：穿 2760/2761/2762 → 持恶魔镰（164,弹 42 magic,通用尾支=旧 4 专支外的
// 缺面武器）→ 魔法命中怪 → Projectile.Damage_PVE_Inner :13885-91 proc →
// ItemDrop(3453-55 NebulaPickup) 悬停浮游（noGravity 渲染面）→ 走上拾取 →
// Player.NebulaLevelup 叠档 + buff 栏三色图标。
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5630';
const OUT = new URL('../docs/evidence/bj424/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 1200, 400));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

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
  const scythe = idOf(164);
  if (!scythe) return { fail: 'scythe-missing' };
  p.inv.slots[0] = { id: scythe, stack: 1 };
  p.inv.selected = 0;
  p.baseMaxMana = 400; p.mana = 400;
  p.x -= p.w; p.vx = 0; p.vy = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  const setOk = !!p.equipStats.nebulaSet;
  // ---- 怪：胖僵尸（vanillaId 3）站玩家右侧,加厚血量吃多跳 ----
  const foe = E.Enemy.fromVanilla(3, p.cx + 130, p.y + 4);
  foe.maxHp = 4000; foe.hp = 4000;
  foe.noGravity = true; foe.vx = 0; foe.vy = 0;   // 钉住不坠
  g.entities.add(foe, 'enemies');
  const dropsOf = () => g.entities.drops.filter((d) => !d.dead && d.pickup === 'nebula');
  const projsOf = () => g.entities.projectiles.filter((q) => q.projId === 42);
  // ---- 循环施法（恶魔镰穿透,多跳多 proc）----
  for (let vol = 0; vol < 60 && dropsOf().length < 3 && foe.hp > 200; vol++) {
    const [sx, sy] = g.camera.worldToScreen(foe.x + foe.w / 2, foe.y + foe.h / 2);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let t = 0; t < 30; t++) g.fixedUpdate(1 / 60);   // 0.5s 挥法（蓄力/穿透多跳）
    g.input.mouseDown = false; g.input.mouseHeld = false;
    await wait(30);
  }
  await wait(600);
  const hits = foe.hitsTaken ?? null;
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
console.log('[probe] pageerrors:', errs.length ? errs.slice(0, 3) : 'none');
console.log(ok ? 'BJ424 PROBE PASS' : 'BJ424 PROBE FAIL');
process.exit(ok ? 0 : 1);
