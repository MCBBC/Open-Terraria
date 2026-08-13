// PvP 双浏览器真实 E2E（v7 全链"确保效果"）：
//   A 房主 + B 访客进 pvpAllowed 房 → 双 hostile 异队 →
//   ① 近战全链：A 挥击(updateSwingHits) → msg44 → B 本地结算掉血 + 死因 player +
//      8t 无敌帧 + msg16 回报 → A 代理 hp 同步
//   ② 同队免疫 ③ 单侧 hostile 免疫（victim-settles 双门禁）
//   ④ 弹幕链：A 射 PvP 弹(bit6) → B 傀儡命中掉血 + playerImmune 40t
//   ⑤ 爆炸链：A explodeAt → bit7 意向 → B 掉血 + 死因 projectile
//   ⑥ PvP 死亡：不掉钱(lastCoins=0) + deathsPvp 计数 + 满血 300t 无敌复活
// 用法：PROBE_GAME_URL=http://localhost:5201 node scripts/_pvp-e2e.mjs
import puppeteer from 'puppeteer-core';
import { makeTinySave, spawnServer } from './_netfake.mjs';

const PORT = 7907;
const LOBBY = PORT + 1;
const GAME = process.env.PROBE_GAME_URL || 'http://localhost:5201';

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => { const s = d.toString(); serverLog.push(s); if (s.includes('[dbg]')) process.stdout.write(s); });
server.stderr.on('data', (d) => serverLog.push(d.toString()));
const t0 = Date.now();
while (Date.now() - t0 < 180000 && !serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) {
  await new Promise((r) => setTimeout(r, 1000));
}
if (!serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) {
  console.log('FAIL: 服务器启动超时'); server.killGroup(); process.exit(1);
}
console.log('server up');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 泵帧（_roomprobe 既有模式：headless 后台页 rAF 被节流,网路收发/代理模拟需手动驱动）
const pump = (page, n = 1) => page.evaluate(async (k) => {
  const g = window.__swGame;
  for (let i = 0; i < k; i++) {
    try { g.fixedUpdate(1 / 60); g.postUpdate(); } catch (e) { return 'ERR ' + e.message; }
    await new Promise((r) => setTimeout(r, 15));
  }
  return g.tickCount;
}, n);
const pump2 = async (n = 1) => { for (let i = 0; i < n; i++) { await pump(pageA); await pump(pageB); } };

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mkPage = async () => {
  const page = await browser.newPage();
  await page.bringToFront();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 主菜单即有 __swFlow；__swGame 须等 joinRoom 载入服务器世界后才存在
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  return page;
};

// ---- 建房（pvpAllowed） ----
const room = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'pvp-e2e', public: false, pvpAllowed: true, save: makeTinySave() }),
}).then((r) => r.json());
check('pvp 房创建', !!room.ok, room.error ?? '');

const pageA = await mkPage();
const pageB = await mkPage();
// 房主先本地建世界再进房（joinNetGame 房主链需要已加载 world——_roomprobe 同款流程;
// 直接裸 join 房主页 tickCount=0 游戏循环不跑,实踩）
await pageA.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await pageA.waitForFunction(() => !!window.__swGame && !!window.__swGame.world, { timeout: 300000 }).catch(() => {});
const hostUrl = `ws://127.0.0.1:${PORT}/${room.code}?token=${encodeURIComponent(room.hostToken)}`;
const guestUrl = `ws://127.0.0.1:${PORT}/${room.code}`;
const joinA = await pageA.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, hostUrl).catch((e) => String(e));
await pageA.waitForFunction(() => !!window.__swGame && !!window.__swGame.net?.active, { timeout: 60000 }).catch(() => {});
const joinB = await pageB.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, guestUrl).catch((e) => String(e));
await pageB.waitForFunction(() => !!window.__swGame && !!window.__swGame.net?.active, { timeout: 60000 }).catch(() => {});
check('A(房主) 进房', joinA === 'ok', joinA);
check('B(访客) 进房', joinB === 'ok', joinB);

// ---- 铺平台落位（tiny 存档出生点悬空会坠亡 underground——先兜底） ----
const platform = async (page, who) => page.evaluate((w) => {
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer();
  const st = g.world.store;
  // ★底部击杀线 = (h-40) 格(bordersMovement)——平台必须在其上
  const tx = Math.floor(g.world.w / 2), ty = g.world.h - 60;
  for (let dx = -14; dx <= 14; dx++) st.setTileSilent(tx + dx, ty, 1, 0, 0);
  g.player.x = (tx + (w === 'B' ? 2 : -2)) * 16;
  g.player.y = (ty - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.fallStartY = null;
  return { x: g.player.x, y: g.player.y, dead: g.player.dead };
}, who);
// B 预埋弹幕同步钩子计数（区分"没收到"vs"收到没建傀儡"）
await pageB.evaluate(() => {
  const g = window.__swGame;
  const orig = g.net.hooks.onProjectileSync;
  g.net.hooks.onProjectileSync = (snaps) => {
    window.__pvpSawProj = (window.__pvpSawProj ?? 0) + (snaps ? snaps.length : 0);
    window.__pvpSawProjFrames = (window.__pvpSawProjFrames ?? 0) + 1;
    if (orig) orig(snaps);
  };
});
const platB = await platform(pageB, 'B');
const platA = await platform(pageA, 'A');
check('双方平台落位存活', !platA.dead && !platB.dead, JSON.stringify({ platA, platB }));
await pump2(20); // msg13 双向同步

// ---- 场景准备：双 hostile 异队 + 贴身站位 ----
const setupA = await pageA.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  // 近战手持物：铜短剑 vi_ 键反查，退化 torch（swing.dmg 显式给值,任意非 magic 即可）
  let heldId = ITEM_BY_KEY['vi_3507_copper_shortsword'] ?? -1;
  if (heldId < 0) heldId = ITEM_BY_KEY['torch'] ?? -1;
  g.player.hostile = true; g.player.team = 1; g.player.facing = 1;
  if (heldId >= 0) { g.player.inv.slots[0] = { id: heldId, stack: 1 }; g.player.inv.selected = 0; }
  g.net.sendPvpState();
  return { heldId, slot: g.net.mySlot };
});
const setupB = await pageB.evaluate(() => {
  const g = window.__swGame;
  g.player.hostile = true; g.player.team = 2;
  g.net.sendPvpState();
  return { slot: g.net.mySlot, x: g.player.x, y: g.player.y };
});
check('A 拿到近战手持物', setupA.heldId >= 0, `heldId=${setupA.heldId}`);
await pump2(20); // msg13 双向同步

// A 贴到 B 左侧 14px（B 的 msg13 权威位）
const teleA = await pageA.evaluate((bpos) => {
  const g = window.__swGame;
  g.player.x = bpos.x - 14; g.player.y = bpos.y;
  g.player.vx = 0; g.player.vy = 0;
  const rps = [...g.net.players.entries()].map(([sl, r]) => ({ sl, active: r.active, x: Math.round(r.x), fresh: r.fresh, hostile: r.hostile, team: r.team }));
  return {
    ticks: g.tickCount,
    proxies: g.remotePlayerProxies.length, bProxyX: g.remotePlayerProxies[0]?.x ?? -1,
    playersSize: g.net.players.size, mySlot: g.net.mySlot, isHost: g.net.policy.isHost,
    rps,
  };
}, setupB).catch((e) => ({ err: String(e) }));
check('A 侧 B 代理存在', (teleA.proxies ?? 0) >= 1, JSON.stringify(teleA));
await pump2(20);
const diagB = await pageB.evaluate(() => ({
  playersSize: window.__swGame.net.players.size, mySlot: window.__swGame.net.mySlot,
  playerKeys: [...window.__swGame.net.keys?.() ?? []],
  proxiesOnB: window.__swGame.remotePlayerProxies.length,
}));
console.log('diag:', JSON.stringify({ teleA, diagB }));

// ① 近战全链：A 挥击 → B 掉血
const bHp0 = await pageB.evaluate(() => window.__swGame.player.hp);
const swing = await pageA.evaluate(() => {
  const g = window.__swGame;
  const held = g.player.inv.heldItem();
  if (!held) return { err: 'no held' };
  g.swing = { item: held.id, dmg: 25, kb: 4, t: 16, dur: 16, useStyle: 1 };
  for (let i = 0; i < 14; i++) g.updateSwingHits(); // 相位扫描（真实挥击扫过全程）
  const sent = g.swing ? 'swing-alive' : 'swing-consumed';
  return {
    sent, bProxyX: g.remotePlayerProxies[0]?.x ?? -1, aX: g.player.x, aY: g.player.y,
    swingHits: g.swingHitSet.size, hostile: g.player.hostile, pvpRoom: g.net.policy.pvpAllowed,
  };
}).catch((e) => ({ err: String(e) }));
check('① A 挥击执行', !swing.err, JSON.stringify(swing));
await pump2(10);
await sleep(400); // WS 往返
const bHit = await pageB.evaluate(() => {
  const g = window.__swGame;
  return { hp: g.player.hp, ifr: g.player.iframes, cause: JSON.stringify(g.player.lastDamageCause) };
});
const dmgTaken = bHp0 - bHit.hp;
check('① B 掉血（本地结算）', dmgTaken > 0, `hp ${bHp0}→${bHit.hp}`);
check('① B 死因=player', bHit.cause.includes('"kind":"player"'), bHit.cause);
check('① B 无敌帧=8t', bHit.ifr > 0 && bHit.ifr <= 8, `ifr=${bHit.ifr}`);
// msg16 回报：A 代理 hp 同步
await pump2(10);
await sleep(400);
const aSync = await pageA.evaluate(() => ({
  proxyHp: window.__swGame.remotePlayerProxies[0]?.hp ?? -1,
  bHp: -1,
}));
const bHpNow = await pageB.evaluate(() => window.__swGame.player.hp);
check('① msg16 回报 → A 代理 hp 同步', Math.abs(aSync.proxyHp - bHpNow) <= 1, `proxy=${aSync.proxyHp} b=${bHpNow}`);

// ② 同队免疫
await pageA.evaluate(() => { const g = window.__swGame; g.player.team = 2; g.net.sendPvpState(); });
await pump2(6); await sleep(300);
const hpSame = await pageB.evaluate(() => window.__swGame.player.hp);
await pageA.evaluate(() => {
  const g = window.__swGame;
  g.net.sendStrikePlayer(g.net.players.keys().next().value ?? 0, 30, 1, 0, -1, 0);
});
await pump2(6); await sleep(300);
const bSame = await pageB.evaluate(() => window.__swGame.player.hp);
check('② 同队免疫（不掉血）', bSame === hpSame, `${hpSame}→${bSame}`);

// ③ 单侧 hostile 免疫：A 关 hostile 再打
await pageA.evaluate(() => { const g = window.__swGame; g.player.team = 1; g.player.hostile = false; g.net.sendPvpState(); });
await pump2(6); await sleep(300);
const hpGate0 = await pageB.evaluate(() => window.__swGame.player.hp);
await pageA.evaluate(() => {
  const g = window.__swGame;
  for (const s of g.net.players.keys()) g.net.sendStrikePlayer(s, 30, 1, 0, -1, 0);
});
await pump2(6); await sleep(300);
const bGate = await pageB.evaluate(() => window.__swGame.player.hp);
check('③ A 关 hostile 后攻击免疫', bGate === hpGate0, `${hpGate0}→${bGate}`);
await pageA.evaluate(() => { window.__swGame.player.hostile = true; window.__swGame.net.sendPvpState(); });
await pump2(6); await sleep(300);

// ④ 弹幕链：A 朝 B 位置射友好箭（pvpOn → bit6）
const hpBefore4 = await pageB.evaluate(() => window.__swGame.player.hp);
const bPos2 = await pageB.evaluate(() => ({ x: window.__swGame.player.x, y: window.__swGame.player.y }));
await pageB.evaluate(() => { window.__swGame.player.iframes = 0; });
const arrowShot = await pageA.evaluate(async (bp) => {
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  // 直接生成在 B 代理身上（vx=0.5 维持差分广播防静止跳帧）
  const bpr = g.remotePlayerProxies[0];
  if (!bpr) return { err: 'no proxy' };
  const a = new Arrow(bpr.x, bpr.y, 0.5, 0, 30, 3, 1, null);
  a.noSlot = false;
  g.entities.add(a, 'projectiles');
  return { id: a.id, ok: !a.dead, bx: bpr.x, by: bpr.y };
}, bPos2).catch((e) => ({ err: String(e) }));
check('④ A 射出 PvP 弹', !arrowShot.err, JSON.stringify(arrowShot));
// 逐帧快照定位箭的死亡时刻（曾整支消失且从未进差分基准表）
for (let step = 0; step < 6; step++) {
  await pump(pageA, 1);
  const snap = await pageA.evaluate((arrowId) => {
    const g = window.__swGame;
    const a = g.entities.projectiles.find((e) => e.id === arrowId);
    return { t: g.tickCount, alive: !!a && !a.dead, x: a ? Math.round(a.x) : -1, y: a ? Math.round(a.y) : -1, dead: a ? a.dead : null, inLast: g.netProjLast.has(arrowId) };
  }, arrowShot.id);
  console.log(`  arrow@t${step}:`, JSON.stringify(snap));
}
await pump2(30); await sleep(500); // 弹幕差分广播 + 傀儡命中
const bProj = await pageB.evaluate(() => ({
  hp: window.__swGame.player.hp,
  cause: JSON.stringify(window.__swGame.player.lastDamageCause),
}));
check('④ 弹幕链 B 命中（掉血）', bProj.hp < hpBefore4, `${hpBefore4}→${bProj.hp}`);
const pupDiag = await pageB.evaluate(() => {
  const g = window.__swGame;
  const pups = [...g.netProjPuppets.entries()].map(([id, pu]) => ({
    id, pvp: pu.pvp, owner: pu.ownerSlot, kind7: pu.kind7,
    x: Math.round(pu.p.x), y: Math.round(pu.p.y), dmg: pu.p.damage, immune: pu.pvpImmuneT,
  }));
  const owner0 = g.net.players.get(0);
  return {
    pups,
    p0: owner0 ? { active: owner0.active, hostile: owner0.hostile, team: owner0.team } : null,
    me: { hostile: g.player.hostile, team: g.player.team, x: Math.round(g.player.x), y: Math.round(g.player.y) },
  };
});
console.log('pupDiag:', JSON.stringify(pupDiag));
console.log('B sawProj:', await pageB.evaluate(() => ({ n: window.__pvpSawProj ?? 0, frames: window.__pvpSawProjFrames ?? 0 })));
const projDiagA = await pageA.evaluate((arrowId) => {
  const g = window.__swGame;
  const list = g.entities.projectiles;
  const arrow = list.find((e) => e.id === arrowId);
  const last = g.netProjLast.get(arrowId);
  return {
    projCount: list.length, arrowAlive: !!arrow && !arrow.dead,
    ax: arrow ? Math.round(arrow.x) : -1, ay: arrow ? Math.round(arrow.y) : -1,
    lastX: last ? Math.round(last.x) : null, lastT: last ? last.t : null,
    tick: g.tickCount, hostile: g.player.hostile, pvpRoom: g.net.policy.pvpAllowed,
    netProjLastSize: g.netProjLast.size,
  };
}, arrowShot.id);
console.log('projDiagA:', JSON.stringify(projDiagA));

// ⑤ 爆炸链：A 在 B 脚下引爆
await pageB.evaluate(() => { window.__swGame.player.iframes = 0; });
const bPos5 = await pageB.evaluate(() => ({
  tx: Math.floor(window.__swGame.player.cx / 16), ty: Math.floor(window.__swGame.player.cy / 16),
  hp: window.__swGame.player.hp,
}));
await pageA.evaluate((pos) => {
  window.__swGame.explodeAt(pos.tx, pos.ty, 60, 3, false, undefined, 0, 28);
}, bPos5);
await pump2(10); await sleep(400);
const bBoom = await pageB.evaluate(() => ({
  hp: window.__swGame.player.hp,
  cause: JSON.stringify(window.__swGame.player.lastDamageCause),
}));
check('⑤ 爆炸意向 → B 掉血', bBoom.hp < bPos5.hp, `${bPos5.hp}→${bBoom.hp}`);
check('⑤ 死因=projectile', bBoom.cause.includes('"kind":"projectile"'), bBoom.cause);

// ⑥ PvP 死亡：B 残血 → A 补刀
await pageB.evaluate(() => {
  const g = window.__swGame;
  g.player.hp = 5; g.player.iframes = 0;
  g.net.syncHp();
});
await pump2(4); await sleep(300);
const bSlot = await pageB.evaluate(() => window.__swGame.net.mySlot);
await pageA.evaluate((slot) => {
  window.__swGame.net.sendStrikePlayer(slot, 50, 1, 0, -1, 0);
}, bSlot);
await pump(pageB, 10); await sleep(400);
const bDead = await pageB.evaluate(() => {
  const g = window.__swGame;
  return {
    dead: g.player.dead, pvp: g.player.lastPvpDeath, pvpDeaths: g.player.deathsPvp,
    lost: g.lostCoins, timer: g.player.respawnTimer,
  };
});
check('⑥ B 死亡 + pvpDeath 标记', bDead.dead && bDead.pvp, JSON.stringify(bDead));
check('⑥ PvP 死亡不掉钱（lostCoins=0）', bDead.lost === 0, `lost=${bDead.lost}`);
check('⑥ deathsPvp 计数', bDead.pvpDeaths >= 1, `pvpDeaths=${bDead.pvpDeaths}`);
// 满血 300t 无敌复活
const revived = await pageB.evaluate(() => {
  const g = window.__swGame;
  g.respawnPlayer();
  return { hp: g.player.hp, max: g.player.maxHp, ifr: g.player.iframes, pvp: g.player.lastPvpDeath };
});
check('⑥ 满血复活 + 300t 无敌 + 标记清除',
  revived.hp === revived.max && revived.ifr === 300 && !revived.pvp,
  JSON.stringify(revived));

// ---- 收尾 ----
await browser.close();
try { await fetch(`http://127.0.0.1:${LOBBY}/rooms/${room.code}`, { method: 'DELETE' }); } catch { /* noop */ }
await sleep(300);
server.killGroup();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
