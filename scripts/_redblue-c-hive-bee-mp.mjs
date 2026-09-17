// 红蓝-C ②：case 225 蜂群 MP 双实例探针（中继 co-op 房：A=房主 / B=访客）。
//   ① 同相面（原版 netMode==2 语义等效）：房主破蜂巢 → breakHive 出蜂（房主权威
//      实体）→ msg23 快照 → 访客见蜂傀儡（netPuppet=true, v_210/v_211 fromVanilla 重建）。
//   ② 管籍门判别（红蓝-C 落刀）：访客破蜂巢 → 访客本地不出蜂（原版 netMode==1
//      客户端不掷——beeSpawnAuthority 门），房主收 TileBatch 裸 SetTile 也不出蜂
//      （权威端破坏链不复刻=家族债）→ 双端蜂计数不变、tile 终态收敛 0。
// 用法：SW_PORT=5222 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5222 nohup npx vite > /tmp/vite-5222.log 2>&1 &
//       PROBE_GAME_URL=http://localhost:5222 node tools/run-diag.mjs scripts/_redblue-c-hive-bee-mp.mjs
import puppeteer from 'puppeteer-core';
import { makeTinySave, spawnServer } from './_netfake.mjs';

const PORT = 7958;
const LOBBY = PORT + 1;
const GAME = process.env.PROBE_GAME_URL || 'http://localhost:5199';

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));
{
  const t0 = Date.now();
  while (Date.now() - t0 < 180000 && !serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) {
    await new Promise((r) => setTimeout(r, 1000));
  }
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
const pump = async (page, n = 1) => page.evaluate(async (k) => {
  const g = window.__swGame;
  for (let i = 0; i < k; i++) {
    try { g.fixedUpdate(1 / 60); g.postUpdate(); } catch (e) { return 'ERR@' + i + ':' + (e && (e.stack || e.message)); }
    await new Promise((r) => setTimeout(r, 15));
  }
  return g.tickCount;
}, n);
const pump2 = async (n = 1) => { for (let i = 0; i < n; i++) { await pump(pageA); await pump(pageB); } };
const poll = async (label, reader, want, timeoutMs = 20000) => {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await reader();
    if (JSON.stringify(last) === JSON.stringify(want)) return true;
    await pump2(3);
  }
  console.log(`  [${label}] 超时：last=${JSON.stringify(last)} want=${JSON.stringify(want)}`);
  return false;
};

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mkPage = async () => {
  const page = await browser.newPage();
  await page.bringToFront();
  await page.goto(GAME + (GAME.includes('?') ? '&' : '?') + 'netdbg=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  return page;
};

const room = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'hive-bee', public: false, save: makeTinySave() }),
}).then((r) => r.json());
check('房创建', !!room.ok, room.error ?? '');

const pageA = await mkPage();
const pageB = await mkPage();
const hostUrl = `ws://127.0.0.1:${PORT}/${room.code}?token=${encodeURIComponent(room.hostToken)}`;
const joinA = await pageA.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, hostUrl).catch((e) => String(e));
const guestUrl = `ws://127.0.0.1:${PORT}/${room.code}`;
const joinB = await pageB.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, guestUrl).catch((e) => String(e));
await pageA.waitForFunction(() => !!window.__swGame && !!window.__swGame.net?.active, { timeout: 60000 }).catch(() => {});
await pageB.waitForFunction(() => !!window.__swGame && !!window.__swGame.net?.active, { timeout: 60000 }).catch(() => {});
check('A(房主) 进房', joinA === 'ok', joinA);
check('B(访客) 进房', joinB === 'ok', joinB);

// ---- 平台 + 蜂巢铺设（双端 setTileSilent 本地同构；蜂不依赖帧,摆一行即成巢） ----
const HIVE_N = 24;   // P(0 蜂/块)=2/3 → 24 块漏空概率 (2/3)^24≈0.006%
const setup = async (page) => page.evaluate((N) => {
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer();
  const st = g.world.store;
  const tx = Math.floor(g.world.w / 2), ty = Math.floor(g.world.h * 0.32);
  for (let dy = -30; dy <= 3; dy++) for (let dx = -40; dx <= 40; dx++) st.setTileSilent(tx + dx, ty + dy, dy === 3 ? 1 : 0, 0, 0);
  g.player.x = (tx - 4) * 16; g.player.y = (ty - 4) * 16; g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  window.__hive = { ty, txs: [] };
  // 蜂巢块行（地板上方 3 格）：A/B 各自本地铺（探测期内无并发破坏,终态一致）
  return (async () => {
    const t = await import('/src/data/tiles.ts');
    const id = t.TILE_BY_KEY['v_225_hive_block'];
    for (let i = 0; i < N; i++) {
      const hx = tx + 2 + i;
      st.setTileSilent(hx, ty - 3, id, 0, 0);
      window.__hive.txs.push(hx);
    }
    return { hiveId: id, n: window.__hive.txs.length };
  })();
}, HIVE_N);
const suA = await setup(pageA);
const suB = await setup(pageB);
check('蜂巢铺设(A/B 同构)', suA.hiveId > 0 && suA.n === HIVE_N && suB.hiveId === suA.hiveId, JSON.stringify({ A: suA, B: suB }));
await pump2(10);

const beeCount = (page, puppetOnly) => page.evaluate((p) => {
  const g = window.__swGame;
  let n = 0, pup = 0;
  for (const e of g.entities.enemies) {
    const en = e;
    if (en.dead) continue;
    if (en.vanillaId === 210 || en.vanillaId === 211) { n++; if (en.netPuppet) pup++; }
  }
  return p ? pup : n;
}, puppetOnly);

const beforeA = await beeCount(pageA, false);
const beforeB = await beeCount(pageB, false);
check('基线零蜂(A/B)', beforeA === 0 && beforeB === 0, `A=${beforeA} B=${beforeB}`);

// ---- ① 房主破巢 → 权威出蜂 → 访客见蜂傀儡 ----
await pageA.evaluate(() => {
  const g = window.__swGame;
  for (const hx of window.__hive.txs) g.breakTile(hx, window.__hive.ty - 3, true);
});
await pump2(10);
const hostBees = await beeCount(pageA, false);
check('① 房主本地出蜂(权威)', hostBees >= 1, `A 蜂=${hostBees}/24 块（含 1/3 流蜜+1/2 出蜂掷）`);
const guestPuppets = await poll('① 访客蜂傀儡', () => beeCount(pageB, true), hostBees, 20000)
  ? 'sync' : 'mismatch';
const guestSee = await beeCount(pageB, false);
check('① 访客见蜂傀儡(netPuppet)', guestPuppets === 'sync' && guestSee >= 1, `B 蜂=${guestSee}（傀儡=${await beeCount(pageB, true)}）`);

// ---- ② 访客破巢 → 管籍门：双端零新增蜂 + tile 收敛 ----
// 再铺一批访客侧蜂巢（双端本地铺,互不重叠列段）
const setupGuestBatch = async (page) => page.evaluate((N) => {
  const g = window.__swGame;
  const st = g.world.store;
  const ty = window.__hive.ty;
  return (async () => {
    const t = await import('/src/data/tiles.ts');
    const id = t.TILE_BY_KEY['v_225_hive_block'];
    const txs = [];
    for (let i = 0; i < N; i++) {
      const hx = window.__hive.tx0 + window.__hive.txs.length + 1 + i;
      st.setTileSilent(hx, ty - 3, id, 0, 0);
      txs.push(hx);
    }
    window.__hive.txs.push(...txs);
    return txs.length;
  })();
}, 8);
// tx0 未存——直接用 A/B 共知坐标：继续向右延伸（列段 = max(txs)+1..+8）
await pageA.evaluate(() => { window.__hive.tx0 = Math.max(...window.__hive.txs); });
await pageB.evaluate(() => { window.__hive.tx0 = Math.max(...window.__hive.txs); });
await setupGuestBatch(pageA);
const gb = await setupGuestBatch(pageB);
check('访客批铺设', gb === 8, `n=${gb}`);
await pump2(6);

const preA2 = await beeCount(pageA, false);
const preB2 = await beeCount(pageB, false);
await pageB.evaluate(() => {
  const g = window.__swGame;
  const ty = window.__hive.ty;
  const txs = window.__hive.txs.slice(-8);
  for (const hx of txs) g.breakTile(hx, ty - 3, true);
});
await pump2(12);
const postA2 = await beeCount(pageA, false);
const postB2 = await beeCount(pageB, false);
check('② 访客破巢双端零新增蜂(管籍门)', postA2 === preA2 && postB2 === preB2,
  `A ${preA2}→${postA2}  B ${preB2}→${postB2}`);
// tile 终态收敛（访客 op → 房主 applyRemote 裸 SetTile）
const conv = await poll('② 房主 tile 收敛', () => pageA.evaluate(() => {
  const g = window.__swGame;
  const ty = window.__hive.ty;
  const txs = window.__hive.txs.slice(-8);
  return txs.every((hx) => g.world.store.get(hx, ty - 3) === 0);
}), true, 15000);
check('② 房主侧 tile 收敛 0', conv);

console.log(`\n==== ${pass} PASS / ${fail} FAIL ====`);
await browser.close();
server.killGroup();
process.exit(fail ? 1 : 0);
