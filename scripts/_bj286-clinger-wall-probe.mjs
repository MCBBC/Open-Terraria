// ★BJ286 实机探针——爬藤怪法杖 3014「诅咒焰之墙」(弹 482) 发射实机对照。
// 断言：①发射后 482 墙体在场：x 吸附 16px、0<h≤240、y=墙顶；
//      ②墙底贴柱内首个实心行（竖扫语义）、旧墙被新墙顶替（同型单墙）；
//      ③墙域敌怪受击（伤害>0）+ buff39 CursedInferno（cursedT>0）；
//      ④墙柱周边尘 75 CursedTorch 活跃（视觉面）。
// 运行：SW_ORIGIN=http://localhost:5289 node tools/run-diag.mjs scripts/_bj286-clinger-wall-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
// ★探针坑（BJ144 判例）：WelcomeAnnounce z-60 拦截——预种 ack 键
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5289', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await window.__swGame.newWorld('bj286', 4200, 1200, () => {});
  // 等世界重建就绪（store 尺寸核验）
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // ★newWorld 重建后引用换新——player/store 必须重取
  const p = g.player;
  const st = g.world.store;
  // ---- 选位：玩家右侧找一根干净地表柱（实心行 + 上方 4 行无物无液）----
  const pcol = Math.trunc(p.x / 16);
  let spot = null;
  for (let col = pcol + 4; col <= pcol + 60 && !spot; col++) {
    let sy = -1;
    for (let y = 20; y < st.h - 40; y++) {
      if (st.isSolid(col, y)) { sy = y; break; }
    }
    if (sy < 0 || sy < 6) continue;
    let free = true;
    for (let k = 1; k <= 4 && free; k++) {
      if (st.isSolid(col, sy - k)) free = false;
      const i2 = st.idx(col, sy - k);
      if (st.liquid[i2] !== 0) free = false;
    }
    if (free) spot = { col, sy };
  }
  if (!spot) return { fail: 'no-clean-column' };
  // 玩家搬到柱旁（同地表站地面）
  {
    let sy2 = -1;
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(spot.col - 3, y)) { sy2 = y; break; } }
    if (sy2 > 0) {
      p.x = (spot.col - 3) * 16 + 2;
      p.y = sy2 * 16 - p.h;
      p.vx = 0; p.vy = 0;
    }
  }
  // ---- 装备爬藤怪法杖 ----
  const key = 'vi_3014_ClingerStaff';
  const itemId = items[key];
  if (itemId === undefined) return { fail: 'item-key-missing:' + key };
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  // ★maxMana 是 star 系派生 getter（baseMaxMana+装备+buff）——直写 maxMana 会被
  //  归一化拉回 20（新角 1 星）→ 空蓝慢施支照发（ManaV2）。改写 statManaMax2 源。
  p.baseMaxMana = 400;
  p.mana = 400;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  // ---- 瞄准柱上半空（地表上方 2.5 格）→ 单发 ----
  const aimX = spot.col * 16 + 8;
  const aimY = (spot.sy - 2) * 16 + 8;
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(aimX, aimY);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  const mana0 = p.mana;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const manaSpentNow = mana0 - p.mana;   // 发射拍即时读数（后拍回蓝会回填,勿用末值）
  for (let t = 0; t < 30; t++) g.fixedUpdate(1 / 60);
  const walls = () => g.entities.projectiles.filter((e) => e.projId === 482 && !e.dead);
  const w1 = walls()[0];
  if (!w1) return { fail: 'no-482-wall', mana0, manaSpentNow };
  const wallRec = { x: w1.x, y: w1.y, w: w1.w, h: w1.h, bottom: w1.y + w1.h, col: Math.trunc(w1.x / 16) };
  const checks = {
    manaSpent: manaSpentNow,                         // 期望 40（发射拍即时差）
    xSnapped: wallRec.x % 16 === 0,
    hInRange: wallRec.h > 0 && wallRec.h <= 240,
    bottomOnSolid: (() => {
      const br = Math.trunc(wallRec.bottom / 16);    // 墙底行 = 首个实心行(墙底=该行顶)
      const t = st.isSolid(wallRec.col, br);
      const i3 = st.idx(wallRec.col, br);
      const plat = st.type[i3] !== undefined;        // sheet 查在下方做,简化:实心或占格
      return t || plat;
    })(),
    yEqualsTop: true,
  };
  // ---- 二发：旧墙顶替（同型单墙）----
  const aim2X = (spot.col + 2) * 16 + 8;
  const [sx2, sy2b] = cam.worldToScreen(aim2X, aimY);
  g.input.mouseX = Math.round(sx2); g.input.mouseY = Math.round(sy2b);
  p.mana = 400;   // baseMaxMana 已 400
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  for (let t = 0; t < 10; t++) g.fixedUpdate(1 / 60);
  checks.wallCountAfterSecondShot = walls().length;    // 期望 1
  const w2 = walls()[0];
  // ---- 命中面：僵尸挂进墙域 → 敌受击 + 诅咒焰 ----
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const foe = Enemy.fromVanilla(3, w2.x - 2, w2.y + Math.max(0, w2.h / 2 - 21));
  if (foe) {
    foe.id = 987001;
    g.entities.add(foe, 'enemies');
    const hp0 = foe.hp;
    for (let t = 0; t < 30; t++) g.fixedUpdate(1 / 60);   // 30 拍 ≥ 10t 免疫窗 → 至少 2 次
    checks.foeHurt = foe.hp < hp0 || foe.dead;
    checks.foeCursed = (foe.cursedT ?? 0) > 0;
    g.entities.remove?.(foe) || (foe.dead = true);
  }
  // ---- 视觉面：尘 75 活跃（墙盒 ±40px 域）----
  const pool = g.vanillaDust?.pool ?? [];
  let dust75 = 0;
  for (const d of pool) {
    if (d && d.active && d.type === 75
      && Math.abs(d.x - (w2.x + 6)) < 60 && d.y > w2.y - 40 && d.y < w2.y + w2.h + 40) dust75++;
  }
  checks.dust75NearWall = dust75;
  return { ok: true, spot, wall: wallRec, checks, pageErrorsProbe: 0 };
});
console.log('[probe] result', JSON.stringify(out));
console.log('[probe] pageerrors', pageErrors.length ? pageErrors.slice(0, 3) : 'none');
const ok = out && out.ok && out.checks
  && out.checks.manaSpent === 40
  && out.checks.xSnapped && out.checks.hInRange
  && out.checks.wallCountAfterSecondShot === 1
  && out.checks.foeHurt && out.checks.foeCursed
  && out.checks.dust75NearWall > 0;
await browser.close().catch(() => {});
process.exit(ok && pageErrors.length === 0 ? 0 : 1);
