// IIII242 lib 收编实机冒烟(钉种子跑法;?play= 走 Date.now() 种子=每 load 异世界,不可跨跑对拍):
//   静稳门:活世界在跑(type/liquid/frameX/frameY 被草蔓/液面/落沙持续改写)——指纹取样前必须
//   等世界静稳(四活通道连续两次 500ms 间隔一致),否则同世界双实现也"漂"出假差;
//   ① G9 等价铁证:同一 evaluate 内双实现(scripts/_worldgen-hash.mjs evaluate 体逐字内联 vs
//      lib STORE_FNV_CHANNELS 重建)——跨 evaluate 取样会被活模拟污染出假差,必须原子;
//   ② 同种子跨 load 确定性(本脚本跑两次,静稳后 golden 逐通道一致);
//   ③ G4 五件实机直跑+G8 nextFrame。
// 运行:SW_ORIGIN=http://localhost:5295 node tools/run-diag.mjs --timeout=420000 scripts/_iii242-lib-smoke.mjs
import puppeteer from 'puppeteer-core';
import { bootstrap, createGame, fnvStore, fnv1a32, STORE_FNV_CHANNELS, tileIdBySheet, spawnEnemy, spawnTownNPC, clearEnemies, giveItems, nextFrame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const CH = ['type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'frameX', 'frameY', 'paint', 'coat'];
const LIVE_CH = ['type', 'liquid', 'frameX', 'frameY'];
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
await bootstrap(p, ORIGIN);
const gen = await createGame(p, { mode: 'direct', seed: '05162020', size: 'small' });
if (!gen.ok) { console.log(JSON.stringify({ ok: false, why: 'createGame:' + (gen.why ?? '?') })); await b.close(); process.exit(1); }

const out = { ok: true, seed: '05162020' };
// ---- 静稳门(活通道连续两次一致) ----
let qPrev = null, qOk = false;
for (let i = 0; i < 40; i++) {
  const h = await fnvStore(p, { channels: LIVE_CH });
  if (qPrev && LIVE_CH.every((k) => h[k] === qPrev[k])) { qOk = true; break; }
  qPrev = h;
  await new Promise((r) => setTimeout(r, 500));
}
out.quiesced = qOk;
if (!qOk) await new Promise((r) => setTimeout(r, 3000));

// ---- ① G9 双实现等价(同一 evaluate 原子取样;金标体逐字=scripts/_worldgen-hash.mjs) ----
out.equiv = await p.evaluate(({ fnvSrc, chanPairs, goldenChans }) => {
  const st = window.__swGame.world.store;
  const fnv = (u8) => {   // 逐字=scripts/_worldgen-hash.mjs
    let h = 0x811c9dc5;
    for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  const golden = {
    type: fnv(new Uint8Array(st.type.buffer)), wall: fnv(new Uint8Array(st.wall.buffer)),
    liquid: fnv(st.liquid), liquidType: fnv(st.liquidType),
    half: fnv(st.half), slope: fnv(st.slope), frameX: fnv(new Uint8Array(st.frameX.buffer)),
    frameY: fnv(new Uint8Array(st.frameY.buffer)), paint: fnv(st.paint), coat: fnv(st.coat),
  };
  const libFnv = eval('(' + fnvSrc + ')');                       // lib 单一真值源注入
  const lib = {};
  for (const [name, src] of chanPairs) lib[name] = libFnv(new Function('st', `return (${src})(st);`)(st));
  return { equal: goldenChans.every((k) => golden[k] === lib[k]), golden, lib };
}, { fnvSrc: fnv1a32.toString(), chanPairs: Object.entries(STORE_FNV_CHANNELS).map(([n, f]) => [n, f.toString()]), goldenChans: CH });
out.golden = out.equiv.golden;
out.libHash = out.equiv.lib;
out.g9Equiv = out.equiv.equal;

// ---- ② 同页两跑:静通道稳定;活模拟通道(type/liquid/liquidType/frameX/frameY——
//      潮汐/液面/落沙/液反应)如实单列。★全域确定性=gen 静态快照或静稳夹具域,非 lib 缺口 ----
out.libA = await fnvStore(p);
out.libB = await fnvStore(p);
out.staticStable = ['wall', 'half', 'slope', 'paint', 'coat'].every((k) => out.libA[k] === out.libB[k]);
out.liveMutated = ['type', 'liquid', 'liquidType', 'frameX', 'frameY'].filter((k) => out.libA[k] !== out.libB[k]);
out.fnvDeterministic = out.staticStable;

// ---- ③ G4 反查/生成/清场/给物(玩家右邻找地面站格) ----
out.tileTorch = await tileIdBySheet(p, 4);
out.tileAsh = await tileIdBySheet(p, 57);
const spot = await p.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.player.cy / 16);
  for (let k = 0; k < 120 && gy < st.h - 4; k++) { if (st.isSolid(px, gy)) break; gy++; }
  return { tx: px + 4, ty: gy - 1 };   // 站格=地面行−1
});
out.spot = spot;
out.npc = await spawnTownNPC(p, 'merchant', { tx: spot.tx, ty: spot.ty });
out.npcCount = await p.evaluate(() => window.__swGame.entities.npcs.length);
out.enemy = await spawnEnemy(p, 290, (spot.tx - 2) * 16 + 8, (spot.ty - 3) * 16, (e) => { e.ai1 = 1; });
out.enemyPlain = await spawnEnemy(p, 290, (spot.tx - 6) * 16 + 8, (spot.ty - 3) * 16);
out.enemyCount = await p.evaluate(() => window.__swGame.entities.enemies.length);
out.give = await giveItems(p, [{ vid: 9, stack: 250, slot: 54 }, { vid: 9 }]);
out.slot54 = await p.evaluate(() => window.__swGame.player.inv.slots[54]);
out.clear = await clearEnemies(p, { kinds: ['enemies', 'drops', 'projectiles'] });
out.enemyAfter = await p.evaluate(() => window.__swGame.entities.enemies.length);
out.npcAfter = await p.evaluate(() => window.__swGame.entities.npcs.length);

// ---- G8:等一帧真实渲染(实机 rAF;确定性泵后仍能等帧) ----
out.frame = await nextFrame(p);
out.frame2 = await nextFrame(p);
console.log(JSON.stringify(out));
await b.close();
process.exit(0);
