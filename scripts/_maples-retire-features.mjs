// ★Maples 双轨渲染退役刀——三特征截图指纹 + 玩家兜底专项探针 v3(2026-10-16)。
// 面①三特征 64×64 裁片(草地绿边/T.TALLGRASS/T.SAPLING):刀前后 md5 必须全等
//   ——烘焙层(ChunkBake 死支删除)+动态层(WindSway)双面零扰动。
//   ★强植口径(审计§验证③):固定种子世界无 tallgrass/sapling 自然存量(T.TALLGRASS=21
//   无生产者;T.SAPLING=24 仅玩家种橡实)——出生点屏内确定性强植(同位同帧)。
// 面②玩家三臂(null 外观=Maples 兜底面/默认外观/定制外观):
//   · arm-default/arm-custom:非空外观路径刀前后必须逐位全等(回归保护)
//   · arm-null 刀后 ≡ arm-default 刀后(刀0 兜底换默认纸娃娃的等价判据)
//   · arm-null 刀前≠刀后(预期可见变化:Maples 小人→默认纸娃娃)
// ★确定性设计 v3(前两版漂移定谳:①云=跨跑随机面[a2 判例同源]→sky.draw 纯色化;
//   ②paused 冻 fixedUpdate=冻相机跟随[Renderer 相机段在 fixedUpdate 内]→特征
//   挪到出生点屏内、全程零传送、入场收敛后立即暂停;WorldEvolution.rng 续流
//   面只在入场窗暴露——双跑对拍实证把门)。paused 后渲染循环照常(vui 懒载/
//   渲染路径 chunk get 重烘均活)。
// 世界:?play=small 入场后 __swGame.newWorld 固定种子(判例:勿用 __swFlow.newWorld)。
// 输出:SW_FEAT_OUT 落 JSON(md5+b64);SW_FEAT_SHOT_DIR 落整屏截图(可选)。
// 运行:SW_ORIGIN=http://localhost:5211 SW_FEAT_OUT=/tmp/xxx.json \
//      node tools/run-diag.mjs --timeout=600000 scripts/_maples-retire-features.mjs
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5211';
const SEED = '05162020';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5b = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
const SHOT_DIR = process.env.SW_FEAT_SHOT_DIR || '';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));

// ★2D 管线旗(探针定谳链):默认 C10e 三画布栈下天空上屏走 GL 层(sw-c10e-glcanvas
//  自绘,2D sky.draw/skyCtx 被旁路——纯色填充打不进主画布,且 GL 天空含贴图懒载
//  竞态=跨跑漂移源)。?bgl=0&c10e=0&wfbo=0&cloudpipe=0 = 经典单画布 2D 路径
// (a2-pixel-ab 同路径):sky.draw 直画主 ctx → 纯色天空钉死真正上屏。
// 旗面在全部刀前/刀后跑中恒定(对比口径不随旗漂)。
await page.goto(`${ORIGIN}/?play=small&bgl=0&c10e=0&wfbo=0&cloudpipe=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
chk('?play=small 入场', inGame);
if (!inGame) { console.log(JSON.stringify({ fatal: 'entry timeout', errs: pageErrors.slice(0, 5) })); await browser.close(); process.exit(1); }

await page.evaluate(async (seed) => { await window.__swGame.newWorld(seed, 4200, 1200, () => {}); }, SEED);
let worldReady = false;
for (let i = 0; i < 300 && !worldReady; i++) {
  worldReady = await page.evaluate(() => { const g = window.__swGame; return !!(g?.world?.store && g.world.store.w === 4200); }).catch(() => false);
  if (!worldReady) await new Promise((r) => setTimeout(r, 1000));
}
chk('固定种子世界就绪', worldReady);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });   // BJ144 探针坑
await new Promise((r) => setTimeout(r, 2000));   // 相机出生点收敛(此后全程零传送)

// ---- 确定性套件 + 立即暂停(幂等可重施——★探针 v3 定谳:补丁曾一跑静默失效
//      [sky 实际未纯色化但无异常抛出],故本套件做成 applyDeterminism() 幂等函数,
//      每批捕获前重施 + verifyDeterminism() 活体校验,失效=硬红不假绿) ----
await page.evaluate(() => {
  window.__applyDeterminism = () => {
    const g = window.__swGame;
    if (!g) return false;
    // ★天空钉死(2D 管线旗下):sky.draw 原型替换为纯色填充(云/星/日/贴图懒载
    //  竞态全摘)+云量覆写 0 双保险(填充后云本不再画;覆写防任何旁路面)。
    const sky = g.renderer.sky;
    const proto = Object.getPrototypeOf(sky);
    proto.draw = function swProbeSolidSky(ctx, clock, viewW, viewH, camX, dtMs, camY) {
      void clock; void camX; void dtMs; void camY;
      ctx.fillStyle = '#5a7db0';
      ctx.fillRect(0, 0, viewW, viewH);
    };
    sky.menuNumCloudsOverride = 0;
    sky.vclouds.length = 0;
    try {
      const w = g.world.weather;
      if (w) {
        w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false;
        // ★风向会话级±分叉(初始风随机):cloudBGX 漂移方向二态 → 背景云层跨跑
        //  双稳分叉(s2≡s3 vs s1 定谳)。钉死风+清漂移累积。
        if (typeof w.windSpeedCurrent === 'number') w.windSpeedCurrent = 0;
        if (typeof w.windSpeedTarget === 'number') w.windSpeedTarget = 0;
        if (typeof w.windSpeedIntended === 'number') w.windSpeedIntended = 0;
      }
      const bg = g.renderer.biomeBg;
      if (bg?.cloudBGX) { bg.cloudBGX[0] = 0; bg.cloudBGX[1] = 0; }
      // ★bgStyle 双态根因(BiomeBackground.update :921 惰性缓存):caveBackTreeX 只在
      //  首世界写入且跨 newWorld 不清——固定种子世界读到的是随机首世界(?play)的
      //  treeX 树界 → bgStyle Forest1/Forest2 会话级二态(10 vs 0 定谳)。
      //  探针侧清缓存 → update 重读当前(固定种子)世界的 treeX=确定性。
      //  ★登记游戏级债(非本刀面):跨世界 treeX 陈旧缓存,主世界切世界不重掷。
      if (bg) bg.caveBackTreeX = null;
      const fx = g.renderer.weatherFx;
      if (fx) {
        fx.update = () => {};
        (fx.pool || []).forEach((d) => { d.active = false; });
        (fx.snow || []).forEach((d) => { d.active = false; });
        (fx.sand || []).forEach((d) => { d.active = false; });
      }
    } catch { /* 域差异 */ }
    g.enemySpawnEnabled = false;
    try {
      for (const e of g.entities.enemies) e.dead = true;
      for (const c of (g.entities.critters ?? [])) c.dead = true;
    } catch { /* 域差异 */ }
    g.paused = true;   // ★冻 fixedUpdate(相机跟随/世界演化/眨眼钟全停);渲染循环照常
    // ★相机钉到玩家确定坐标:follow 指数逼近永不精确到达(跨跑残差可达整像素——
    // 暂停时刻的收敛相位不定),生物群系背景视差层对 cam 浮点差敏感。玩家坐标跨跑
    // 恒同(元数据实证) → 相机钉 player.cx/cy = 跨跑逐位同(暂停后无人再写相机)。
    g.camera.x = g.player.cx;
    g.camera.y = g.player.cy;
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swSwayPin?.();   // 风摆相位钉(模块导入后可重施)
    return true;
  };
  window.__verifyDeterminism = () => {
    const g = window.__swGame;
    if (!g) return { ok: false, why: 'no-game' };
    const why = [];
    const sky = g.renderer.sky;
    if (Object.getPrototypeOf(sky).draw?.name !== 'swProbeSolidSky') why.push('sky-patch-lost');
    if (sky.menuNumCloudsOverride !== 0) why.push('cloud-override-lost');
    if (!g.paused) why.push('not-paused');
    if (!globalThis.__swClockFrozen) why.push('clock-not-frozen');
    return { ok: why.length === 0, why };
  };
  return window.__applyDeterminism();
});
await page.evaluate(async () => {
  const g = window.__swGame;
  const ta = await import('/src/render/TileAnim.ts');
  ta.tileAnim.tick = 4800;
  const vt = await import('/src/render/VanillaTiler.ts');
  vt.renderEnv.wind = 0;
  vt.renderEnv.worldSurface = g.world.groundLevel;
  vt.renderEnv.remix = false;
  // ★风摆相位钉死:counters 每 tick 无条件累加(暂停时冻结在挂钟相关值)+windSway.wind
  //  留存暂停前天气值——getWindCycle 的 cos 相位跨跑漂移=强植裁片 md5 漂移源。
  //  windGrid 无需钉:静止玩家零写入,入场期写入在 threshold 外恒 [0,0,0]。
  const ws = await import('/src/render/WindSway.ts');
  window.__swSwayPin = () => {
    ta.tileAnim.tick = 4800;
    vt.renderEnv.wind = 0;
    vt.renderEnv.worldSurface = g.world.groundLevel;
    vt.renderEnv.remix = false;
    const c = ws._windSwayInternals.counters;
    c.tree = 0; c.grass = 0; c.sunflower = 0; c.vine = 0;
    ws.windSway.wind = 0;
  };
  window.__swSwayPin();
});
await freezeClock(page, { tod: 0.5 });   // 正午(光照/生物群系背景钟冻结)
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 800));

// ---- 裁片捕获器 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const lc = document.createElement('canvas');
  lc.width = 64; lc.height = 64;
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  window.__crop64 = (wx, wy) => {
    const c = g.renderer.canvas;
    const rect = c.getBoundingClientRect();
    const scale = c.width / rect.width;
    const z = g.camera.zoom;
    const sx = ((wx - g.camera.x) * z + rect.width / 2) * scale;
    const sy = ((wy - g.camera.y) * z + rect.height / 2) * scale;
    lctx.clearRect(0, 0, 64, 64);
    lctx.drawImage(c, Math.round(sx) - 32, Math.round(sy) - 32, 64, 64, 0, 0, 64, 64);
    const d = lctx.getImageData(0, 0, 64, 64).data;
    let bin = '';
    for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + 0x8000, d.length)));
    return btoa(bin);
  };
  window.__shotFull = () => g.renderer.canvas.toDataURL('image/png');
  window.__metaDump = () => {
    const p = g.player;
    const st = g.world.store;
    const feet = [];
    const fx = Math.floor(p.cx / 16), fy = Math.floor((p.y + p.h) / 16);
    for (let dy = -3; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = st.idx(fx + dx, fy + dy);
      feet.push(st.type[i] + (st.flags[i] ? '' : 'g'));
    }
    return {
      px: p.x, py: p.y, pcx: p.cx, pcy: p.cy, onGround: p.onGround,
      facing: p.facing, selected: p.selected, swing: p.swing ?? null,
      useStyle: p.useStyle ?? null, itemRotation: p.itemRotation ?? null,
      cam: [g.camera.x, g.camera.y, g.camera.zoom],
      spawn: [g.world.spawnX, g.world.spawnY],
      feetTileX: fx, feetTileY: fy, feet,
      clockTod: g.world.clock.timeOfDay,
      // 渲染状态全量(双态分叉定位用)
      state: (() => {
        const bg = g.renderer.biomeBg;
        const out = {};
        try {
          for (const k of Object.keys(bg)) {
            const v = bg[k];
            if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) out[k] = v;
            else if (v instanceof Float64Array || v instanceof Float32Array) out[k] = [...v].map((x) => Math.round(x * 1000) / 1000);
            else if (Array.isArray(v)) out[k] = v.length;
            else out[k] = String(typeof v);
          }
        } catch { /* 域差异 */ }
        try {
          const sc = g.scene;
          out.__scene = {};
          for (const k of Object.keys(sc)) { const v = sc[k]; if (typeof v === 'boolean' || typeof v === 'number') out.__scene[k] = v; }
        } catch { /* 域差异 */ }
        try {
          const sky = g.renderer.sky;
          out.__sky = { horizonVis: !!sky.horizonVis, horizonPhase: sky.horizonPhase ?? null };
        } catch { /* 域差异 */ }
        return out;
      })(),
    };
  };
});

/** 烘焙沉降门:可视 chunk 全真对(worker/预算占位清零)再捕获——
 *  wbake worker 波次与入场 2.5s「终态保险全量标脏」的异步重烘是跨跑瞬态源
 *  (placeholder 透明页区=天空透出=像素级差)。★dirtyQueue 不作门:paused 下
 *  flushDirty(fixedUpdate 内)停转,队列留陈旧键;渲染路径 get() 对可视 chunk
 *  同步真烘(混合路由)——真对检查即终态。 */
async function waitBakeSettled(label) {
  for (let i = 0; i < 160; i++) {
    const ok = await page.evaluate(() => {
      const g = window.__swGame;
      const c = g.chunks;
      if (!c.viewportCovered()) return false;
      // 视区=相机×画布(渲染器实际 get 的域);animView 含 +2 chunk 外延带,
      // 外延块渲染器不烘(32/80 恒 missing)——不入门。
      const cv = g.renderer.canvas;
      const z = g.camera.zoom;
      const vx0 = g.camera.x - cv.width / (2 * z), vx1 = g.camera.x + cv.width / (2 * z);
      const vy0 = g.camera.y - cv.height / (2 * z), vy1 = g.camera.y + cv.height / (2 * z);
      for (let cy = Math.floor(vy0 / 256); cy <= Math.floor(vy1 / 256); cy++) {
        for (let cx = Math.floor(vx0 / 256); cx <= Math.floor(vx1 / 256); cx++) {
          if (cx < 0 || cy < 0) continue;
          const p = c.chunks.get(((cx & 0xffff) | ((cy & 0xffff) << 16)));
          if (!p || p.placeholder) return false;
        }
      }
      return true;
    }).catch(() => false);
    if (ok) { await new Promise((r) => setTimeout(r, 200)); return true; }
    await new Promise((r) => setTimeout(r, 250));
  }
  chk(`[${label}] 烘焙沉降`, false, 'timeout');
  return false;
}

/** 捕获:烘焙沉降+补丁重施+活体校验 → 三拍确定性哨兵 + 内容在场门(防纯色/空裁片假绿) */
async function captureAt(label, wx, wy) {
  await waitBakeSettled(label);
  await page.evaluate(() => { window.__applyDeterminism(); });
  const ver = await page.evaluate(() => window.__verifyDeterminism());
  chk(`[${label}] 确定性套件在场`, ver.ok, ver.why?.join(','));
  const c1 = await page.evaluate((x, y) => window.__crop64(x, y), wx, wy);
  await new Promise((r) => setTimeout(r, 400));
  const c2 = await page.evaluate((x, y) => window.__crop64(x, y), wx, wy);
  await new Promise((r) => setTimeout(r, 400));
  const c3 = await page.evaluate((x, y) => window.__crop64(x, y), wx, wy);
  chk(`[${label}] 三拍确定性`, md5b(c1) === md5b(c2) && md5b(c2) === md5b(c3));
  const colors = new Set();
  const buf = Buffer.from(c1, 'base64');
  for (let i = 0; i < buf.length; i += 4) colors.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]},${buf[i + 3]}`);
  chk(`[${label}] 内容在场(≥16 色)`, colors.size >= 16, `colors=${colors.size}`);
  return c1;
}

// ---- 面①:三特征(出生点屏内确定性强植)----
const feats = await page.evaluate(async () => {
  const m = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const T = m.T;
  const found = { grass: null, tallgrass: null, sapling: null };
  const isAir = (x, y) => { const i = st.idx(x, y); return st.type[i] === 0 || !st.flags[i]; };
  const gl = Math.floor(g.world.groundLevel);
  const x0 = g.world.spawnX - 38, x1 = g.world.spawnX + 38;   // 屏内全域(相机 spawn 锚,±38 tile=屏宽内)
  for (let y = Math.max(4, gl - 110); y < Math.min(st.h - 4, gl + 110) && !found.grass; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== T.GRASS) continue;
      if (isAir(x, y - 1)) { found.grass = { x, y }; break; }   // 绿边=上方露空即可
    }
  }
  if (found.grass) {
    const spots = [];
    for (let dx = 2; dx < 20 && spots.length < 2; dx++) {
      const x = found.grass.x + dx;
      // 逐列找自己的地表行(表面起伏,行号随列漂)
      for (let y = found.grass.y - 6; y <= found.grass.y + 6; y++) {
        if (!st.inBounds(x, y)) break;
        const i = st.idx(x, y);
        const t = st.type[i];
        if (t === 0 || !st.flags[i]) continue;   // 该列上方的空格/植物——继续向下找承托
        if ((t === T.GRASS || t === T.DIRT) && isAir(x, y - 1)) spots.push({ x, y: y - 1 });
        break;   // 首个实心格:承托或不可植(石头/装饰)都停
      }
    }
    if (spots.length >= 2) {
      // ★setTileSilent:setTile 的 onTileChanged 监听器链(checkDecorSquareFrame 等)
      //  会条件性击杀强植件(双稳=跨跑 md5 漂移源,逐监听器定位定谳);摆动族不进
      //  烘焙(动态层读活 store),无需 markDirty 链。
      st.setTileSilent(spots[0].x, spots[0].y, T.TALLGRASS, 0, 0);
      st.setTileSilent(spots[1].x, spots[1].y, T.SAPLING, 0, 0);
      found.tallgrass = spots[0];
      found.sapling = spots[1];
    }
  }
  return found;
});
chk('三特征定位(出生点屏内+强植)', !!(feats.grass && feats.tallgrass && feats.sapling),
  `grass@${feats.grass?.x},${feats.grass?.y} tallgrass@${feats.tallgrass?.x},${feats.tallgrass?.y} sapling@${feats.sapling?.x},${feats.sapling?.y}`);
await new Promise((r) => setTimeout(r, 600));   // setTile→渲染路径重烘落地

const featureMd5 = {};
const featureB64 = {};
for (const [name, t] of Object.entries(feats)) {
  if (!t) continue;
  const b64 = await captureAt(`特征:${name}`, t.x * 16 + 8, t.y * 16 + 8);
  featureMd5[name] = md5b(b64);
  featureB64[name] = b64;
  if (SHOT_DIR) {
    const data = await page.evaluate(() => window.__shotFull());
    writeFileSync(`${SHOT_DIR}/feat-${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  }
}
console.log(`[features] ${JSON.stringify(featureMd5)}`);

// ---- 面②:玩家三臂(玩家钉在出生点站位;相机零移动)----
async function pinNoise() {
  await page.evaluate(() => {
    window.__applyDeterminism();
    const p = window.__swGame.player;
    p.vx = 0; p.vy = 0;
    p.animT = 0; p.animTime = 0;
    p.eyeFrame = 0;
    p.facing = 1;                       // ★朝向钉(初始朝向跨跑偶异=镜像翻转整sprite 差)
    try { p.inv.slots[p.selected] = null; } catch { /* 域差异 */ }
  });
}
const playerMd5 = {};
const playerB64 = {};

/** 玩家臂捕获(玩家盒心锚;烘焙沉降+补丁重施+校验+三拍哨兵+内容门) */
async function capturePlayerArm(label) {
  await waitBakeSettled(label);
  await pinNoise();
  const ver = await page.evaluate(() => window.__verifyDeterminism());
  chk(`[${label}] 确定性套件在场`, ver.ok, ver.why?.join(','));
  const c1 = await page.evaluate(() => { const p = window.__swGame.player; return window.__crop64(p.cx, p.cy); });
  await new Promise((r) => setTimeout(r, 400));
  const c2 = await page.evaluate(() => { const p = window.__swGame.player; return window.__crop64(p.cx, p.cy); });
  await new Promise((r) => setTimeout(r, 400));
  const c3 = await page.evaluate(() => { const p = window.__swGame.player; return window.__crop64(p.cx, p.cy); });
  chk(`[${label}] 三拍确定性`, md5b(c1) === md5b(c2) && md5b(c2) === md5b(c3));
  const colors = new Set();
  const buf = Buffer.from(c1, 'base64');
  for (let i = 0; i < buf.length; i += 4) colors.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]},${buf[i + 3]}`);
  chk(`[${label}] 内容在场(≥16 色)`, colors.size >= 16, `colors=${colors.size}`);
  return c1;
}

// arm-null:?play 本态(外观 null)
await page.evaluate(() => { window.__swGame.player.appearance = null; });
await new Promise((r) => setTimeout(r, 500));
playerB64.null_ = await capturePlayerArm('arm-null');
playerMd5.null_ = md5b(playerB64.null_);
if (SHOT_DIR) {
  const data = await page.evaluate(() => window.__shotFull());
  writeFileSync(`${SHOT_DIR}/player-null.png`, Buffer.from(data.split(',')[1], 'base64'));
}

// arm-default:p.appearance = defaultAppearance()(显式默认)
await page.evaluate(async () => {
  const m = await import('/src/player/Appearance.ts');
  window.__swGame.player.appearance = m.defaultAppearance('probe-default');
});
await new Promise((r) => setTimeout(r, 1800));   // 纸娃娃贴图懒载就位(渲染循环照常)
playerB64.default = await capturePlayerArm('arm-default');
playerMd5.default = md5b(playerB64.default);
if (SHOT_DIR) {
  const data = await page.evaluate(() => window.__shotFull());
  writeFileSync(`${SHOT_DIR}/player-default.png`, Buffer.from(data.split(',')[1], 'base64'));
}

// arm-custom:固定定制外观(发型 7/变体 2/定制色——非空非默认路径)
await page.evaluate(() => {
  window.__swGame.player.appearance = {
    name: 'probe-custom', hair: 7, skinVariant: 2,
    hairColor: { r: 40, g: 200, b: 90 }, skinColor: { r: 255, g: 125, b: 90 },
    eyeColor: { r: 20, g: 40, b: 220 }, shirtColor: { r: 200, g: 40, b: 40 },
    undershirtColor: { r: 40, g: 40, b: 200 }, pantsColor: { r: 230, g: 200, b: 60 },
    shoeColor: { r: 90, g: 60, b: 30 }, difficulty: 0, team: 0, voicePitchOffset: 0,
  };
});
await new Promise((r) => setTimeout(r, 1800));
playerB64.custom = await capturePlayerArm('arm-custom');
playerMd5.custom = md5b(playerB64.custom);
if (SHOT_DIR) {
  const data = await page.evaluate(() => window.__shotFull());
  writeFileSync(`${SHOT_DIR}/player-custom.png`, Buffer.from(data.split(',')[1], 'base64'));
}
console.log(`[player] ${JSON.stringify(playerMd5)}`);

// arm-null ≡ arm-default 等价性(刀0 兜底判据;刀前为 Maples 小人=预期不等,刀后必须等)
chk('[刀0 判据] arm-null ≡ arm-default', playerMd5.null_ === playerMd5.default,
  playerMd5.null_ === playerMd5.default ? 'null 外观走默认纸娃娃' : '不等(刀前=Maples 小人,预期;刀后必须全等)');
chk('零页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const payload = {
  seed: SEED, ts: Date.now(), featureMd5, playerMd5, featureB64, playerB64,
  meta: await page.evaluate(() => window.__metaDump()),
  feats, pageErrors: pageErrors.length,
};
const out = process.env.SW_FEAT_OUT;
if (out) { writeFileSync(out, JSON.stringify(payload, null, 1)); console.log(`[features] 落盘 ${out}`); }
console.log('\n==== maples-retire features 判语 ====');
console.log(JSON.stringify({ featureMd5, playerMd5, pageErrors: pageErrors.length }, null, 2));
await browser.close();
process.exit(pageErrors.length === 0 && results.every((r) => r.ok) ? 0 : 1);
