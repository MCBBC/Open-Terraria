// Y3（W4-债2 补齐②）——观战（specCam）跟踪源实机光照连续性探针（MP 双端）。
//
// 定谳锚（1457 反编译直读）：
//   汇入点 = Main.GetObjectTrackingCameraPan 第一支（Main.cs:63682-63687）——
//   LocalPlayer.spectating>=0 → SpectatingCameraPosition（Player.cs:4066-4077:
//   目标代理 Bottom+(0,gfxOffY−21)+netOffset）。
//   **SP 不可达=原版本相（三锚）**：① SpectateNextPlayer 头 `netMode==0 →
//   return false`（Player.cs:17042-17044）；② 死亡观战控制入口 `netMode==1 &&
//   CanDeathSpectate`（:17188）；③ 占卜球 5644 单机使用播 Game.SpectateSinglePlayer
//   聊天提示即返（:44046-44048）。⇒ W4 报备「specCam net-only SP 不可达」定谳
//   证实——本源走 MP 双端实机（任务书「单机可复现」假设被源码证伪,以源码为准）。
//   本仓接线 = spectateCamPos（Game.ts:5048,net.active 门=原版同相）→ camTX
//   （Game.ts:11874-11875,全链优先序 1:1）→ 光照区域锚相机（Game.ts:12216,
//   ★W4 修复面）。观战入环选 = spectateCycle（Game.ts:5103-5150,
//   HandleSpectatingControls :16931-16978 对位）。
//
// 实机判据（与 W4 高尔夫链同机制）：
//   房主先瞬移 200 格正东 → 客户端死亡（deadTime≥60=CanDeathSpectate,
//   Player.cs:4079-4088）→ Left 环选入观战 → 相机跟房主代理（200 格外）→
//   coverage=1 + 中心实亮（W4 修复前该面=区域锚玩家,coverage→0 全屏黑）+
//   原子截图留档；Space 退出 → 相机回自身。
//
// 用法：SW_ORIGIN=http://localhost:5740 node tools/run-diag.mjs scripts/_y3-spectate-light.mjs
// 前置：中央服务器已起（node tools/dev-mp-server.mjs 或 server/: npx tsx src/index.ts
// --port 17777,env SW_MP_PORT 可指它端口）
// 产物：JSON 台账(stdout) + 截图 docs/evidence/w4/y3-spectate-follow.png
import {
  launchBrowser, openPage, bootstrap, createGame,
  ledger, resolveShotPath, front,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.env.W4_OUT || 'docs/evidence/w4';
const MP_WS = process.env.SW_MP_WS || 'ws://127.0.0.1:17777';
const MP_LOBBY = process.env.SW_MP_LOBBY || '127.0.0.1:17778';
const L = ledger();

function saveDataURL(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
  return path;
}

// ---- 页内采样器（与 _y3-fpv-drone-light 同面+specCam 源判定） ----
const SAMPLE_SRC = (() => {
  function sample() {
    const g = window.__swGame;
    const cam = g.camera, p = g.player, li = g.lighting;
    const halfWT = cam.viewW / 2 / cam.zoom / 16, halfHT = cam.viewH / 2 / cam.zoom / 16;
    const cxT = cam.x / 16, cyT = cam.y / 16;
    const vx0 = Math.floor(cxT - halfWT), vx1 = Math.ceil(cxT + halfWT);
    const vy0 = Math.floor(cyT - halfHT), vy1 = Math.ceil(cyT + halfHT);
    const rx = li.rx, ry = li.ry, rw = li.rw, rh = li.rh;
    const ix0 = Math.max(vx0, rx), iy0 = Math.max(vy0, ry);
    const ix1 = Math.min(vx1, rx + rw - 1), iy1 = Math.min(vy1, ry + rh - 1);
    const vw = vx1 - vx0 + 1, vh = vy1 - vy0 + 1;
    const inter = (ix1 >= ix0 && iy1 >= iy0) ? (ix1 - ix0 + 1) * (iy1 - iy0 + 1) : 0;
    const center = li.lightAt(Math.floor(cxT), Math.floor(cyT));
    const drone = g.camera.droneTracker.tryTracking(g.player, g.player.inv);
    const golf = !p.dead ? g.golfState.tryGetCameraTrackingPosition() : null;
    const source = (g.spectatingSlot >= 0 && g.net?.active) ? 'spec'
      : p.dead ? 'deadlock'
        : drone ? 'drone' : golf ? 'golf' : 'player';
    return {
      source,
      specSlot: g.spectatingSlot,
      mySlot: g.net?.mySlot ?? null,
      distTiles: Math.round(Math.hypot(cam.x - p.cx, cam.y - p.cy) / 16 * 10) / 10,
      coverage: Math.round(inter / (vw * vh) * 1000) / 1000,
      centerLit: Math.round(center[0] + center[1] + center[2]),
      region: [rx, ry, rw, rh],
      cam: [Math.round(cam.x), Math.round(cam.y)],
      self: [Math.round(p.cx), Math.round(p.cy)],
      dead: p.dead,
      deadTime: Math.round(p.deadTime),
    };
  }
  return sample.toString();
})();

const browser = await launchBrowser({});
const mkPage = async () => {
  const page = await openPage(browser, {});
  await bootstrap(page, process.env.SW_ORIGIN);
  return page;
};

// ---- 双页后台续跑（★MP 双页并跑的关键）：headless 后台 tab rAF 饿死（首跑实锤:
//   A 页 painted=1/tick=0/entryFreeze 挂死）——开 backgroundRun+playWhenUnfocused
//   （Game.ts:8569 真值表 on/on=后台泵驱动 fixedUpdate,失焦不暂停）双页并跑 ----
const enableBgRun = async (page, tag) => {
  const r = await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    options.data.backgroundRun = true;
    options.data.playWhenUnfocused = true;
    return { br: options.data.backgroundRun, pwu: options.data.playWhenUnfocused };
  });
  console.log(`[y3-spec] bgRun ${tag}:`, JSON.stringify(r));
};

// ---- A:房主建世界+建房+进房 ----
const pageA = await mkPage();
const genA = await createGame(pageA, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('A 世界已建', genA.ok);
await enableBgRun(pageA, 'A');
await pageA.evaluate(() => { window.__swGame.enemySpawnEnabled = false; });
const created = await pageA.evaluate(async (lobby) =>
  window.__swFlow.createRoom(lobby, { public: true }), MP_LOBBY);
L.chk('建房成功（码+hostToken）', !!created?.code && !!created?.hostToken,
  JSON.stringify(created?.error ?? created?.code));
if (!created?.code) { L.print(); console.log('LEDGER RED'); await browser.close(); process.exit(1); }
const joinedA = await pageA.evaluate(async (url, token) => {
  try { await window.__swFlow.joinRoom(url, token); } catch (e) { return { err: String(e) }; }
  const g = window.__swGame;
  return { ok: !!g.net?.active, isHost: g.net?.policy?.isHost, slot: g.net?.mySlot };
}, `${MP_WS}/${created.code}?token=${encodeURIComponent(created.hostToken)}`, created.hostToken);
L.chk('A 房主进房', !!joinedA.ok && joinedA.isHost === true, JSON.stringify(joinedA));

// ---- 自愈:join 换实例链后 rAF 循环可能未随 enterGame 复活（tick 定格=net.tick
//   断泵→msg13 零上行,首跑实锤 A 端 tick=0）——start() 幂等（running 门）----
const healA = await pageA.evaluate(() => {
  const g = window.__swGame;
  const before = { running: g.running, tick: g.tickCount,
    entryFreeze: g.entryFreezeActive, painted: g._paintedFrames };
  g.start();
  return before;
});
console.log('[y3-spec] A start自愈前:', JSON.stringify(healA));

// ---- B:访客加入 ----
const pageB = await mkPage();
await pageB.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await enableBgRun(pageB, 'B');
const joinedB = await pageB.evaluate(async (url) => {
  try { await window.__swFlow.joinRoom(url, ''); } catch (e) { return { err: String(e) }; }
  const g = window.__swGame;
  return { ok: !!g.net?.active, isHost: g.net?.policy?.isHost, slot: g.net?.mySlot,
    hasPlayer: !!g.player };
}, `${MP_WS}/${created.code}`);
L.chk('B 访客进房', !!joinedB.ok && joinedB.isHost === false && !!joinedB.hasPlayer,
  JSON.stringify(joinedB));
await pageB.evaluate(() => { window.__swGame.start(); });
await new Promise((r) => setTimeout(r, 2500));
let seeA = 0, seeB = 0;
for (let i = 0; i < 20; i++) {
  seeA = await pageA.evaluate(() =>
    [...window.__swGame.net.players.values()].filter((p) => p.active).length);
  seeB = await pageB.evaluate(() =>
    [...window.__swGame.net.players.values()].filter((p) => p.active).length);
  if (seeA === 2 && seeB === 2) break;
  await new Promise((r) => setTimeout(r, 500));
}
// 互见=信息面非判据面（A 端晚登记不拦中继:aoiGrid 成员资格随各自 msg13 独立成立）
console.log(`[y3-spec] 互见: A=${seeA} B=${seeB}${seeA < 2 ? '（A 端晚登记,信息项）' : ''}`);

// ---- 发送插桩:包 send 按 msgId 计数（帧头 [2]=msgId,server 同法读） ----
const tapNet = (page, tag) => page.evaluate(() => {
  const g = window.__swGame;
  if (!g?.net || g.net.__y3Tapped) return false;
  g.net.__y3Tapped = true;
  window.__y3Sent = {};
  const orig = g.net.send.bind(g.net);
  g.net.send = (frame) => {
    try { const id = frame[2]; window.__y3Sent[id] = (window.__y3Sent[id] ?? 0) + 1; } catch { /* noop */ }
    return orig(frame);
  };
  return true;
}).then((ok) => console.log(`[y3-spec] netTap ${tag}: ${ok}`));
await tapNet(pageA, 'A');
await tapNet(pageB, 'B');

// ---- 时序纪律（服务器 AOI 中继语义决定）：房主先留身边（msg13 中继半径
//   AOI_PLAYER=1920px,room.ts broadcastAt send1）→ B 死亡入观战（观战接收端走
//   aoiSpectators 线性集,中继锚目标位=无视距离）→ 房主再远行。先远后观战会被
//   1920px 中继半径截流（访客代理饿死=首跑实锤）。 ----
await front(pageB);
let proxyB = { px: null, py: null, selfX: 0 };
for (let i = 0; i < 12; i++) {
  proxyB = await pageB.evaluate(() => {
    const g = window.__swGame;
    const proxy = g.remotePlayerProxies?.[0] ?? null;
    return { px: proxy ? Math.round(proxy.cx) : null, py: proxy ? Math.round(proxy.cy) : null,
      selfX: Math.round(g.player.cx) };
  });
  if (proxyB.px !== null && Math.abs(proxyB.px - proxyB.selfX) < 800) break;
  await new Promise((r) => setTimeout(r, 500));
}
L.chk('B 端代理在身边(≤800px,同 spawn 域)', proxyB.px !== null
  && Math.abs(proxyB.px - proxyB.selfX) < 800, JSON.stringify(proxyB));

// ---- 双死结构（服务器 AOI 中继时序 + 600t 复生窗双约束）：
//   第一死：B 在房主身边入观战（观战接收端走 aoiSpectators 线性集,中继锚目标位
//   =无视距离）→ 房主瞬移 200 格 → 等条带/烘焙/光照管线沉降（复生窗内不采证）；
//   第二死：重入观战 → 相机直落已沉降区 → 稳态采样+原子截图（全程 <复生窗）。 ----
const killB = async () => {
  await front(pageB);
  await pageB.evaluate(() => { window.__swGame.player.hp = 0; });
  for (let i = 0; i < 40; i++) {
    const ok = await pageB.evaluate(() => {
      const g = window.__swGame;
      return g.player.dead && g.player.deadTime >= 60 && !g.player.isGhostPhase(g.world);
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};
const sampleB = () => pageB.evaluate(({ fnSrc }) => {
  const fn = new Function(`return (${fnSrc})`)();
  return fn();
}, { fnSrc: SAMPLE_SRC });

// ---- 第一死:入观战 → 房主远行 → 沉降 ----
L.chk('第一死:CanDeathSpectate 就绪', await killB());
await front(pageB);
await pageB.keyboard.press('ArrowLeft');
await new Promise((r) => setTimeout(r, 1500));
const spec0 = await sampleB();
L.chk('B 入观战:specSlot=房主槽≠自槽,源=spec,代理在跟',
  spec0.specSlot >= 0 && spec0.mySlot !== null && spec0.specSlot !== spec0.mySlot
  && spec0.source === 'spec' && spec0.distTiles < 40, JSON.stringify(spec0));

// ---- 房主瞬移 200 格正东【地表亮位】（A 端本地扫地表:目标列从天顶下探首实心,
//   落点=地表上 3 格——防原 y 在东侧地形抬升后落山体洞里=合法暗点）→ 相机追 ----
const hostPos = await pageA.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const tx = Math.floor(g.player.cx / 16) + 200;
  let ty = 0;
  while (ty < st.h - 2 && !st.isSolid(tx, ty)) ty++;
  g.player.x = tx * 16 + 8; g.player.y = ty * 16 - 48;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  return { cx: Math.round(g.player.cx), cy: Math.round(g.player.cy), tx, ty };
});
let chase = { px: null, sx: null, recx: null, lit: null };
const chaseTrace = [];
for (let i = 0; i < 32; i++) {
  await new Promise((r) => setTimeout(r, 500));
  chase = await pageB.evaluate(() => {
    const g = window.__swGame;
    const proxy = g.remotePlayerProxies?.[0] ?? null;
    const rec = g.net?.players?.get?.(0) ?? null;
    const li = g.lighting, cam = g.camera;
    const c = li.lightAt(Math.floor(cam.x / 16), Math.floor(cam.y / 16));
    return { px: proxy ? Math.round(proxy.cx) : null,
      sx: Math.round(g.camera.x), recx: rec ? Math.round(rec.x) : null,
      lit: Math.round(c[0] + c[1] + c[2]),
      spec: g.spectatingSlot, dead: g.player.dead };
  });
  if (i % 4 === 0) chaseTrace.push(chase);
  if (chase.px !== null && chase.sx !== null && chase.spec >= 0
    && Math.abs(chase.sx - hostPos.cx) < 400 && chase.lit > 0) break;
}
console.log('[y3-spec] 追击轨迹(每2s):', JSON.stringify(chaseTrace));
if (!(chase.px !== null && chase.sx !== null && Math.abs(chase.sx - hostPos.cx) < 400
  && chase.lit > 0)) {
  // 诊断:相机是否锚向 hostPos / 中继 players 表是否到位 / 页错误环
  const diagB = await pageB.evaluate(() => ({
    tick: window.__swGame.tickCount,
    rec0: (() => { const r = window.__swGame.net?.players?.get?.(0);
      return r ? { x: Math.round(r.x), y: Math.round(r.y), fresh: r.fresh } : null; })(),
    proxy: window.__swGame.remotePlayerProxies?.[0]
      ? { slot: window.__swGame.remotePlayerProxies[0].__netSlot,
          x: Math.round(window.__swGame.remotePlayerProxies[0].x),
          y: Math.round(window.__swGame.remotePlayerProxies[0].y) }
      : null,
    specSlot: window.__swGame.spectatingSlot,
  }));
  console.log('[y3-spec][diag] hostPos=' + JSON.stringify(hostPos));
  console.log('[y3-spec][diag] B', JSON.stringify(diagB));
  const sentA = await pageA.evaluate(() => window.__y3Sent ?? null);
  const sentB = await pageB.evaluate(() => window.__y3Sent ?? null);
  console.log('[y3-spec][diag] sentA', JSON.stringify(sentA));
  console.log('[y3-spec][diag] sentB', JSON.stringify(sentB));
  console.log('[y3-spec][diag] A errors', JSON.stringify(pageA.__probeErrors?.slice(0, 5) ?? []));
  console.log('[y3-spec][diag] B errors', JSON.stringify(pageB.__probeErrors?.slice(0, 5) ?? []));
}
L.chk('第一死沉降:相机跟房主 200 格外+中心点亮', chase.px !== null && chase.sx !== null
  && Math.abs(chase.sx - hostPos.cx) < 400 && chase.lit > 0, JSON.stringify(chase));

// ---- 回身份:退出观战等复生（沉降态=B 端已落格的条带/烘焙/光照,跨复生保留） ----
await front(pageB);
await pageB.keyboard.press('Space');
for (let i = 0; i < 60; i++) {
  const st = await pageB.evaluate(() => ({
    alive: !window.__swGame.player.dead, spec: window.__swGame.spectatingSlot }));
  if (st.alive && st.spec === -1) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 2000));

// ---- 第二死:重入观战 → 稳态采证（条带已在位,秒级就位） ----
L.chk('第二死:CanDeathSpectate 就绪', await killB());
await front(pageB);
await pageB.keyboard.press('ArrowLeft');
await new Promise((r) => setTimeout(r, 1200));
const spec1 = await sampleB();
L.chk('第二死入观战:源=spec 相机锚代理(>180 格)',
  spec1.source === 'spec' && spec1.specSlot >= 0 && spec1.distTiles > 180,
  JSON.stringify(spec1));

// 观战采样序列（第二死:条带/烘焙已在位,秒级稳态;每 600ms×8）
const series = [];
for (let i = 0; i < 8; i++) {
  await front(pageB);
  series.push(await pageB.evaluate(({ fnSrc }) => {
    const fn = new Function(`return (${fnSrc})`)();
    return fn();
  }, { fnSrc: SAMPLE_SRC }));
  await new Promise((r) => setTimeout(r, 600));
}
console.log('[y3-spec] 观战逐采(600ms):');
for (const s of series) console.log('  ', JSON.stringify(s));
const covMin = Math.min(...series.map((s) => s.coverage));
const distMin = Math.min(...series.slice(-4).map((s) => s.distTiles));
const srcSet = [...new Set(series.map((s) => s.source))];
L.chk('观战跟拍源=spec 且相机锚代理(稳态>180 格)',
  srcSet.length === 1 && srcSet[0] === 'spec' && distMin > 180,
  `src=${srcSet} distMin(后4)=${distMin}`);
L.chk('W4 判据:观战跟拍 coverage=1 + 中心实亮',
  covMin >= 0.999 && series.slice(-4).every((s) => s.centerLit > 0),
  `covMin=${covMin} centerLit尾4=${series.slice(-4).map((s) => s.centerLit)}`);

// ---- 原子截图（观战视角视口实亮,本机尸体 200 格画面外;沉降已就位快拍） ----
for (let round = 0; round < 2; round++) {
  await front(pageB);
  await pageB.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 4; i++) g.render(); });
  await new Promise((r) => setTimeout(r, 250));
}
await front(pageB);
const shot = await pageB.evaluate(({ fnSrc }) => {
  const fn = new Function(`return (${fnSrc})`)();
  const g = window.__swGame;
  g.render();
  const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  return { mid: fn(), data: cv ? cv.toDataURL('image/png') : null };
}, { fnSrc: SAMPLE_SRC });
saveDataURL(resolveShotPath(OUT + '/y3-spectate-follow', OUT), shot.data);
console.log('[y3-spec] 留档拍:', JSON.stringify(shot.mid));
L.chk('留档拍 coverage=1 + 中心实亮 + 源=spec',
  shot.mid.coverage >= 0.999 && shot.mid.centerLit > 0 && shot.mid.source === 'spec',
  `cov=${shot.mid.coverage} centerLit=${shot.mid.centerLit}`);

// ---- Space 退出观战 → 相机回自身 ----
await front(pageB);
await pageB.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 1500));
const exit0 = await pageB.evaluate(({ fnSrc }) => {
  const fn = new Function(`return (${fnSrc})`)();
  return fn();
}, { fnSrc: SAMPLE_SRC });
L.chk('Space 退出:specSlot=-1 相机回自身(<3 格)',
  exit0.specSlot === -1 && exit0.distTiles < 3, JSON.stringify(exit0));

L.print();
console.log(`LEDGER ${L.ok ? 'GREEN' : 'RED'} (${L.elapsed()})`);
await browser.close();
process.exit(L.exitCode());
