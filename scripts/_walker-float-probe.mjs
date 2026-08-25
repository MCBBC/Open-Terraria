// 行走怪"贴顶漂浮/弹射入屏"诊断探针（2026-08-25 用户报：僵尸等地面行走怪偶发
// 贴着方块顶部走路像飞 + 偶发从屏幕外被弹射快速抛入画面）。
// 世界=用户报障存档同参（seed 12345 小世界，生成确定性=同地形）；玩家传送到
// 报障坐标（tile 1920,249）。批量生成僵尸（vid 3）跑自然 AI，逐 tick 遥测：
//   - 传送事件：单 tick |Δ|≥12px（行走速度~1px/tick、击退先改速度≤5px/tick、
//     StepUp/Down≤17px 且先有速度——≥12px 瞬移只可能来自 TileCollision.unembedPass）
//   - 漂浮行走：onGround 且 vx≠0 且脚下支承面间隙>6px 持续≥6 tick（斜面按对角线算）
//   - 事件时 dump 7×6 tile 上下文（#/H/=/\/\ + type id）定位机制
// 另附两个受控实验直接验证 unembedPass 假设：
//   E1 坡面上方压实心（爬坡中段中心格进实心）→ 预期被抬升到盖板上
//   E2 中心格嵌入实心出生 → 预期被弹起/平移
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_walker-float-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5231', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// ---------- 放置僵尸 + 遥测泵（页内跑，主循环暂停避免双驱动） ----------
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = true;                       // 探针自泵，停 rAF 驱动防双步进
  g.player.x = 30720; g.player.y = 3900; g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.0;         // 深夜
});
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const st = g.world.store;
  const surfaceY = (tx, fromTy) => {
    for (let ty = fromTy; ty < fromTy + 80; ty++) {
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return ty;
    }
    return -1;
  };
  const px0 = 1920, py0 = 249;           // 报障玩家区
  const spawned = [];
  const offsets = [0, -8, 12, -20, 26, -34, 40, -48, 55, -62];
  for (const dx of offsets) {
    const tx = px0 + dx;
    const ty = surfaceY(tx, py0 - 60);
    if (ty < 0) continue;
    const e = Enemy.fromVanilla(3, tx * 16 + 8, (ty - 3) * 16);
    if (!e) continue;
    e.x = tx * 16 + 8 - e.w / 2;
    e.y = ty * 16 - e.h - 1;
    g.entities.add(e, 'enemies');
    spawned.push({ id: e.id, tx, ty });
  }
  window.__floatTel = { last: new Map(), events: [], ticks: 0 };
  return { spawned, count: spawned.length };
});

// ---------- 遥测泵：6 段 × 900 tick（90s 游戏时） ----------
for (let chunk = 0; chunk < 6; chunk++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const tel = window.__floatTel;
    const st = g.world.store;
    const TILE = 16;
    const supportTop = (e) => {
      // 脚下支承面：从脚底行向下 ≤3 行，首格 solid/half/platform → 顶面 px；
      // 斜面格按中心 x 的对角线高度
      const feet = e.y + e.h;
      const row = Math.floor(feet / TILE);
      const cx = e.x + e.w / 2;
      for (let ty = row; ty <= row + 3; ty++) {
        const tx = Math.floor(cx / TILE);
        if (!st.inBounds(tx, ty)) continue;
        const i = st.idx(tx, ty);
        const solid = st.isSolid(tx, ty), half = !!st.half[i], plat = st.isPlatform(tx, ty), sl = st.slope[i];
        if (!solid && !plat) continue;
        if (sl === 1) return ty * TILE + (cx - tx * TILE);
        if (sl === 2) return ty * TILE + (tx * TILE + TILE - cx);
        if (half) return ty * TILE + 8;
        return ty * TILE;
      }
      return Infinity;
    };
    const dump = (e) => {
      const cxT = Math.floor((e.x + e.w / 2) / TILE), cyT = Math.floor((e.y + e.h / 2) / TILE);
      const rows = [];
      for (let ty = cyT - 3; ty <= cyT + 2; ty++) {
        let s = '';
        for (let tx = cxT - 3; tx <= cxT + 3; tx++) {
          if (!st.inBounds(tx, ty)) { s += ' '; continue; }
          const i = st.idx(tx, ty);
          if (!st.flags[i]) { s += '.'; continue; }
          if (st.slope[i] === 1) s += '/';
          else if (st.slope[i] === 2) s += '\\';
          else if (st.half[i]) s += 'H';
          else if (st.isPlatform(tx, ty)) s += '=';
          else if (st.isSolid(tx, ty)) s += '#';
          else s += `<${st.type[i]}>`;
        }
        rows.push(`${ty}:${s}`);
      }
      return rows.join(' | ');
    };
    const zs = g.entities.enemies.filter((e) => e.vanillaId === 3 && !e.dead);
    for (let t = 0; t < 900; t++) {
      tel.ticks++;
      for (const e of zs) {
        const px = e.x, py = e.y, vyPre = e.vy;
        e.fixedUpdate(1 / 60, g);
        const dx = e.x - px, dy = e.y - py;
        const key = e.id;
        const prev = tel.last.get(key) ?? { x: e.x, y: e.y, floatN: 0 };
        // 传送事件（带归因：瞬移前中心格实心性 + vy 是否保留——StepUp 不动速度、
        // unembed①/slopeCollide 会清 vy）
        if (Math.hypot(dx, dy) >= 12) {
          const pcx = Math.floor((px + e.w / 2) / TILE), pcy = Math.floor((py + e.h / 2) / TILE);
          const pci = st.inBounds(pcx, pcy) ? st.idx(pcx, pcy) : -1;
          const centerWasSolid = pci >= 0 && st.flags[pci] ? st.isSolid(pcx, pcy) : false;
          const centerType = pci >= 0 && st.flags[pci] ? st.type[pci] : -1;
          tel.events.push({
            kind: 'teleport', tick: tel.ticks, id: e.id,
            from: [Math.round(px), Math.round(py)], to: [Math.round(e.x), Math.round(e.y)],
            vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), vyPre: +vyPre.toFixed(2),
            onG: e.onGround, centerWasSolid, centerType, ctx: dump(e),
          });
        }
        // 漂浮行走
        const gap = (e.y + e.h) - supportTop(e);
        if (e.onGround && Math.abs(e.vx) > 0.05 && gap > 6 && !e.dead) {
          prev.floatN++;
          if (prev.floatN === 6) {
            tel.events.push({
              kind: 'floatwalk', tick: tel.ticks, id: e.id,
              at: [Math.round(e.x), Math.round(e.y)], gap: +gap.toFixed(1),
              vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), ctx: dump(e),
            });
          }
        } else prev.floatN = 0;
        tel.last.set(key, prev);
      }
      g.postUpdate ? g.postUpdate(1 / 60) : null;
    }
  });
}

// ---------- 受控实验 ----------
const exp = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const TILE = 16;
  const out = {};
  // E1：坡面上方压实心——僵尸从左侧平地走向 slope1（左高右低），坡顶上方一格是盖板
  {
    const bx = 1700, by = 300;   // 远离报障区的平坦化场地
    for (let x = bx - 8; x <= bx + 8; x++) for (let y = by - 6; y <= by + 3; y++) st.setTile(x, y, 0);
    for (let x = bx - 8; x <= bx + 8; x++) st.setTile(x, by + 1, 1);       // 地板
    st.setTile(bx + 1, by, 1); st.setTile(bx + 1, by - 1, 1);              // 右侧 2 高墙
    st.setTile(bx, by, 1); st.slope[st.idx(bx, by)] = 1;                   // 墙脚 slope1（左高右低→右行上坡）
    st.setTile(bx, by - 1, 1); st.setTile(bx + 1, by - 2, 1);              // ★坡上/墙上的盖板（净空封死）
    const e = Enemy.fromVanilla(3, (bx - 5) * 16, (by + 1) * 16 - 42);
    e.x = (bx - 5) * 16; e.y = (by + 1) * 16 - e.h - 1;
    g.entities.add(e, 'enemies');
    g.player.x = (bx + 6) * 16; g.player.y = (by - 4) * 16;   // 引其右行
    const trace = [];
    for (let t = 0; t < 600; t++) {
      const px = e.x, py = e.y;
      e.fixedUpdate(1 / 60, g);
      if (Math.hypot(e.x - px, e.y - py) >= 12) trace.push({ t, from: [Math.round(px), Math.round(py)], to: [Math.round(e.x), Math.round(e.y)] });
      if (e.dead) break;
    }
    out.e1 = { trace, finalY: Math.round(e.y), feetRow: Math.floor((e.y + e.h) / 16), by };
    e.dead = true;
  }
  // E2：中心格嵌入实心出生
  {
    const bx = 1780, by = 300;
    for (let x = bx - 6; x <= bx + 6; x++) for (let y = by - 6; y <= by + 3; y++) st.setTile(x, y, 0);
    for (let x = bx - 6; x <= bx + 6; x++) st.setTile(x, by + 1, 1);
    st.setTile(bx, by, 1); st.setTile(bx, by - 1, 1);   // 嵌入柱
    const e = Enemy.fromVanilla(3, bx * 16, (by - 1) * 16);
    e.x = bx * 16 - e.w / 2 + 8; e.y = (by - 1) * 16;   // 中心格 = (bx, by-1) 实心
    g.entities.add(e, 'enemies');
    const trace = [];
    for (let t = 0; t < 300; t++) {
      const px = e.x, py = e.y;
      e.fixedUpdate(1 / 60, g);
      if (Math.hypot(e.x - px, e.y - py) >= 12) trace.push({ t, from: [Math.round(px), Math.round(py)], to: [Math.round(e.x), Math.round(e.y)] });
      if (e.dead) break;
    }
    out.e2 = { trace, finalY: Math.round(e.y) };
    e.dead = true;
  }
  return out;
});

const result = await page.evaluate(() => {
  const tel = window.__floatTel;
  return { events: tel.events.slice(0, 40), total: tel.events.length, ticks: tel.ticks };
});

console.log('spawned:', JSON.stringify(setup));
console.log('ticks pumped:', result.ticks, 'events total:', result.total);
for (const ev of result.events) {
  console.log(`\n[${ev.kind}] tick=${ev.tick} id=${ev.id}`);
  if (ev.kind === 'teleport') console.log(`  ${JSON.stringify(ev.from)} -> ${JSON.stringify(ev.to)} v=(${ev.vx},${ev.vy}) onG=${ev.onG}`);
  else console.log(`  at ${JSON.stringify(ev.at)} gap=${ev.gap} v=(${ev.vx},${ev.vy})`);
  console.log('  ctx:', ev.ctx);
}
console.log('\n=== 受控实验 ===');
console.log('E1 坡上盖板:', JSON.stringify(exp.e1));
console.log('E2 嵌入出生:', JSON.stringify(exp.e2));
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
