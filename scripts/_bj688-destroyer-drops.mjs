// ★BJ688 定谳探针：毁灭者(The Destroyer 134)击杀掉落锚——
//   反编译 NPC.cs checkDead :79003-79024：type==134 死亡时先扫描全链 134/135/136
//   取【距 Main.player[target] 曼哈顿最近段】的 position 临时顶替头位置再 NPCLoot()
//   （掉落锚=最近段中心,随后还原）——本仓死亡管线掉落全锚 this.cx/cy(头自身)。
//   假说：末击落在身段且头远离玩家(钻地/出屏)时,掉落全部生成在头位=玩家看不到
//   「打完毁灭者零掉落」。
//   Phase A：末击落【中段】(头被移远 3000px) → 记录掉落物 id/坐标/距玩家/距头
//   Phase B：末击落【头】(头同样远)     → 同上（原版两路径都走 checkDead 重定位）
//   Phase C：专家档(world.isExpert)末击落段 → 宝袋 3325 面是否生成 + 锚点
// 用法: SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj688-destroyer-drops.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger, freezeClock, godMode, teleport } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界就绪', gen.ok, JSON.stringify(gen).slice(0, 100));
await freezeClock(page, { tod: 21 / 24 });   // 夜 21:00（防黎明逃离路径）
await godMode(page, true);
await pump(page, 10);

// ---------- 场景定位：地表找一块开阔地 ----------
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const surf = [];
  for (let tx = 60; tx <= 140; tx++) {
    for (let ty = 8; ty < st.h; ty++) { if (st.hasTile(tx, ty)) { surf.push(ty); break; } }
  }
  surf.sort((a, b) => a - b);
  const topRow = surf[Math.floor(surf.length / 2)];
  return { tx: 100, ty: topRow, px: 100 * 16, py: (topRow - 6) * 16 };
});
await teleport(page, spot.px, spot.py);
await pump(page, 5);
console.log('场景:', JSON.stringify(spot));

/** 单场景：生成毁灭者 → 铺链 → 头移远 → 末击 → 采集掉落 */
async function scenario(tag, { blowOn = 'seg', expert = false } = {}) {
  const out = await page.evaluate(async ({ tag, blowOn, expert, px, py }) => {
    const g = window.__swGame;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // 清场（drops/enemies）
    g.entities.drops.length = 0;
    g.entities.enemies.length = 0;
    g.world.difficulty = expert ? 1 : 0;   // isExpert 是 getter（mainDifficulty>=1）,写字段
    g.world.flags['downed_134'] = false;
    // 生成头（桥）+ 首帧 AI 建链
    const meta = await window.__swFlow.spawnVanillaEnemy(134, px, py);
    if (!meta) return { ok: false, why: 'spawn-failed' };
    for (let i = 0; i < 25; i++) g.fixedUpdate(1 / 60);   // bInit 建链 + 链铺开
    await wait(0);
    const head = g.entities.enemies.find((e) => e.vanillaId === 134 && !e.dead);
    if (!head) return { ok: false, why: 'no-head' };
    const segs = g.entities.enemies.filter((e) => (e.vanillaId === 135 || e.vanillaId === 136) && !e.dead);
    if (segs.length < 10) return { ok: false, why: 'chain-short', n: segs.length };
    // 头移远（模拟钻地/出屏），不再 pump（链保持原地）
    head.x += 3000; head.y += 900; head.vx = 0; head.vy = 0;
    const headPos = { cx: head.cx, cy: head.cy };
    const p = g.player;
    const playerPos = { cx: p.cx, cy: p.cy };
    // 段位姿快照（击杀拍同步采集——防泵后序列化读漂移）
    const segSnap = [head, ...segs].map((s) => ({
      vid: s.vanillaId, cx: s.cx, cy: s.cy,
      d: Math.abs(s.cx - p.cx) + Math.abs(s.cy - p.cy),
    })).sort((a, b) => a.d - b.d);
    // 末击：池血余 10
    head.hp = 10;
    const victim = blowOn === 'head' ? head : segs[Math.floor(segs.length / 2)];
    const victimPos = { cx: victim.cx, cy: victim.cy };
    let threw = null;
    try {
      victim.hurt(9999, 0, 0, g, 0, false, 1, true);   // 单发弹语义(pierce=1)+fromPlayer
    } catch (e) { threw = String(e?.message ?? e).slice(0, 160); }
    // ★击杀拍同步快照：掉落物生成即采样（防 90t 泵内被玩家拾取/物理漂移）
    const snapDrop = (d) => ({
      id: d.itemId, stack: d.stack,
      x: Math.round(d.cx), y: Math.round(d.cy),
      dPlayer: Math.round(Math.hypot(d.cx - playerPos.cx, d.cy - playerPos.cy)),
      dHead: Math.round(Math.hypot(d.cx - headPos.cx, d.cy - headPos.cy)),
    });
    const dropsAtKill = g.entities.drops.map(snapDrop);
    const invBefore = {};
    for (const s of p.inv.slots) if (s) invBefore[s.id] = (invBefore[s.id] ?? 0) + s.stack;
    // 泵 90t：物理落定 + 玩家拾取窗口（近玩家掉落应被吸走=修复生效的另一证据）
    for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
    await wait(0);
    const drops = g.entities.drops.map(snapDrop);
    const invGain = {};
    for (const s of p.inv.slots) if (s) {
      const before = invBefore[s.id] ?? 0;
      if (s.stack > before) invGain[s.id] = s.stack - before;
    }
    return {
      ok: true, tag, expert, blowOn, threw,
      headDead: head.dead, segsAllDead: segs.every((s) => s.dead),
      downed134: !!g.world.flags['downed_134'],
      nDrops: dropsAtKill.length, drops: dropsAtKill,
      dropsAfterPump: drops.length,
      invGain,
      headPos, playerPos, victimPos,
      nearest: segSnap.slice(0, 3).map((s) => ({ vid: s.vid, cx: Math.round(s.cx), cy: Math.round(s.cy), d: Math.round(s.d) })),
      farthest: segSnap.slice(-2).map((s) => ({ vid: s.vid, cx: Math.round(s.cx), cy: Math.round(s.cy), d: Math.round(s.d) })),
    };
  }, { tag, blowOn, expert, px: spot.px, py: spot.py });
  console.log(`\n[${tag}]`, JSON.stringify(out, (k, v) => (k === 'drops' && Array.isArray(v) && v.length > 12 ? v.slice(0, 12).concat([`…+${v.length - 12}`]) : v), 1));
  return out;
}

const A = await scenario('A·经典档·末击落中段·头远', { blowOn: 'seg' });
const B = await scenario('B·经典档·末击落头·头远', { blowOn: 'head' });
const C = await scenario('C·专家档·末击落中段·头远', { blowOn: 'seg', expert: true });

// ---------- 判读 ----------
for (const [name, r] of [['A', A], ['B', B], ['C', C]]) {
  if (!r?.ok) { L.chk(`${name} 场景跑通`, false, r?.why ?? JSON.stringify(r).slice(0, 120)); continue; }
  // downed_134 不在此判（直刷桥不注册 this.boss——真机召唤经 summonBoss 注册,
  // 击杀记账走 Boss 逻辑块;探针 artifact 非游戏面）
  L.chk(`${name} 头死亡+整链同死`, r.headDead && r.segsAllDead,
    `headDead=${r.headDead} segsAllDead=${r.segsAllDead}`);
  L.chk(`${name} 掉落物实体已生成(>0)`, r.nDrops > 0, `nDrops=${r.nDrops}`);
  const dropIds = [...new Set(r.drops.map((d) => d.id))];
  console.log(`${name} 掉落物 id 集合:`, JSON.stringify(dropIds), `(548=强力灵魂 1225=神圣锭 2113=面具 3325=毁灭者袋 58=心 74/76=金币)`);
  console.log(`${name} 泵后场内余 ${r.dropsAfterPump} 件 / 玩家拾取增量:`, JSON.stringify(r.invGain), `/ 最近段:`, JSON.stringify(r.nearest));
  const maxDPlayer = Math.max(...r.drops.map((d) => d.dPlayer), -1);
  const medDHead = r.drops.length ? r.drops.map((d) => d.dHead).sort((a, b) => a - b)[Math.floor(r.drops.length / 2)] : -1;
  L.chk(`${name} ★掉落锚点=最近段(距玩家<600px,而非头位>2000px)`,
    maxDPlayer < 600 && medDHead > 2000,
    `掉落距玩家 max=${maxDPlayer}px / 距头中位=${medDHead}px（头被移远 ~3150px;假说成立时掉落应聚在身段=玩家侧）`);
}
// 专家档特判：3325 宝袋面
if (C?.ok) {
  L.chk('C 专家档宝袋 3325 生成', C.drops.some((d) => d.id === 3325),
    `bag=${C.drops.filter((d) => d.id === 3325).map((d) => `${d.stack}@(${d.x},${d.y})`).join(',') || '无'}`);
  L.chk('C 专家档灵魂 548 不直掉(袋内)', !C.drops.some((d) => d.id === 548), `souls=${C.drops.filter((d) => d.id === 548).length}`);
}

await browser.close();
L.print();
process.exit(L.exitCode());
