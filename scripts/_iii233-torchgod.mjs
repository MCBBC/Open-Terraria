// IIII233 探针②：火把神全流程（headless）
//   1. 触发门（Player.cs:18180 五条件：地下/冷却0/未解锁/点燃>100/无5043）
//   2. 攻击轮（TorchAttack :17927-18028）：21t 一轮随机熄炬（frameX+=66）+ 弹 949
//   3. 升回地表 → EndOngoingTorchGodEvent（:17834-17843）：批量复燃 + 3600 冷却
//      + Blackout 关 + 无掉落
//   4. 奖励支（≥95 attacks）：无剩余可熄 → RelightTorches + 掉 5043（:17984-17990）
// 运行:SW_ORIGIN=http://localhost:5289 node tools/run-diag.mjs scripts/_iii233-torchgod.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000,
});
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small&tgprobe=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const res = {};

  const vanToInternal = {};
  for (const [key, tid] of Object.entries(TILE_BY_KEY)) {
    const vd = TILE_DEFS[tid]?.vanilla?.sheet;
    if (vd !== undefined && vanToInternal[vd] === undefined) vanToInternal[vd] = tid;
  }
  const TORCH = vanToInternal[4], STONE = vanToInternal[1];
  res.ids = { TORCH, STONE };

  // ---- 地下洞室：worldSurface 下方 80 tile（playerTopY 门 :18180 严格大于）----
  const gl = g.world.groundLevel;
  const ry = gl + 80;
  const ptx = Math.floor(g.player.cx / TILE);
  // 挖 90×12 洞室（±40 触发窗 110 火把布得下）
  for (let x = ptx - 48; x <= ptx + 48; x++) {
    for (let y = ry - 8; y <= ry + 3; y++) { st.setTile(x, y, 0); st.setWall(x, y, 0); }
    st.setTile(x, ry + 4, STONE);
  }
  // 三层石架 × 每列 1 火把（火把需落地锚,同列叠置会被锚定校验拒）→
  // 81 列 × 3 层 = 243 支,全落 ±40 触发窗（>100 门）
  const torches = [];
  const shelves = [[ry + 4, ry + 3], [ry, ry - 1], [ry - 4, ry - 5]];
  for (const [shelfY, torchY] of shelves) {
    for (let x = ptx - 40; x <= ptx + 40; x++) {
      st.setTile(x, shelfY, STONE);
      st.setTile(x, torchY, TORCH, 0, 0);
      torches.push([x, torchY]);
    }
  }
  const countLit = () => {
    let n = 0;
    for (const [x, y] of torches) {
      const t = st.idx(x, y);
      if (st.flags[t] && TILE_DEFS[st.type[t]]?.vanilla?.sheet === 4 && st.frameX[t] < 66) n++;
    }
    return n;
  };
  res.placed = countLit();

  // 玩家传送入洞室（position.Y 顶边 > worldSurface*16）
  g.player.x = ptx * TILE; g.player.y = (ry + 2) * TILE;
  g.player.vx = 0; g.player.vy = 0;
  await sleep(500);
  res.pre = {
    playerTopY: g.player.y / TILE, worldSurface: gl,
    underground: g.player.y / TILE > gl,
    unlocked: !!g.world.flags.unlockedBiomeTorches,
    cooldown: g.torchGod.cooldown,
    active: g.torchGod.active,
    lit: countLit(),
  };

  // ---- 1. 等触发（扫描 60t 节流 + 触发即 active）----
  for (let i = 0; i < 40 && !g.torchGod.active; i++) await sleep(100);
  res.triggered = g.torchGod.active;
  await sleep(1200);   // 让攻击轮跑几拍

  // ---- 2. 攻击轮面：熄炬 + 949 弹幕 + Blackout ----
  const unlitCount = (() => {
    let n = 0;
    for (const [x, y] of torches) {
      const t = st.idx(x, y);
      if (st.flags[t] && TILE_DEFS[st.type[t]]?.vanilla?.sheet === 4 && st.frameX[t] >= 66) n++;
    }
    return n;
  })();
  const bolt949 = g.entities.projectiles.filter((e) => e.projId === 949 && !e.dead).length;
  res.attack = {
    attacks: g.torchGod.attacks,
    unlitTorches: unlitCount,
    torchBolts: bolt949,
    blackout: !!g.blackout,
  };
  // 诊断：frameX 直方图（含帧系统对火把的重排布 vs 熄炬标记 +66 的相互作用）
  const hist = {};
  for (const [x, y] of torches) {
    const t = st.idx(x, y);
    const k = st.flags[t] ? `fx${st.frameX[t]}` : 'dead';
    hist[k] = (hist[k] ?? 0) + 1;
  }
  res.attack.frameXHist = hist;
  res.attack.sampleTiles = torches.slice(0, 6).map(([x, y]) => {
    const t = st.idx(x, y);
    return { x, y, fx: st.frameX[t], fy: st.frameY[t], type: st.type[t] };
  });

  // ---- 4. 奖励支（≥95）：清空攻击窗内全部火把 → 下一轮无剩余 → end(true) 掉 5043 ----
  g.torchGod.attacks = 95;
  for (const [x, y] of torches) st.setTile(x, y, 0);
  const dropsBefore = g.entities.drops.length;
  for (let i = 0; i < 60 && g.torchGod.active; i++) await sleep(100);
  await sleep(500);
  // ItemDrop.itemId = 内部物品 id —— 须经 vanillaIdOfItem 还原原版 id（5043 判定）。
  // ★掉落生成在玩家脚下 → 玩家自动拾取会秒进背包,须并查背包（ItemDrop 落地前
  //   pickup 半径吸气,500ms 采样窗内可能已入包——上轮探针实测两态互斥出现）
  const { vanillaIdOfItem } = await import('/src/stats/Shimmer.ts');
  const toVan = (v) => (typeof v === 'number' ? (vanillaIdOfItem(v) ?? -1) : -1);
  const dropItems = g.entities.drops.slice(dropsBefore).map((d) => toVan(d?.itemId));
  const invItems = g.player.inv.slots.map((sl) => (sl ? toVan(sl.id) : -1));
  const favorInInv = invItems.filter((v) => v === 5043).length;
  res.reward = {
    eventEnded: !g.torchGod.active,
    cooldown: g.torchGod.cooldown,          // 期望 3600
    blackout: !!g.blackout,                 // 期望 false
    drop5043: dropItems.includes(5043) || favorInInv > 0,
    favorInInv,
    dropCount: dropItems.length,
    dropItems: dropItems.slice(0, 6),
  };

  // ---- 3. 复燃验证（RelightTorches）+ 再触发冷却：本流程火把已清,用第二轮验证冷却 ----
  // 重新摆 110 火把 + 回洞室 → 冷却 3600 内不得触发
  for (const [x, y] of torches) st.setTile(x, y, TORCH, 0, 0);
  g.player.x = ptx * TILE; g.player.y = (ry + 2) * TILE; g.player.vy = 0;
  await sleep(3000);
  res.cooldownGate = {
    cooldownRemaining: g.torchGod.cooldown,
    stillInactive: !g.torchGod.active,
  };
  return res;
});
console.log(JSON.stringify(out, null, 2));
// cooldown 采样时已从 3600 起折减（update 每 tick −1）——只验【落窗内未触发+仍在冷却】。
// 熄炬面 = attacks>0（轮次）+ 949 弹幕在场 + Blackout；frameXHist.fx66 ≥1 证熄炬标记
// （fx66 = frameX≥66 的熄炬态;探针密植火把的锚定塌落可能杀个别格,不以此判负）
const ok = !!(out && out.triggered && out.attack && out.attack.attacks > 0
  && out.attack.torchBolts > 0 && out.attack.blackout
  && (out.attack.frameXHist?.fx66 ?? 0) >= 1
  && out.reward && out.reward.eventEnded
  && out.reward.cooldown > 3000 && out.reward.cooldown <= 3600
  && !out.reward.blackout && out.reward.drop5043
  && out.cooldownGate && out.cooldownGate.stillInactive);
console.log(ok ? 'III233-TORCHGOD-PROBE: PASS' : 'III233-TORCHGOD-PROBE: FAIL');
await b.close();
process.exit(ok ? 0 : 1);
