// SW-BJ33 2026-09-08 视觉探针：公主 663 魔法阵 950 可见性验证。
// 流程：注入公主+僵尸 → 自然触发魔法态 → 轮询 950 阵出生 → 三帧截图（出生/中段/尾段）
// + 敌 HP 结算面采样。产物 /tmp/sw-bj33-*.png + stdout JSON。
// 运行：SW_ORIGIN=http://localhost:5218 node tools/run-diag.mjs scripts/_sw-bj33-princess-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(origin + '/?play=small&bj33=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.player)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('BOOT-FAIL', errors.slice(0, 3)); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
// 关掉欢迎弹窗（遮挡观察场）
await page.evaluate(() => {
  for (const b of Array.from(document.querySelectorAll('button'))) {
    if (/我已知晓/.test(b.textContent ?? '')) { b.click(); break; }
  }
}).catch(() => {});
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  // 兜底：移除仍挂在 DOM 的全屏遮罩（含欢迎弹窗容器）
  for (const el of Array.from(document.querySelectorAll('div'))) {
    const s = getComputedStyle(el);
    if ((s.position === 'fixed' || s.position === 'absolute') && /欢迎来到/.test(el.textContent ?? '')
      && el.offsetWidth > 600 && el.offsetHeight > 400) el.remove();
  }
}).catch(() => {});

const setup = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 观察场：清空一块平地（石板地面），公主居中，僵尸贴身
  for (let x = px - 8; x <= px + 8; x++) {
    for (let y = py - 8; y <= py + 2; y++) st.setTile(x, y, 0);
    st.setTile(x, py + 2, 2);
  }
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
  const { Inventory } = await import('/src/items/Inventory.ts');
  g.entities.clear();
  const pr = new TownNPC('princess', (px - 2) * 16, (py + 2) * 16, new Inventory());
  pr.stationary = true;
  g.entities.add(pr, 'npcs');
  const z = spawnVanillaEnemy(g, 3, (px + 2) * 16, (py + 1) * 16);   // 僵尸（LOS 通,贴身右侧）
  if (z) { z.x = (px + 2) * 16; z.y = (py + 1) * 16 - 8; }
  g.world.clock.timeOfDay = 0.1;                                     // 深夜（僵尸不烧不逝）
  g.camera.x = px * 16 + 8; g.camera.y = (py - 1) * 16;
  return { px, py, princess: !!pr, zombie: !!z, zombieId: z?.vanillaId, prHp: pr.hp, zHp: z?.hp };
});

// 等首个 950 阵出生（自然触发：危检 50%/t + 入态 15t 首发口径）
let auraBorn = null;
for (let i = 0; i < 300 && !auraBorn; i++) {
  await new Promise((r) => setTimeout(r, 100));
  auraBorn = await page.evaluate(() => {
    const g = window.__swGame;
    const auras = g.entities.projectiles.filter((p) => p.projId === 950 && !p.dead);
    return auras.length ? {
      n: g.entities.projectiles.filter((p) => p.projId === 950).length,
      alive: auras.length,
      first: { x: auras[0].x, y: auras[0].y, w: auras[0].w, h: auras[0].h, cls: auras[0].constructor.name },
      state: (g.entities.npcs.find((n) => n.vanillaId === 663) ?? {}).attackState,
      t: auras[0].t ?? null,
    } : null;
  }).catch(() => null);
}
if (!auraBorn) {
  const diag = await page.evaluate(() => {
    const g = window.__swGame;
    const pr = g.entities.npcs.find((n) => n.vanillaId === 663);
    return { npcs: g.entities.npcs.length, enemies: g.entities.enemies.length,
      prState: pr?.attackState, prFacing: pr?.facing, prX: pr?.x, prY: pr?.y, errors: 1 };
  }).catch(() => null);
  console.log('NO-AURA', JSON.stringify({ setup, diag, errors: errors.slice(0, 3) }));
  await browser.close();
  process.exit(2);
}

// 三帧截图：出生拍 / 中段(+0.35s) / 尾段(+0.7s)
const shots = [];
for (const [name, delayMs] of [['born', 0], ['mid', 350], ['tail', 700]]) {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const file = `/tmp/sw-bj33-aura-${name}.png`;
  await page.screenshot({ path: file });
  const sample = await page.evaluate(() => {
    const g = window.__swGame;
    const auras = g.entities.projectiles.filter((p) => p.projId === 950);
    const z = g.entities.enemies.find((e) => e.vanillaId === 3);
    const d267 = (g.vanillaDustCount ?? null);
    return {
      auras: auras.map((a) => ({ alive: !a.dead, t: a.t, opacity: +a.opacity.toFixed(3), scl: +a.scl.toFixed(3), sclInner: +a.sclInner.toFixed(3) })),
      zombieHp: z ? z.hp : null, zombieAlive: z ? !z.dead : null,
      dustPool: (() => { try { return g.dust?.activeCount ?? null; } catch { return null; } })(),
      d267,
    };
  }).catch(() => null);
  shots.push({ name, file, sample });
}

// 5s 后总结：阵总数 / 敌 HP 轨 / 命中面
await new Promise((r) => setTimeout(r, 3000));
const final = await page.evaluate(() => {
  const g = window.__swGame;
  const z = g.entities.enemies.find((e) => e.vanillaId === 3);
  return {
    totalAuras: g.entities.projectiles.filter((p) => p.projId === 950).length,
    aliveAuras: g.entities.projectiles.filter((p) => p.projId === 950 && !p.dead).length,
    zombieHp: z ? z.hp : null, zombieAlive: z ? !z.dead : null,
    princessAlive: !!(g.entities.npcs.find((n) => n.vanillaId === 663 && !n.dead)),
  };
}).catch(() => null);
console.log('BJ33-PROBE', JSON.stringify({ setup, auraBorn, shots, final, pageErrors: errors.slice(0, 3) }, null, 1));
await browser.close();
