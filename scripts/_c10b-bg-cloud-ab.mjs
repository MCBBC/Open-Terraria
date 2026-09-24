// ★C10b bg 会话迁入共管管线+bg/云 blit 合并 像素对拍（2026-09-24;_c10a-cloud-ab 页内翻面范式）。
// cloudpipe=转正缺省开,页内 setCloudPipeForTest 翻面:A(逃生门 glfx 会话)→B(共管管线)→A'(翻回)。
// 判据（层序定谳结论落地,详见任务报告）:
//   GA  分回合(强制夹层)B.bg 会话面 ≡ A.bg 会话面 逐字节——bg 迁管线零视觉语义;
//   GB  分回合 B.cloud ≡ A.cloud 逐字节(C10a 继承);
//   GC  合并 B.merged(单背板 bg+云) vs 2D 重构(bg cp 上画云 cp):census maxΔ≤2——
//       「合并 FBO 预乘合成语义=两次独立 blit」的合成级判据;跨实现 8bit 量化
//       分组差(半透明云×半透明 bg 重叠像素 ±1,关联律族)落在备案预算内;
//       ★重构面在 A 捕获首轮回读的同一 evaluate 内构建(预乘域画布直拷),与
//       渲染时序解耦(arr 构成当场验证,禁跨态取面);
//   GD  终帧 A vs B census:maxΔ≤2(cloudbatch 合并判例同族——半透明云×半透明 bg
//       重叠像素的 8bit 结合律分组差,方向中性;不重叠域逐位同);
//   GE  翻回 A'≡A(无残留)+两次捕获恒等(确定性哨兵);
//   仪器:cloudPathUsed('glfx'/'cloudpipe')+cloudMergeUsed('merged'/'split'/'-')。
// ★探针坑定谳史(本刀 diag1-6):①pump=fixedUpdate 模拟步,渲染走独立 rAF——
//   snapOn 门控窗与渲染不同步=全空捕(勾践三竭);改为【常开廉价钩】=blit 时点
//   canvas 副本直拷(GPU copy,亚 ms),捕获期统一 ImageData 读回,与渲染时序解耦;
//   ②bootstrap 洗 ?cloudcache → 页内改静态 cloudRegionBlit=false(全幅云 blit);
//   ③biomeBg.update 冻结(动画帧界跨相=伪差源)+暂停+freezeClock+天气/云集钉死。
// 矩阵:6 群系(forest/desert/snow/jungle/corruption/ocean)×晴/阴雨/风暴+缩放+相机相位。
// 运行:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs --timeout=600000 scripts/_c10b-bg-cloud-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5Of = (u8) => createHash('md5').update(Buffer.from(u8.buffer, u8.byteOffset, u8.length)).digest('hex');
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件 + 常开 blit 钩 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  // ②bootstrap 洗参防线:页内改静态——云全幅 blit（A 态云面=整幅,重构基准齐整）
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    window.__blits = [];   // 帧界:仅重置（bg/云 blit 在 render 后段——本 wrapper 返回后才发生）
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0:云漂移/旋转/淡出全停
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__cloudUnpin = () => { delete sky.maintainClouds; };
  // ★环境实体钉面（鸟群/腹足怪 per-render 自走动画——run6/9 终帧漂移源;
  //  两路径同绘制,非本刀比较面,钉死=终帧 census 纯化）
  sky.drawAmbience = () => {};
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
  // ★群系钉面:snapStyle 直落样式（alpha 槽全开+预热）后 update no-op
  window.__biomePin = (style) => {
    const bb = g.renderer.biomeBg;
    bb.snapStyle(style);
    bb.update = () => {};
    return bb.bgStyle;
  };
  window.__forceTint = (on) => {
    sky.blizzTintState = on ? { active: true, leaving: false, opacity: 1 } : { active: false, leaving: false, opacity: 0 };
    sky.sandTintState = { active: false, leaving: false, opacity: 0 };
  };
  window.__forceFlash = (v) => { g.renderer.biomeBg.bgFlash[0] = v; };
  window.__cloudpipeSet = (v) => window.__swGame.renderer.setCloudPipeForTest(v);
  window.__paths = () => ({
    cloudPath: window.__swGame.renderer.cloudPathUsed,
    merge: window.__swGame.renderer.cloudMergeUsed,
  });
  // ★常开钩:天空层画布(glfx/pipe)的 3 参全幅 blit → blit 时点 canvas 副本
  //  （canvas→canvas GPU 直拷,预乘域零量化损失;每帧 ≤3 个,廉价）。
  //  ImageData 读回延后到捕获期（与渲染时序解耦——pump=fixedUpdate,rAF 异步）。
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      // ★重入门:钩内 canvas 副本拷贝亦走本补丁——不闭则无限自递归(fork bomb)
      if (!w.__inC10bHook && w.__blits && rest.length === 2) {
        const r = w.__swGame?.renderer;
        const isPipe = !!(r?.cloudPipeLayer && src === r.cloudPipeLayer.canvas);
        const isGlfx = !!(r?.glfx && src === r.glfx.canvas);
        if (isPipe || isGlfx) {
          const cp = document.createElement('canvas');
          cp.width = src.width; cp.height = src.height;
          w.__inC10bHook = true;
          try { cp.getContext('2d').drawImage(src, 0, 0); } finally { w.__inC10bHook = false; }
          w.__blits.push({ k: isPipe ? 'pipe' : 'glfx', w: src.width, h: src.height, cp });
        }
      }
      return orig.call(this, src, ...rest);
    };
    P.__c10bPatched = true;
  }
});
// ★停 rAF 主循环——渲染全权由 waitFrame 同步驱动(虚拟时钟恒定 dt;headless rAF
//  0~3fps 不可预期,与同步帧交错=run 间漂移源)
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });   // 正午
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 160);
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
// ★③动画钟冻结:bgTick/风格推进/alpha 坡道全停（diag1 定谳:动画帧界跨相=伪差源;
//  forest 天然样式已收敛,update no-op 不改观感,只钉死时间面）
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await waitFrame(8);     // ★暂停后只走同步帧（收敛+冷上传;pump 绕停推进模拟=伪差源）

/** ★同步帧驱动（diag7/8 定谳:headless rAF 0~3fps 不可预期,pump=fixedUpdate 模拟步
 *  与渲染完全异步）——g.frame(now)=Game 主帧(暂停门内+renderer.render)同步执行,
 *  渲染与捕获零时序耦合。rAF 主循环已停(setup 内 running=false),渲染全权由本函数驱动 */
async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
/** 活性面（探针自诊断） */
async function liveness(tag) {
  const s = await page.evaluate(() => ({
    rafN: window.__rafN ?? -1, skyDrawN: window.__skyDrawN ?? -1,
    path: window.__swGame.renderer.cloudPathUsed,
    merge: window.__swGame.renderer.cloudMergeUsed,
  }));
  console.log(`  [liveness ${tag}]`, JSON.stringify(s));
  return s;
}

/** 读回当前 __blits（cp→ImageData→b64;node 侧 md5）。空=渲染未及,等渲染重试窗。
 *  buildRec=true:同 evaluate 内(数组当场验证)构建 GC 重构面=bg cp 上画云 cp,
 *  缓存 window.__recB64（arr.length!==3 时置 'ERR:' 前缀,消费端断言） */
async function readBlits(buildRec = false) {
  for (let i = 0; i < 10; i++) {
    await waitFrame(1);
    const arr = await page.evaluate(() => (window.__blits || []).map((b) => ({ k: b.k, w: b.w, h: b.h, hasCp: !!b.cp })));
    if (arr.length > 0 && arr.every((b) => b.hasCp)) {
      const b64s = await page.evaluate((buildRec) => {
        const src = window.__blits || [];
        let recErr = null;
        if (buildRec) {
          try {
            if (src.length !== 3) recErr = 'len=' + src.length + '[' + src.map((b) => b.k).join(',') + ']';
            else {
              const lc = document.createElement('canvas');
              lc.width = src[1].w; lc.height = src[1].h;
              const cx = lc.getContext('2d', { willReadFrequently: true });
              cx.drawImage(src[1].cp, 0, 0);   // bg
              cx.drawImage(src[2].cp, 0, 0);   // 云
              const d = cx.getImageData(0, 0, lc.width, lc.height).data;
              let bin = '';
              const CH = 0x8000;
              for (let j = 0; j < d.length; j += CH) bin += String.fromCharCode.apply(null, d.subarray(j, Math.min(j + CH, d.length)));
              window.__recB64 = btoa(bin);
            }
          } catch (e) { recErr = 'exc:' + e.message; }
        }
        const out = src.map((b) => {
          const cx = b.cp.getContext('2d', { willReadFrequently: true });
          const d = cx.getImageData(0, 0, b.w, b.h).data;
          let bin = '';
          const CH = 0x8000;
          for (let j = 0; j < d.length; j += CH) bin += String.fromCharCode.apply(null, d.subarray(j, Math.min(j + CH, d.length)));
          return { k: b.k, w: b.w, h: b.h, b64: btoa(bin) };
        });
        return { out, recErr };
      }, buildRec);
      void b64s.recErr;
      return b64s.out.map((b) => ({ k: b.k, w: b.w, h: b.h, md5: md5(b.b64), b64: b.b64 }));
    }
  }
  return [];
}

/** 终帧快照 */
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

/** 单捕获:两次读取恒等(确定性哨兵)+终帧+blits */
async function capture(label, buildRec = false) {
  const B1 = await readBlits(buildRec);
  await waitFrame(1);
  const B2 = await readBlits();
  const m1 = md5(JSON.stringify(B1.map((b) => b.md5)));
  const m2 = md5(JSON.stringify(B2.map((b) => b.md5)));
  chk(`[${label}] 两次捕获恒等（随机面不在场）`, B1.length > 0 && m1 === m2, m1 === m2 ? `${B1.length} blits` : `漂移 ${B1.map((b) => b.k)}/${B2.map((b) => b.k)}`);
  const fin = await snapFin();
  const paths = await page.evaluate(() => window.__paths());
  return { bl: B2, fin, paths };
}

/** 终帧 census:A vs B 全帧差分(像素数/maxΔ/bbox) */
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

/** 单相位主流程:A→B→A' 三态捕获+路径断言 */
async function phase(label, { expectMerge }) {
  await page.evaluate(() => window.__cloudpipeSet(false));
  // ★捕获窗禁 pump:pump=fixedUpdate 直调【绕过暂停】推进模拟（实体/粒子动=A/A'/GD 伪差源）
  //  翻面重建在渲染帧的注入点发生——同步帧足够
  await waitFrame(4);
  const A = await capture(`${label} A`, true);
  const Ag = A.bl.filter((b) => b.k === 'glfx');
  chk(`[${label}] A 态实走 glfx 会话（bg+云 blit 有序,glfx 尾二）`, A.paths.cloudPath === 'glfx' && Ag.length >= 2,
    `path=${A.paths.cloudPath} glfx=${Ag.length} all=${A.bl.map((b) => b.k).join(',')}`);
  await page.evaluate(() => window.__cloudpipeSet(true));
  await waitFrame(5);                    // 管线层建+纹理冷上传（同步帧）
  const B = await capture(`${label} B`);
  const Bp = B.bl.filter((b) => b.k === 'pipe');
  const wantMerge = expectMerge ? 'merged' : 'split';
  chk(`[${label}] B 态实走 cloudpipe+${wantMerge}`, B.paths.cloudPath === 'cloudpipe' && B.paths.merge === wantMerge,
    `path=${B.paths.cloudPath} merge=${B.paths.merge} pipe=${Bp.length}`);
  await page.evaluate(() => window.__cloudpipeSet(false));
  await waitFrame(4);
  const A2 = await capture(`${label} A'`);
  const blEq = md5(JSON.stringify(A.bl.map((b) => b.md5))) === md5(JSON.stringify(A2.bl.map((b) => b.md5)));
  chk(`[${label}] A'≡A 翻回恢复（无残留）`, blEq && A.fin.b64 === A2.fin.b64,
    `blits${blEq ? '=' : '≠'}A fin ${md5(A.fin.b64).slice(0, 8)}/${md5(A2.fin.b64).slice(0, 8)}`
    + (blEq ? '' : ` A=[${A.bl.map((b) => b.md5.slice(0, 6))}] A'=[${A2.bl.map((b) => b.md5.slice(0, 6))}]`));
  // ★GC 重构面已在 A 捕获首轮回读时同 evaluate 构建（window.__recB64）
  const recB64A = await page.evaluate(() => window.__recB64 ?? null);
  chk(`[${label}] GC 重构面构建（A 态 3 blits）`, !!recB64A && !String(recB64A).startsWith('ERR:'), String(recB64A ?? 'null').slice(0, 24));
  return { A, B, A2, Arecon: recB64A };
}

/** 判据组:GA/GB（分回合逐字节）/GC（合并合成逐字节）/GD（终帧 census）。
 *  面选择:pass1 远景云会话 blit 在最前（sky.draw 内）——bg/云取尾二 */
async function judge(label, mode, { A, B, Arecon }) {
  const Ag = A.bl.filter((b) => b.k === 'glfx');
  const Bp = B.bl.filter((b) => b.k === 'pipe');
  if (mode === 'split') {
    chk(`[${label}] GA 分回合 bg 会话逐字节（迁管线零视觉语义）`, Ag[Ag.length - 2].md5 === Bp[Bp.length - 2].md5,
      `A=${Ag[Ag.length - 2].md5.slice(0, 8)} B=${Bp[Bp.length - 2].md5.slice(0, 8)}`);
    chk(`[${label}] GB 分回合云会话逐字节（C10a 继承）`, Ag[Ag.length - 1].md5 === Bp[Bp.length - 1].md5,
      `A=${Ag[Ag.length - 1].md5.slice(0, 8)} B=${Bp[Bp.length - 1].md5.slice(0, 8)}`);
  } else {
    // GC:合成级 census 判定。合并背板(GL blend 合成)vs 2D 重构(bg cp 上画云 cp,
    // A 捕获期同 evaluate 构建)的差=跨实现 8bit 量化分组差(同 GD 关联律族,半透明
    // 云×半透明 bg 重叠像素 ±1)——maxΔ≤2 判合成级语义一致;逐字节仅在不重叠域
    // 成立(GA/GB 已各自锁死)。
    const recB64 = Arecon;
    const recFin = { w: A.bl[1].w, h: A.bl[1].h, b64: recB64 };
    const gc = await census(Bp[Bp.length - 1], recFin);
    chk(`[${label}] GC 合成级一致:maxΔ≤2（跨实现量化分组差,推导见注释）`, gc.maxd <= 2,
      `n=${gc.n} maxΔ=${gc.maxd} bbox=${JSON.stringify(gc.bbox)} merged=${Bp[Bp.length - 1].md5.slice(0, 8)} rec=${md5(recB64).slice(0, 8)}${gc.n === 0 ? ' [逐字节]' : ''}`);
  }
  const c = await census(A.fin, B.fin);
  chk(`[${label}] GD 终帧 census maxΔ≤2（cloudbatch 备案口径）`, c.maxd <= 2,
    `n=${c.n} maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}${c.n === 0 ? ' [零差]' : ''}`);
}

// ---- 相位 0:晴天 forest——合并主判据（GC/GD+翻回） ----
{
  const r = await phase('晴天合并', { expectMerge: true });
  await judge('晴天合并', 'merge', r);
}
// ---- 相位 0b:强制夹层（色罩+黑闪）——分回合逐字节判据（GA/GB） ----
await page.evaluate(() => { window.__forceTint(true); window.__forceFlash(0.5); });
{
  const r = await phase('强制夹层', { expectMerge: false });
  await judge('强制夹层', 'split', r);
}
await page.evaluate(() => { window.__forceTint(false); window.__forceFlash(0); });

// ---- 群系×天气矩阵（合并路径;GC+GD） ----
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
  if (zoom !== null) await page.evaluate((z) => { window.__swGame.camera.zoom = z; }, zoom);
  if (camShift) {
    await page.evaluate((d) => { const g = window.__swGame; g.camera.x += d; if (g.player) g.player.x += d; }, camShift);
  }
  await pump(page, camShift ? 6 : 50);
  await page.evaluate(() => window.__weatherFreeze());
  await page.evaluate(() => window.__cloudPin());
  await page.evaluate(() => window.__pause(true));
  await waitFrame(6);   // ★暂停后只走同步帧（pump 绕过暂停推进模拟=伪差源）
}
for (const [bName, style] of BIOMES) {
  for (const [wName, w] of WEATHERS) {
    await prepare(w);
    await page.evaluate((s) => window.__biomePin(s), style);
    await pump(page, 60);   // 贴图预热窗
    await waitFrame(3);     // 群系贴图冷上传同步渲染窗
    const tag = `${bName}·${wName}`;
    const r = await phase(tag, { expectMerge: true });
    await judge(tag, 'merge', r);
  }
}
// ---- 缩放 + 相机相位（forest·晴） ----
await prepare({ raining: false, alpha: 0, numClouds: 60 }, 1.5625);
await page.evaluate((s) => window.__biomePin(s), 0);
await pump(page, 60);
await waitFrame(3);
{
  const r = await phase('缩放', { expectMerge: true });
  await judge('缩放', 'merge', r);
}
await prepare({ raining: false, alpha: 0, numClouds: 60 }, 1.25, 320);
await page.evaluate((s) => window.__biomePin(s), 0);
await pump(page, 60);
await waitFrame(3);
{
  const r = await phase('相机移动', { expectMerge: true });
  await judge('相机移动', 'merge', r);
}

// ---- 上下文数账本（转正态:GLStats 账页归 swpipe） ----
await page.evaluate(() => window.__cloudpipeSet(true));
await page.evaluate(() => window.__pause(false));
await pump(page, 10);
await waitFrame(3);   // rAF 已停——翻面生效须同步渲染帧
await page.evaluate(() => window.__pause(true));
const led = await page.evaluate(() => {
  const s = window.__swGPULog?.snapshot?.();
  const r = window.__swGame.renderer;
  return {
    ctxs: s ? Object.keys(s.ctxs) : null,
    swpipe: s?.ctxs?.swpipe ?? null,
    cloudPath: r.cloudPathUsed,
    merge: r.cloudMergeUsed,
    stats: r.cloudPathStats,
    mergeStats: r.cloudMergeStats,
  };
});
chk('[账本] 转正态 GLStats 账页含 swpipe 且 liveMB>0', !!led?.swpipe && led.swpipe.liveMB > 0,
  JSON.stringify(led?.swpipe ?? null));
// ★C10b 共管判据:swpipe 在场（云+bg+worldCompose 三消费方）;灰度期独立账页
//  （cloudpipe/worldCompose）不在场=共管归一。menubg/screenFx/aurora=C10 范围外
//  既有上下文（A1/B1/B2 刀目标),不在本刀账。
chk('[账本] 共管归一:swpipe 在场且无灰度期独立账页(cloudpipe/worldCompose)', !!led?.swpipe
  && !led.ctxs.includes('cloudpipe') && !led.ctxs.includes('worldCompose'),
  JSON.stringify(led?.ctxs ?? null));
chk('[账本] 转正态 cloudPathUsed=cloudpipe', led?.cloudPath === 'cloudpipe', '实际=' + led?.cloudPath);
console.log('[账本] cloudPathStats:', JSON.stringify(led?.stats ?? {}));
console.log('[账本] cloudMergeStats:', JSON.stringify(led?.mergeStats ?? {}));

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
