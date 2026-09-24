// ★opresent 单 present 合并 像素对拍+回贴账证明（2026-09-25;_c10b/_b2b 页内翻面范式）。
// 天空栈（C10b bg+云合并背板）与世界合成（A2 光照×扭曲链）分两次全屏回贴主画布,
// opresent=1 合并为一次:FBO('bg') 挂起→compose pass3 over(warped,bg)→单 present。
// 判据：
//   GA  回贴账:opresent 关=每帧 pipe→主画布全幅 blit 恰 2 次（天空栈+最终合成）;
//       开=恰 1 次（仅最终合成）——2→1 定谳;composePathUsed 尾 '+opresent'。
//   GB  终帧 census A(off) vs B(on):maxΔ≤2（porter-duff 结合律族——半透明
//       重叠像素 8bit 量化分组差 ±1~2LSB 备案;W.a∈{0,1} 域逐字节）。
//   GC  翻回 A'≡A 逐字节（无残留）+两次捕获恒等（确定性哨兵）。
//   GD  夹层回退:派对气球在场（opresentInterlayerPending=true）→ B 态回退双 blit
//       （count==2）+opresentUsed=false+终帧与 A 逐字节（回退=现行为）。
//   GE  低清档 K=0.5:门 wK==1 假 → 回退双 blit（count==2）。
//   GF  矩阵:6 群系×晴/阴雨/风暴 × 缩放/相机相位 × 洞穴（早退 defer 路径）×
//       水下（warp 链激活,uWater 门控纹理在场）× 重力翻转——逐相位 GB/GC。
// 仪器:cloudMergeUsed/composePathUsed/opresentUsed/opresentStats/pipe blit 计数钩。
// 运行:SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs --timeout=1200000 scripts/_opresent-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?opresent=1&cloudcache=0';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件 + 常开 blit 钩 + 翻面/夹层注入面 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    window.__blits = [];   // 帧界:仅重置（bg/云/合成 blit 全在 render 后段）
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0:云/灯/气球全停
  };
  // ★气球钉面:Renderer 侧调用硬编码 dtMs=16.7（sky.draw wrapper 管不到）——
  //  气球逐帧漂移=A/B/A' 捕获伪差源。dt=0 冻结在位（位仍画=GD 真夹层面）
  const origBalloons = proto.drawPartyBalloonsNear;
  sky.drawPartyBalloonsNear = function (ctx, viewW, viewH, camX, dtMs) {
    return origBalloons.call(this, ctx, viewW, viewH, camX, 0);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__cloudUnpin = () => { delete sky.maintainClouds; };
  // ★环境实体钉面（鸟群 per-render 自走动画=伪差源;谓词面单独测——GD 相位用气球）
  //  ★钉面连带①:createGame 期渲染已可能掷入鸟群——桩冻住 ambEntities（不推进不
  //  过滤）→ 谓词 ambEntities.length>0 恒真=合并全被挡。清空+桩=稳态空窗。
  //  ★钉面连带②:drawAmbience 桩冻住 ambNextAttempt 倒计时（初值 0=掷族窗口常开）
  //  → 「本帧可能到期掷族」恒真。钉到远期=生产首掷后（600+）稳态语义。
  sky.drawAmbience = () => {};
  sky.ambEntities.length = 0;
  sky.ambNextAttempt = 1000000;
  window.__weatherSet = ({ raining, alpha, numClouds }) => {
    const w = g.world.weather;
    if (!w) return false;
    if (raining !== undefined) w.raining = raining;
    if (alpha !== undefined) { w.cloudAlpha = alpha; w.maxRaining = alpha; }
    if (numClouds !== undefined) w.numClouds = numClouds;
    w.lightning = 0;
    return true;
  };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
  window.__pause = (v) => { g.paused = v; };
  window.__biomePin = (style) => {
    const bb = g.renderer.biomeBg;
    bb.snapStyle(style);
    bb.update = () => {};
    return bb.bgStyle;
  };
  window.__opresentSet = (v) => r.constructor.opresentSetForTest(v);
  window.__partySet = (v) => { if (g.renderer.scene) g.renderer.scene.partyUp = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  window.__grav = (v) => { g.player.gravDir = v; };
  // ★水下注入:玩家脚下前方挖池+注满水（前景水 α 门控+扭曲链激活帧）
  window.__waterPool = () => {
    const st = g.world.store;
    const px = Math.floor(g.player.x / 16), py = Math.floor((g.world.groundLevel ?? 300) * 1);
    for (let y = py; y < py + 6; y++) {
      for (let x = px - 4; x < px + 5; x++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.liquid[i] = 255;   // 水
        if (st.isSolid(x, y)) { st.type[i] = 0; st.flags[i] = 0; }   // 掏空
      }
    }
    return true;
  };
  window.__paths = () => ({
    merge: window.__swGame.renderer.cloudMergeUsed,
    compose: window.__swGame.renderer.composePathUsed,
    opresentUsed: window.__swGame.renderer.opresentUsed,
    opresentStats: window.__swGame.renderer.opresentStats,
  });
  // ★常开钩:pipe 画布→主画布的全幅 blit 计数+副本（回贴账判据 GA;
  //  目标=主画布过滤（B1 桥接 worldCtxLayer 回贴不混入）;副本供逐字节比对）
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__opresentPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      if (!w.__inOpHook && w.__blits) {
        const r = w.__swGame?.renderer;
        const isPipe = !!r && (src === r.cloudPipeLayer?.canvas || src === r.worldCompose?.pipeline?.canvas);
        if (isPipe && this.canvas === r.canvas) {
          const cp = document.createElement('canvas');
          cp.width = src.width; cp.height = src.height;
          w.__inOpHook = true;
          try { cp.getContext('2d').drawImage(src, 0, 0); } finally { w.__inOpHook = false; }
          w.__blits.push({ args: rest.length, w: src.width, h: src.height, cp });
        }
      }
      return orig.call(this, src, ...rest);
    };
    P.__opresentPatched = true;
  }
});
// ★停 rAF 主循环——渲染全权由 waitFrame 同步驱动（headless rAF 0~3fps 不可预期）
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 2;
}));
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 160);
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await waitFrame(8);

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}

/** 读回当前 __blits（cp→ImageData→b64;node 侧 md5）。空=渲染未及,重试窗 */
async function readBlits() {
  for (let i = 0; i < 10; i++) {
    await waitFrame(1);
    const arr = await page.evaluate(() => (window.__blits || []).map((b) => ({ args: b.args, w: b.w, h: b.h, hasCp: !!b.cp })));
    if (arr.length > 0 && arr.every((b) => b.hasCp)) {
      const out = await page.evaluate(() => (window.__blits || []).map((b) => {
        const cx = b.cp.getContext('2d', { willReadFrequently: true });
        const d = cx.getImageData(0, 0, b.w, b.h).data;
        let bin = '';
        const CH = 0x8000;
        for (let j = 0; j < d.length; j += CH) bin += String.fromCharCode.apply(null, d.subarray(j, Math.min(j + CH, d.length)));
        return { args: b.args, w: b.w, h: b.h, b64: btoa(bin) };
      }));
      return out.map((b) => ({ args: b.args, w: b.w, h: b.h, md5: md5(b.b64), b64: b.b64 }));
    }
  }
  return [];
}

/** 终帧快照（主画布全帧） */
async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}

/** census:A vs B 全帧差分（像素数/maxΔ/bbox） */
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i++) {
      const dd = Math.abs(P[i] - Q[i]);
      if (dd > 0) {
        n++;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}

/** 单相位主流程:A(off)→B(on)→A'(翻回)。返回捕获+路径 */
async function phase(label) {
  await page.evaluate(() => window.__opresentSet(false));
  await waitFrame(4);
  const A1 = await readBlits();
  await waitFrame(1);
  const A2 = await readBlits();
  const m1 = md5(JSON.stringify(A1.map((b) => b.md5)));
  const m2 = md5(JSON.stringify(A2.map((b) => b.md5)));
  chk(`[${label}] A 两次捕获恒等`, A1.length > 0 && m1 === m2, `${A1.length} blits`);
  const A = { bl: A2, fin: await snapFin(), paths: await page.evaluate(() => window.__paths()) };
  await page.evaluate(() => window.__opresentSet(true));
  await waitFrame(4);
  const B1 = await readBlits();
  await waitFrame(1);
  const B2 = await readBlits();
  chk(`[${label}] B 两次捕获恒等`, B1.length > 0 && md5(JSON.stringify(B1.map((b) => b.md5))) === md5(JSON.stringify(B2.map((b) => b.md5))), `${B1.length} blits`);
  const B = { bl: B2, fin: await snapFin(), paths: await page.evaluate(() => window.__paths()) };
  await page.evaluate(() => window.__opresentSet(false));
  await waitFrame(4);
  const A2f = await snapFin();
  chk(`[${label}] GC A'≡A 翻回恢复（无残留）`, A2f.b64 === A.fin.b64,
    `fin ${md5(A.fin.b64).slice(0, 8)}/${md5(A2f.b64).slice(0, 8)}`);
  return { A, B };
}

/** 判据组 GA（回贴账）+GB（census）。
 *  ★回贴账口径（任务书 3→2）:pipe→主画布全幅 blit 全账=远景云 pass1（sky.draw
 *  内,C10 范围外）+天空栈合并背板+最终合成=3;opresent 摘除其一天空栈 → 2。
 *  地下（pass1 远景早退）账=2→1。expectSurface 传「A 态应有 blit 数」。 */
async function judge(label, { A, B }, { expectFallback = false, aWanted = 3 } = {}) {
  const aN = A.bl.length, bN = B.bl.length;
  if (expectFallback) {
    chk(`[${label}] GA 回退双 blit（夹层/低清档——B 态 count==A 态 count）`, bN === aN && bN >= 2,
      `A=${aN} B=${bN} args=[${B.bl.map((b) => b.args)}]`);
    chk(`[${label}] GA2 回退态 opresentUsed=false`, B.paths.opresentUsed === false,
      `used=${B.paths.opresentUsed} stats=${JSON.stringify(B.paths.opresentStats)}`);
    const c = await census(A.fin, B.fin);
    chk(`[${label}] GD 回退像素=现行为（逐字节）`, c.n === 0,
      `n=${c.n} maxΔ=${c.maxd}`);
  } else {
    chk(`[${label}] GA A 态全幅回贴=${aWanted}（远景云+天空栈+最终合成）`, aN === aWanted,
      `count=${aN} args=[${A.bl.map((b) => b.args)}]`);
    chk(`[${label}] GA B 态全幅回贴=${aWanted - 1}（摘天空栈——合并账 ${aWanted}→${aWanted - 1}）`, bN === aWanted - 1,
      `count=${bN} args=[${B.bl.map((b) => b.args)}]`);
    chk(`[${label}] GA2 B 态 composePath 尾 +opresent`, /opresent$/.test(B.paths.compose),
      `compose=${B.paths.compose} used=${B.paths.opresentUsed}`);
    chk(`[${label}] GA3 B 态 opresentUsed=true`, B.paths.opresentUsed === true,
      `stats=${JSON.stringify(B.paths.opresentStats)}`);
    const c = await census(A.fin, B.fin);
    chk(`[${label}] GB 终帧 census maxΔ≤2（结合律备案族;W.a∈{0,1} 域逐字节）`, c.maxd <= 2,
      `n=${c.n} maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}${c.n === 0 ? ' [逐字节]' : ''}`);
  }
}

// ---- 相位 0:晴天 forest 地表——主判据（GA/GB/GC） ----
{
  const r = await phase('晴天合并');
  await judge('晴天合并', r);
}
// ---- 相位 0b:强制夹层（派对气球——谓词真 → 回退双 blit） ----
await page.evaluate(() => window.__partySet(true));
await waitFrame(3);
{
  const r = await phase('派对夹层回退');
  await judge('派对夹层回退', r, { expectFallback: true });
  const pred = await page.evaluate(() => window.__swGame.renderer.sky.opresentInterlayerPending());
  chk('[派对] 夹层谓词=true（fx.party 源头驱动）', pred === true, `pred=${pred}`);
}
await page.evaluate(() => window.__partySet(false));
await waitFrame(2);

// ---- 群系×天气矩阵（合并路径） ----
const BIOMES = [['forest', 0], ['desert', 2], ['snow', 7], ['jungle', 3], ['corruption', 1], ['ocean', 4]];
const WEATHERS = [
  ['晴', { raining: false, alpha: 0, numClouds: 60 }],
  ['阴雨', { raining: true, alpha: 0.8, numClouds: 200 }],
  ['风暴', { raining: true, alpha: 1, numClouds: 200 }],
];
async function prepare({ raining, alpha, numClouds }, zoom = null, camShift = 0) {
  await page.evaluate(() => window.__pause(false));
  await page.evaluate(() => window.__cloudUnpin());
  await page.evaluate((p) => window.__weatherSet(p), { raining, alpha, numClouds });
  if (zoom !== null) await page.evaluate((zv) => { window.__swGame.camera.zoom = zv; }, zoom);
  if (camShift) {
    await page.evaluate((d) => { const g = window.__swGame; g.camera.x += d; if (g.player) g.player.x += d; }, camShift);
  }
  await pump(page, camShift ? 6 : 50);
  await page.evaluate(() => window.__weatherFreeze());
  await page.evaluate(() => window.__cloudPin());
  await page.evaluate(() => window.__pause(true));
  await waitFrame(6);
}
for (const [bName, style] of BIOMES) {
  for (const [wName, w] of WEATHERS) {
    await prepare(w);
    await page.evaluate((s) => window.__biomePin(s), style);
    await pump(page, 60);
    await waitFrame(3);
    const tag = `${bName}·${wName}`;
    const r = await phase(tag);
    await judge(tag, r);
  }
}
// ---- 缩放 + 相机相位（forest·晴） ----
await prepare({ raining: false, alpha: 0, numClouds: 60 }, 1.5625);
await page.evaluate((s) => window.__biomePin(s), 0);
await pump(page, 60);
await waitFrame(3);
{
  const r = await phase('缩放1.5625');
  await judge('缩放1.5625', r);
}
await prepare({ raining: false, alpha: 0, numClouds: 60 }, 1.25, 320);
await page.evaluate((s) => window.__biomePin(s), 0);
await pump(page, 60);
await waitFrame(3);
{
  const r = await phase('相机移动');
  await judge('相机移动', r);
}
// ---- 相位:低清 K=0.5（门 wK==1 假 → 回退双 blit） ----
await prepare({ raining: false, alpha: 0, numClouds: 60 });
await page.evaluate((s) => window.__biomePin(s), 0);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 0.5; }));
await waitFrame(6);
{
  const r = await phase('低清K0.5');
  await judge('低清K0.5', r, { expectFallback: true });
}
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));
// ---- 相位:洞穴暗光（drawCloudsNear 早退 defer 路径+地下 bg） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const gy = (g.world.groundLevel ?? 300) + 48;
  window.__teleport(g.player.x, gy * 16);
});
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
{
  const r = await phase('洞穴暗光');
  await judge('洞穴暗光', r, { aWanted: 2 });   // 地下:pass1 远景早退 → 账 2→1
}
// ---- 相位:水下（warp 链激活,uWater 门控+波场位移在场） ----
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, window.__swGame.world.groundLevel * 16 - 80); });
await pump(page, 10);
await page.evaluate(() => window.__waterPool());
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, window.__swGame.world.groundLevel * 16 - 20); });
await pump(page, 30);
await page.evaluate(() => window.__pause(true));
await waitFrame(8);
{
  const r = await phase('水下warp');
  await judge('水下warp', r);
}
// ---- 相位:重力翻转（呈现面垂直翻转;FBO 朝向链相对结构不变） ----
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, window.__swGame.world.groundLevel * 16 - 80); });
await pump(page, 10);
await page.evaluate(() => window.__grav(-1));
await pump(page, 30);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
{
  const r = await phase('重力翻转');
  await judge('重力翻转', r);
}
await page.evaluate(() => window.__grav(1));

// ---- 账本:opresentStats 分布（merged 应显著>0;fallback=低清+派对两相位帧数） ----
await page.evaluate(() => window.__opresentSet(true));
await page.evaluate(() => window.__pause(false));
await pump(page, 10);
await waitFrame(3);
await page.evaluate(() => window.__pause(true));
const led = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    opresent: r.opresentUsed,
    stats: r.opresentStats,
    compose: r.composePathUsed,
    merge: r.cloudMergeUsed,
  };
});
chk('[账本] opresentStats.merged>0（矩阵期合并帧在账）', (led?.stats?.merged ?? 0) > 0,
  JSON.stringify(led?.stats ?? {}));
chk('[账本] opresentStats.fallback==0（回退帧不 defer=不进补贴账——两回退相位走谓词/尺寸门）',
  (led?.stats?.fallback ?? 0) === 0, JSON.stringify(led?.stats ?? {}));
console.log('[账本]', JSON.stringify(led));

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
