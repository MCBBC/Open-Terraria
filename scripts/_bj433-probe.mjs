// ★BJ433 实机验证（v4）：捣蛋猫帮工链全链——天然树场景。
// 关键机制定谳：Track 只在「破块后 60t 窗内打到活格」才记录（Player.cs:46142 破块
// 开窗→后续击打 Track；空格击不入分派 = :46038 active() 早退,原版同构）→ 玩家侧
// 动态扫瞄（破块即移准星到上一活干格,真实玩家挥砍轨迹同相）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const EV = '/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/bj433';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1200));
// ack 欢迎覆层（WelcomeAnnounce——不 ack 会拦画布点击+挡证据截图）
{
  for (let i = 0; i < 3; i++) {
    const acked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (!acked) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
    return !!btn;
  }).then((still) => { if (still) console.log('[warn] welcome overlay still present'); });
}

// ---- 场景：找天然树（底格+正下实心+上方≥2 干格），玩家站旁 ----
const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  g.setupDevMode();
  const items = window.__swItems;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const isTrunk = (x, y) => {
    if (!st.inBounds(x, y)) return false;
    const d = TILE_DEFS[st.get(x, y)];
    return !!(d && d.vanilla && d.vanilla.sheet === 5);
  };
  const p0x = g.world.spawnX, p0y = g.world.spawnY;
  // 收集全部天然树底格（正下实心+上方≥2 干格）
  const trees = [];
  for (let dx = -160; dx <= 160; dx++) {
    for (let y = Math.floor(p0y) - 24; y <= Math.floor(p0y) + 10; y++) {
      const col = Math.floor(p0x) + dx;
      if (isTrunk(col, y) && !isTrunk(col, y + 1) && st.isSolid(col, y + 1)
        && isTrunk(col, y - 1) && isTrunk(col, y - 2)) {
        if (!trees.some((t) => t.x === col)) trees.push({ x: col, y });
      }
    }
  }
  // 找一对间隔 ≤12 格的树（玩家站中间,双树都在挥砍可达域外沿——靠移动准星）
  let pair = null;
  for (let i = 0; i < trees.length && !pair; i++) {
    for (let j = i + 1; j < trees.length; j++) {
      const a = trees[i], b = trees[j];
      if (Math.abs(a.x - b.x) <= 16 && Math.abs(a.y - b.y) <= 3) { pair = [a, b]; break; }
    }
  }
  if (!pair) return { fail: 'no tree pair within 12 tiles', trees: trees.length };
  const midCol = Math.round((pair[0].x + pair[1].x) / 2);
  const groundY = Math.max(pair[0].y, pair[1].y) + 1;
  let spot = null;
  for (const px of [midCol, midCol - 1, midCol + 1, midCol - 2, midCol + 2]) {
    let gy = groundY - 3;
    while (gy < st.h - 1 && !st.isSolid(px, gy + 1)) gy++;
    if (Math.abs(gy - groundY) <= 2 && st.inBounds(px, gy - 3)) { spot = { col: px, groundRow: gy }; break; }
  }
  if (!spot) return { fail: 'no standing spot between tree pair' };
  const axeKey = Object.keys(items).find((k) => /^vi_3506_/.test(k));
  const pickKey = Object.keys(items).find((k) => /^vi_3509_/.test(k));
  const cattivaKey = Object.keys(items).find((k) => /^vi_5663_/.test(k));
  const inv = g.player.inv;
  inv.slots[3] = { id: items[cattivaKey], stack: 1 };
  inv.slots[4] = { id: items[axeKey], stack: 1 };
  inv.slots[5] = { id: items[pickKey], stack: 1 };
  const p = g.player;
  p.x = spot.col * 16 + 8 - p.w / 2;
  p.y = spot.groundRow * 16 - p.h;
  p.vx = 0; p.vy = 0;
  window.__S = spot.col + (spot.col < pair[0].x ? 1 : -1);
  window.__base = spot.groundRow;
  return {
    ok: true, trees: pair, spot,
    alive1: st.hasTile(pair[0].x, pair[0].y),
    alive2: st.hasTile(pair[1].x, pair[1].y),
  };
});
console.log('[prep]', JSON.stringify(prep));
if (prep.fail) { await browser.close(); process.exit(1); }

// 玩家钉扎 + 高频大半径清怪（先钉,相机随玩家走）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const px = p.x, py = p.y;
  window.__pin = setInterval(() => {
    p.x = px; p.y = py; p.vx = 0; p.vy = 0;
    for (const e of g.enemies?.() ?? []) {
      if (Math.hypot(e.cx - px, e.cy - py) < 2000) { e.hp = 0; e.dead = true; }
    }
  }, 50);
});
// 相机落定
for (let i = 0; i < 30; i++) {
  const k1 = await page.evaluate(() => { const c = window.__swGame.camera; return `${Math.round(c.x)},${Math.round(c.y)}`; });
  await new Promise((r) => setTimeout(r, 200));
  const k2 = await page.evaluate(() => { const c = window.__swGame.camera; return `${Math.round(c.x)},${Math.round(c.y)}`; });
  if (k1 === k2 && i > 3) break;
}

// ---- 召唤猫：input 电平直注入（绕开 DOM 命中面）----
let summon = { fail: 'no 1093' };
for (let attempt = 0; attempt < 6; attempt++) {
  await page.evaluate(() => { window.__swGame.player.inv.selected = 3; });
  await page.evaluate(() => {
    const g = window.__swGame;
    const inp = g.input;
    const p = g.player;
    const [sx, sy] = g.camera.worldToScreen(p.cx + 40, p.cy);
    inp.mouseX = sx; inp.mouseY = sy;
    inp.mouseDown = true; inp.mouseHeld = true;
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => {
    const inp = window.__swGame.input;
    inp.mouseDown = false; inp.mouseHeld = false;
  });
  await new Promise((r) => setTimeout(r, 600));
  summon = await page.evaluate(async () => {
    const { BuffType } = await import('/src/stats/Buffs.ts');
    const g = window.__swGame;
    const m = g.entities.projectiles.find((p) => p.projId === 1093 && !p.dead);
    return m ? { ok: true } : { fail: 'no 1093', buffSec: g.player.buffs.active.get(BuffType.PalworldMinionCattiva) ?? null };
  });
  if (summon.ok) break;
}
console.log('[summon]', JSON.stringify(summon));
if (summon.fail) { await browser.close(); process.exit(1); }

// ---- 工具 ----
const setAim = (t) => page.evaluate((a) => { window.__aim = a; }, t);
const toScreen = async (t) => {
  return await page.evaluate((a) => {
    const [sx, sy] = window.__swGame.camera.worldToScreen(a.x * 16 + 8, a.y * 16 + 8);
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { sx: r.x + sx, sy: r.y + sy };
  }, t);
};
const startSampler = () => page.evaluate(() => {
  window.__samples = { intention: [], a0: [], catPos: [], catDeath: null, buffSec: [] };
  window.__sampler = setInterval(() => {
    const g = window.__swGame;
    const ig = g.intentionGuesser;
    const m = g.entities.projectiles.find((p) => p.projId === 1093 && !p.dead);
    window.__samples.intention.push(ig ? ig.intention : -1);
    window.__samples.a0.push(m ? m.palA0 : -1);
    window.__samples.catPos.push(m ? `${Math.round(m.cx)},${Math.round(m.cy)}` : '');
    if (!m && !window.__samples.catDeath) {
      const any = g.entities.projectiles.find((p) => p.projId === 1093);
      const near = (g.enemies?.() ?? []).filter((e) => !e.dead && Math.hypot(e.cx - g.player.cx, e.cy - g.player.cy) < 400).length;
      window.__samples.catDeath = {
        anyLeft: !!any, anyDead: any ? any.dead : null,
        enemiesNear: near, t: performance.now(),
      };
    }
  }, 100);
});
const stopSampler = async () => {
  await page.evaluate(() => clearInterval(window.__sampler));
  return await page.evaluate(() => window.__samples);
};

// ---- Phase A：斧 + 动态扫瞄（破块即上移到上一活干格）----
{
  await page.evaluate(() => {
    window.__mineCount = 0; window.__addCount = 0; window.__addLog = [];
    const g = window.__swGame;
    const orig = g.tryMine.bind(g);
    g.tryMine = (tx, ty, ...rest) => {
      window.__mineCount++;
      return orig(tx, ty, ...rest);
    };
    const ht = g.hitTiles;
    const origAdd = ht.addDamage.bind(ht);
    ht.addDamage = (x, y, d, ...rest) => {
      window.__addCount++;
      if (window.__addLog.length < 20) window.__addLog.push([x, y, d]);
      return origAdd(x, y, d, ...rest);
    };
  });
  let aim = { ...prep.trees[0] };
  await setAim(aim);
  await page.evaluate(() => { window.__swGame.player.inv.selected = 4; });
  let s = await toScreen(aim);
  await page.mouse.move(s.sx, s.sy);
  await page.mouse.down();
  await startSampler();
  const sweepStart = Date.now();
  let retargets = 0;
  const pollLog = [];
  while (Date.now() - sweepStart < 40000) {
    await new Promise((r) => setTimeout(r, 250));
    const curAlive = await page.evaluate((t) => window.__swGame.world.store.hasTile(t.x, t.y), aim);
    pollLog.push([Math.round((Date.now() - sweepStart) / 100) / 10, aim.x, aim.y, curAlive ? 1 : 0]);
    if (!curAlive) {
      const nextTree = prep.trees[retargets + 1] || prep.trees.find((t) => t.x !== aim.x);
      if (!nextTree) break;                        // 没有下一棵
      aim = { ...nextTree };
      retargets++;
      await setAim(aim);
      s = await toScreen(aim);
      await page.mouse.move(s.sx, s.sy);
      if (retargets >= 2) break;                   // 两棵都倒了
    }
  }
  await page.mouse.up();
  const samples = await stopSampler();
  const mineDiag = await page.evaluate(() => ({ mineCount: window.__mineCount, addCount: window.__addCount, addLog: window.__addLog }));
  const sumA = {
    retargets, ...mineDiag,
    harvestTreesSamples: samples.intention.filter((v) => v === 2).length,
    a0dist: samples.a0.reduce((m, v) => { m[v] = (m[v] ?? 0) + 1; return m; }, {}),
    catSamples: samples.catPos.filter((x) => x).length,
    catDeath: samples.catDeath,
  };
  console.log('[phaseA-summary]', JSON.stringify(sumA));
  await page.screenshot({ path: `${EV}/bj433-tree-phase.png` });
}

// ---- Phase B：镐 + 动态扫瞄（破块即横移到下一活土格）----
{
  const dir = prep.spot.col < prep.trees[0].x ? 1 : -1;
  // 扫描玩家两侧地表行第一活格（phase A 后树区地面可能已变）
  let aim = await page.evaluate((a) => {
    const st = window.__swGame.world.store;
    const candidates = [];
    for (let d = 1; d <= 8; d++) {
      candidates.push({ x: a.col + d * a.dir, y: a.groundRow }, { x: a.col - d * a.dir, y: a.groundRow });
    }
    const hit = candidates.find((t) => st.inBounds(t.x, t.y) && st.hasTile(t.x, t.y));
    return hit ?? { x: a.col + a.dir, y: a.groundRow };
  }, { col: prep.spot.col, dir, groundRow: prep.spot.groundRow });
  await setAim(aim);
  await setAim(aim);
  await page.evaluate(() => { window.__swGame.player.inv.selected = 5; });
  let s = await toScreen(aim);
  await page.mouse.move(s.sx, s.sy);
  await page.mouse.down();
  await startSampler();
  const sweepStart = Date.now();
  let retargets = 0;
  while (Date.now() - sweepStart < 18000) {
    await new Promise((r) => setTimeout(r, 250));
    const curAlive = await page.evaluate((t) => window.__swGame.world.store.hasTile(t.x, t.y), aim);
    if (!curAlive) {
      const next = { x: aim.x + dir, y: aim.y };
      const nextAlive = await page.evaluate((t) => window.__swGame.world.store.hasTile(t.x, t.y), next);
      if (!nextAlive) break;
      aim = next;
      retargets++;
      await setAim(aim);
      s = await toScreen(aim);
      await page.mouse.move(s.sx, s.sy);
    }
  }
  await page.mouse.up();
  const samples = await stopSampler();
  const sumB = {
    retargets,
    harvestTreasureSamples: samples.intention.filter((v) => v === 1).length,
    a0dist: samples.a0.reduce((m, v) => { m[v] = (m[v] ?? 0) + 1; return m; }, {}),
  };
  console.log('[phaseB-summary]', JSON.stringify(sumB));
  await page.screenshot({ path: `${EV}/bj433-pick-phase.png` });
  const close = await page.evaluate(() => {
    const g = window.__swGame;
    const m = g.entities.projectiles.find((p) => p.projId === 1093 && !p.dead);
    const mx = m ? m.cx : g.player.cx, my = m ? m.cy : g.player.cy;
    const [sx, sy] = g.camera.worldToScreen(mx - 80, my - 80);
    return { x: Math.max(0, sx), y: Math.max(0, sy) };
  });
  await page.screenshot({ path: `${EV}/bj433-cattiva-closeup.png`, clip: { x: close.x, y: close.y, width: 260, height: 220 } });
}

await page.evaluate(() => clearInterval(window.__pin));
await browser.close();
console.log('done', errs.length ? `pageErrors=${JSON.stringify(errs)}` : 'no page errors');
