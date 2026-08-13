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

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mkPage = async () => {
  const page = await browser.newPage();
  await page.bringToFront();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__swFlow && !!window.__swGame, { timeout: 60000 });
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
const hostUrl = `ws://127.0.0.1:${PORT}/${room.code}?token=${encodeURIComponent(room.hostToken)}`;
const guestUrl = `ws://127.0.0.1:${PORT}/${room.code}`;
const joinA = await pageA.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, hostUrl).catch((e) => String(e));
const joinB = await pageB.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, guestUrl).catch((e) => String(e));
check('A(房主) 进房', joinA === 'ok', joinA);
check('B(访客) 进房', joinB === 'ok', joinB);

// ---- 场景准备：双 hostile 异队 + 贴身站位 ----
const setupA = await pageA.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const swordId = ITEM_DEFS.findIndex((d) => d && d.vid === 4); // 铜短剑（melee）
  g.player.hostile = true; g.player.team = 1;
  if (swordId >= 0) { g.player.inv.slots[0] = { id: swordId, stack: 1 }; g.player.inv.selected = 0; }
  g.net.sendPvpState();
  return { swordId: swordId >= 0, slot: g.net.mySlot };
});
const setupB = await pageB.evaluate(() => {
  const g = window.__swGame;
  g.player.hostile = true; g.player.team = 2;
  g.net.sendPvpState();
  return { slot: g.net.mySlot, x: g.player.cx, y: g.player.y };
});
check('A 拿到铜短剑', setupA.swordId);
await sleep(600); // msg13 双向同步

// B 不动；A 传送到 B 身边
const teleA = await pageA.evaluate((bpos) => {
  const g = window.__swGame;
  g.player.x = bpos.x - 14; g.player.y = bpos.y; // A 在 B 左侧 14px（同顶）
  g.player.vx = 0; g.player.vy = 0;
  return { a: g.player.cx, b: g.remotePlayerProxies[0]?.cx ?? -1, proxies: g.remotePlayerProxies.length };
}, setupB).catch((e) => ({ err: String(e) }));
check('A 侧 B 代理存在', teleA.proxies >= 1, JSON.stringify(teleA));
await sleep(600);

// ① 近战全链：A 挥击 → B 掉血
const bHp0 = await pageB.evaluate(() => window.__swGame.player.hp);
const swing = await pageA.evaluate(() => {
  const g = window.__swGame;
  const held = g.player.inv.heldItem();
  if (!held) return { err: 'no held' };
  g.swing = { item: held.id, dmg: 25, kb: 4, t: 12, dur: 16, useStyle: 1 };
  g.updateSwingHits();
  const sent = g.swing ? 'swing-alive' : 'swing-consumed';
  return { sent, bProxyX: g.remotePlayerProxies[0]?.x ?? -1, aX: g.player.x };
}).catch((e) => ({ err: String(e) }));
check('① A 挥击执行', !swing.err, JSON.stringify(swing));
await sleep(800);
const bHit = await pageB.evaluate(() => {
  const g = window.__swGame;
  return { hp: g.player.hp, ifr: g.player.iframes, cause: JSON.stringify(g.player.lastDamageCause) };
});
const dmgTaken = bHp0 - bHit.hp;
check('① B 掉血（本地结算）', dmgTaken > 0, `hp ${bHp0}→${bHit.hp}`);
check('① B 死因=player', bHit.cause.includes('"kind":"player"'), bHit.cause);
check('① B 无敌帧=8t', bHit.ifr > 0 && bHit.ifr <= 8, `ifr=${bHit.ifr}`);
// msg16 回报：A 代理 hp 同步
await sleep(800);
const aSync = await pageA.evaluate(() => ({
  proxyHp: window.__swGame.remotePlayerProxies[0]?.hp ?? -1,
  bHp: -1,
}));
const bHpNow = await pageB.evaluate(() => window.__swGame.player.hp);
check('① msg16 回报 → A 代理 hp 同步', Math.abs(aSync.proxyHp - bHpNow) <= 1, `proxy=${aSync.proxyHp} b=${bHpNow}`);

// ② 同队免疫
await pageA.evaluate(() => { const g = window.__swGame; g.player.team = 2; g.net.sendPvpState(); });
await sleep(500);
const hpSame = await pageB.evaluate(() => window.__swGame.player.hp);
await pageA.evaluate(() => {
  const g = window.__swGame;
  g.net.sendStrikePlayer(g.net.players.keys().next().value ?? 0, 30, 1, 0, -1, 0);
});
await sleep(500);
const bSame = await pageB.evaluate(() => window.__swGame.player.hp);
check('② 同队免疫（不掉血）', bSame === hpSame, `${hpSame}→${bSame}`);

// ③ 单侧 hostile 免疫：A 关 hostile 再打
await pageA.evaluate(() => { const g = window.__swGame; g.player.team = 1; g.player.hostile = false; g.net.sendPvpState(); });
await sleep(500);
const hpGate0 = await pageB.evaluate(() => window.__swGame.player.hp);
await pageA.evaluate(() => {
  const g = window.__swGame;
  for (const s of g.net.players.keys()) g.net.sendStrikePlayer(s, 30, 1, 0, -1, 0);
});
await sleep(500);
const bGate = await pageB.evaluate(() => window.__swGame.player.hp);
check('③ A 关 hostile 后攻击免疫', bGate === hpGate0, `${hpGate0}→${bGate}`);
await pageA.evaluate(() => { window.__swGame.player.hostile = true; window.__swGame.net.sendPvpState(); });
await sleep(400);

// ④ 弹幕链：A 朝 B 位置射友好箭（pvpOn → bit6）
const hpBefore4 = await pageB.evaluate(() => window.__swGame.player.hp);
const bPos2 = await pageB.evaluate(() => ({ x: window.__swGame.player.x, y: window.__swGame.player.y }));
await pageB.evaluate(() => { window.__swGame.player.iframes = 0; });
const arrowShot = await pageA.evaluate(async (bp) => {
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  // A 的弹从 A 手上出发朝 B（vx=1 缓飞保证差分广播）
  const a = new Arrow(g.player.x + 10, g.player.y, 1, 0, 30, 3, 1, null);
  a.noSlot = false;
  g.entities.add(a, 'projectiles');
  return { id: a.id, ok: !a.dead };
}, bPos2).catch((e) => ({ err: String(e) }));
check('④ A 射出 PvP 弹', !arrowShot.err, JSON.stringify(arrowShot));
await sleep(1500);
const bProj = await pageB.evaluate(() => ({
  hp: window.__swGame.player.hp,
  cause: JSON.stringify(window.__swGame.player.lastDamageCause),
}));
check('④ 弹幕链 B 命中（掉血）', bProj.hp < hpBefore4, `${hpBefore4}→${bProj.hp}`);

// ⑤ 爆炸链：A 在 B 脚下引爆
await pageB.evaluate(() => { window.__swGame.player.iframes = 0; });
const bPos5 = await pageB.evaluate(() => ({
  tx: Math.floor(window.__swGame.player.cx / 16), ty: Math.floor(window.__swGame.player.cy / 16),
  hp: window.__swGame.player.hp,
}));
await pageA.evaluate((pos) => {
  window.__swGame.explodeAt(pos.tx, pos.ty, 60, 3, false, undefined, 0, 28);
}, bPos5);
await sleep(900);
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
await sleep(400);
const bSlot = await pageB.evaluate(() => window.__swGame.net.mySlot);
await pageA.evaluate((slot) => {
  window.__swGame.net.sendStrikePlayer(slot, 50, 1, 0, -1, 0);
}, bSlot);
await sleep(900);
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
