// IIII235 圣骑士 290 攻击 AI+特效全量对账探针（2026-09-10）
// A) 相状态机：开瞄→掷锤循环 30t 周期 + FindFrame 帧行断言（9/10/11 瞄准相窗、
//    行走带 2..8 不越界）
// B) 锤 300 物理：age<60 直线（vy 恒）、>=60 vy+=0.2/vx*=0.99、vy≤32、rot 滚转、
//    life=3600、命中玩家穿透不消亡（Damage_EVP 无 Kill）
// C) 死亡特效：10×尘16 scale1.5 noGravity + gore 11-13 ×3 + NPCDeath6/Item1 音
// D) 碰撞缩盒 cHeight=40：3 格高走廊（48px）可通行、2 格（32px）不可通行
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const g = window.__swGame;
  const st = g.world.store;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { vanillaFrameIdx } = await import('/src/render/Renderer.ts');
  const { canHit } = await import('/src/physics/LineOfSight.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const dirt = tilesMod.TILE_BY_KEY['dirt'];
  const stone = tilesMod.TILE_BY_KEY['stone'] ?? dirt;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 16;
  const res = { warnings: [] };

  // ---- 场地：出生点下方找平地,清 90×24 工作区 ----
  const Y = Math.floor(g.world.groundLevel) + 2;
  const X0 = g.world.spawnX;
  for (let dy = -18; dy <= -1; dy++) for (let dx = -50; dx <= 50; dx++) {
    if (st.inBounds(X0 + dx, Y + dy) && st.get(X0 + dx, Y + dy) !== 0) st.setTile(X0 + dx, Y + dy, 0, 0, 0);
  }
  for (let dx = -50; dx <= 50; dx++) st.setTile(X0 + dx, Y, dirt, 0, 0);

  const p = g.player;
  p.debugGod = true;                        // 圣锤 60 伤×穿透会杀 100hp 新号

  // ---- 音效/尘 spy ----
  const sfxLog = [];
  for (const key of ['playSfx', 'playSfxFiles', 'playSfxFile', 'playSfxAt', 'playSfxWav']) {
    if (typeof g[key] === 'function') {
      const orig = g[key].bind(g);
      g[key] = (...a) => { sfxLog.push({ ch: key, name: String(a[0]).slice(0, 40) }); return orig(...a); };
    }
  }
  const dustLog = [];
  const oSpawnDust = g.spawnDust?.bind(g);
  if (oSpawnDust) {
    g.spawnDust = (...a) => {
      const d = oSpawnDust(...a);
      if (d && a[4] === 16) dustLog.push({ type: a[4], scale: d.scale, noGravity: d.noGravity, vx: d.vx, vy: d.vy });
      return d;
    };
  } else res.warnings.push('no spawnDust hook');

  const groundYpx = Y * TILE;
  const spawnPaladin = (px) => {
    const e = Enemy.fromVanilla(290, px, groundYpx - 62);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    e.hp = e.maxHp;
    return e;
  };
  const removeEnemy = (e) => { const arr = g.entities.enemies; const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); };
  const clearHammer = () => { g.entities.projectiles = g.entities.projectiles.filter((pr) => pr.projId !== 300); };
  const hammers = () => g.entities.projectiles.filter((pr) => pr.projId === 300 && !pr.dead);

  // =============== A) 相状态机 + 帧行 ===============
  {
    p.x = (X0 - 20) * TILE; p.y = groundYpx - p.h; p.vx = 0; p.vy = 0;
    clearHammer();
    sfxLog.length = 0;
    const e = spawnPaladin((X0 + 1) * TILE + 300 - 17);
    await sleep(400);
    // 逐 60ms 采样 ai1/ai2/帧行（60Hz 游戏拍,采样窗 ~2s = 2 个 30t 周期）
    const frames = e.vanilla?.frames ?? 12;
    const seq = [];
    const throws = [];
    let lastHammerN = hammers().length;
    let hammerSpawnAges = [];
    for (let i = 0; i < 40; i++) {
      await sleep(60);
      const hs = hammers();
      if (hs.length > lastHammerN) {
        hammerSpawnAges = hammerSpawnAges.concat(hs.filter((h) => h.age === 0 || h.age === 1).map((h) => h.age));
      }
      lastHammerN = hs.length;
      seq.push({ ai1: e.ai1, ai2: e.ai2, row: vanillaFrameIdx(e, frames), onG: e.onGround, vx: +e.vx.toFixed(2) });
      if (seq.length > 1 && e.ai1 > seq[seq.length - 2].ai1) throws.push(i);   // ai1 回满=新周期
    }
    // 帧行断言：ai2>0 时 row ∈ {9,10,11} 且映射窗正确（ai1>=20→9、10..19→10、<10→11）
    let aimRows = new Set(), rowWindowOk = true;
    for (const s of seq) {
      if (s.ai2 > 0) {
        aimRows.add(s.row);
        const expect = s.ai1 < 10 ? 11 : s.ai1 < 20 ? 10 : 9;
        if (s.row !== expect) rowWindowOk = false;
      }
    }
    res.A = {
      aimSeen: aimRows.size > 0, aimRows: [...aimRows].sort(), rowWindowOk,
      rowsAll: [...new Set(seq.map((s) => s.row))].sort(),
      ai2Vals: [...new Set(seq.map((s) => s.ai2))].sort((a, b) => a - b).slice(0, 8),
      throwCount: throws.length + (hammerSpawnAges.length ?? 0),
      hammerBorn: hammers().length,
      hammerAges: hammerSpawnAges,
      frameCount: frames,
    };
    removeEnemy(e);
    clearHammer();
  }

  // =============== B) 锤 300 物理（轨迹逐拍采样） ===============
  {
    p.x = (X0 - 20) * TILE; p.y = groundYpx - p.h; p.vx = 0; p.vy = 0;
    clearHammer();
    sfxLog.length = 0;
    const e = spawnPaladin((X0 + 1) * TILE + 260 - 17);
    await sleep(500);
    const hs = hammers();
    res.B_spawned = hs.length;
    const h = hs[hs.length - 1];
    if (h) {
      const life0 = h.life + h.age;   // life 每 tick −1 → 出生值 = 当前 + age（原版 timeLeft 3600）
      const traj = [];
      for (let i = 0; i < 100; i++) {
        await sleep(50);
        if (h.dead) break;
        traj.push({ age: h.age, vx: +h.vx.toFixed(3), vy: +h.vy.toFixed(3), rot: +h.rot.toFixed(2), x: +h.x.toFixed(1), y: +h.y.toFixed(1) });
      }
      const pre = traj.filter((s) => s.age < 60);
      const post = traj.filter((s) => s.age >= 60);
      const vyConstPre = pre.every((s) => Math.abs(s.vy - pre[0].vy) < 0.01);
      const vyGrowPost = post.length > 3 && post[post.length - 1].vy > post[0].vy + 0.2 * (post[post.length - 1].age - post[0].age) * 0.6;
      const vxCaps = traj.every((s) => Math.abs(s.vy) <= 32.001);
      const vxShrinkPost = post.length > 3 && Math.abs(post[post.length - 1].vx) < Math.abs(post[0].vx);
      const rotAdvancing = traj.length > 5 && traj[traj.length - 1].rot !== traj[0].rot;
      // 穿透:玩家在弹道上,锤穿过玩家盒(玩家 god,不受伤但 iframes 照写)后仍活
      const passesPlayer = h.y + h.h > p.y && h.y < p.y + p.h
        ? (h.x + h.w > p.x - 24 && h.x < p.x + p.w + 24) || Math.abs(h.x - p.x) > 40 : null;
      res.B = {
        life0, expect3600: life0 === 3600,
        samples: traj.length, firstAge: traj[0]?.age, lastAge: traj[traj.length - 1]?.age,
        vyConstPre, vyGrowPost, vxCaps, vxShrinkPost, rotAdvancing,
        dead: !!h.dead, nearPlayerSeen: passesPlayer,
        vyFirst: pre[0]?.vy, vyLast: traj[traj.length - 1]?.vy,
        vxPre: pre[0]?.vx, vxLast: traj[traj.length - 1]?.vx,
        item1Sfx: sfxLog.some((s) => /Item_?1\b|Item_1/.test(s.name)),
        sfxNames: [...new Set(sfxLog.map((s) => s.name))].slice(0, 10),
      };
    }
    removeEnemy(e);
    clearHammer();
  }

  // =============== C) 死亡特效（尘16/gore/音） ===============
  {
    clearHammer();
    sfxLog.length = 0; dustLog.length = 0;
    const e = spawnPaladin((X0 + 6) * TILE);
    await sleep(400);
    const goreBefore = g.entities.gore?.length ?? g.entities.particles?.length ?? -1;
    e.hurt(99999, 1, 0, g);
    await sleep(400);
    const d16 = dustLog.filter((d) => d.type === 16);
    res.C = {
      dust16Count: d16.length,
      dust16NoGravity: d16.every((d) => d.noGravity),
      dust16ScaleMin: d16.length ? Math.min(...d16.map((d) => d.scale)) : null,
      dust16ScaleMax: d16.length ? Math.max(...d16.map((d) => d.scale)) : null,
      dust16VelX2: d16.length ? d16.every((d) => Math.abs(d.vx) + Math.abs(d.vy) > 0.5) : null,
      deathSfx: [...new Set(sfxLog.map((s) => s.name))].slice(0, 8),
    };
  }

  // =============== D) 碰撞缩盒：3 格走廊可通 / 2 格不可通（AI 行走驱动） ===============
  // 玩家放 >900px 远（超开瞄抖动包络 ~770px）→ 全程无瞄相,圣骑士持续行走
  const corridor = (gapH) => {
    // 墙厚 3 格,高 14,底 gapH 格开口（行 Y-gapH..Y-1 为空）
    const wx = X0 + 8;
    for (let dy = -14; dy <= -1; dy++) for (let dx = 0; dx <= 2; dx++) {
      st.setTile(wx + dx, Y + dy, dy >= -gapH ? 0 : stone, 0, 0);
    }
    return wx;
  };
  const clearCorridor = (wx) => {
    for (let dy = -14; dy <= -1; dy++) for (let dx = -1; dx <= 3; dx++) st.setTile(wx + dx, Y + dy, 0, 0, 0);
  };
  const walkScene = async (gapH) => {
    p.x = (X0 - 40) * TILE; p.y = groundYpx - p.h; p.vx = 0; p.vy = 0;
    clearHammer();
    const wx = corridor(gapH);
    const e = spawnPaladin((X0 + 20) * TILE);
    e.x = (X0 + 20) * TILE; e.y = groundYpx - e.h;
    const x0 = e.cx;
    for (let i = 0; i < 400; i++) { await sleep(60); if (e.dead) break; }
    return { e, wx, x0 };
  };
  // D1: 3 格开口（48px > 40px 缩盒）→ 走过墙（cx < 墙左缘 40 行像素）
  {
    const { e, wx, x0 } = await walkScene(3);
    res.D1 = {
      gap: 3, boxH: e.h, inset: e.collTopInset ?? null,
      movedFrom: Math.round(x0), to: Math.round(e.cx), wallLeft: wx * TILE,
      crossed: e.cx < wx * TILE - 8,
      onGround: e.onGround, y: Math.round(e.y),
    };
    removeEnemy(e); clearCorridor(wx);
  }
  // D2: 2 格开口（32px < 40px 缩盒）→ 被挡在墙右缘
  {
    const { e, wx } = await walkScene(2);
    res.D2 = {
      gap: 2, movedTo: Math.round(e.cx), wallRightEdge: (wx + 3) * TILE,
      blocked: e.cx >= (wx + 3) * TILE - 1, onGround: e.onGround, y: Math.round(e.y),
    };
    removeEnemy(e); clearCorridor(wx);
  }

  // 场地还原
  for (let dy = -18; dy <= 0; dy++) for (let dx = -50; dx <= 50; dx++) {
    if (st.inBounds(X0 + dx, Y + dy)) st.setTile(X0 + dx, Y + dy, dy === 0 ? dirt : 0, 0, 0);
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
