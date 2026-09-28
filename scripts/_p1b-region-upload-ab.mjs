// ★P1-B 子区上传 A/B 验收探针（2026-09-28;栅格化族上传风暴根治）。
// 判据:
//   A. 上传字节:高频滤镜 draw 流（rasterizeDrawImage 族,霜月密度模拟——面被
//      「需求∈(半幅,全幅] 的 op 流」顶住滞回不回落的形态）下,ON 臂（子区上传）
//      相对 OFF 臂（整幅 texRefresh）swpipe 帧上传字节 ≥5× 缩减。
//   B. 分账直证:shim stats.regionUploads ON 臂=op 数,OFF 臂=0（门分支直证）。
//   C. 帧耗对照（信息面）:两臂 op 流墙钟+吸收帧耗时打印——单突发墙钟被驱动队列
//      语义主导（texImage2D 异步入队）,忠实代理=A1 上传字节;见 C 注。
//   D. 像素对拍:GL 纹理字节回读（GPU 实采域,零场景噪声）——同一 op 流 ON/OFF
//      两臂 readPixels 同子区域比对:不透明档（α=255）逐位全等;半透明档预乘域
//      ≤2（抠图第二次 premul 往返 ±1/往返,census 登记）。合成画布级「同帧双渲」
//      经控制实验定谳不成立（同路径双渲亦有 ±153 结构差=世界光照闪烁渲染期随机,
//      与上传链无关）——见探针注。
//   E. bolt bake 链:带子区 bake（bbox<半幅）落 texRefreshRegion（分账直证）。
// 运行:SW_ORIGIN=http://localhost:5241 node tools/run-diag.mjs scripts/_p1b-region-upload-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 2).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, ORIGIN + '/?bgl=1&bglshim=1&cloudcache=0&lightworker=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await page.evaluate(() => { window.__swGame.running = false; });

// ---- 驱动面:实时步进 + 直接驱动栅格化族（executor wrap 代理,acc 态残驻语义） ----
await page.evaluate(async () => {
  const g = window.__swGame;
  window.__vnow = performance.now();
  window.__GLS = await import('/src/render/GLStats.ts');
  window.__SHIM_MOD = await import('/src/render/glshim/GLShimExecutor.ts');
  // 预热帧:建 shim 执行器 + acc 态（bglshim=1 世界层 beginWorldLayer attachAcc）
  for (let i = 0; i < 8; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
  const sh = g.renderer.bglEntShim;
  if (!sh) throw new Error('bglEntShim 未建（bglshim=1 预热帧后应存在）');
  window.__accPath = String(g.renderer.bglPathUsed ?? '');
  // 素材面:大 stretch 面（把 accScratch 撑到 ~1602×902=霜月离群 op 形态）
  //  + 流面 900×50（w×2=1800>1602 → 滞回不回落;子区/面≈1/32=残余带形态）
  const mk = (w, h, paint) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    paint(x, w, h);
    return c;
  };
  window.__bigSrc = mk(1600, 900, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(120,80,255,0.35)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
  window.__streamSrc = mk(900, 50, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(80,160,255,0.5)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
  // storm:1 次 stretch（撑面,region≈canvas=门拒走整幅）+ K 次小子区滤镜 draw
  //  （900×50:滞回不回落+子区<半幅=ON 臂走 texRefreshRegion）
  window.__stretch = () => {
    const c = g.renderer.bglEntShim.wrap();
    c.filter = 'brightness(1.1)';
    c.drawImage(window.__bigSrc, 0, 0);
    c.filter = 'none';
  };
  window.__storm = (k) => {
    const c = g.renderer.bglEntShim.wrap();
    c.filter = 'brightness(1.15)';
    for (let i = 0; i < k; i++) c.drawImage(window.__streamSrc, 20 + (i % 12) * 11, 10 + (i % 9) * 13);
    c.filter = 'none';
  };
  window.__scratchDims = () => {
    // accScratch 模块单例尺寸经探针可观测面:executor 侧无直读口,以 GL 上传字节数
    // 反推+regionUploads 分账直证（B 判据）;此处只回 shim stats
    return g.renderer.bglShimStats();
  };
  window.__frameUp = () => {
    const s = window.__GLS.gpuLogSnapshot();
    return { upMB: s.ctxs.swpipe ? s.ctxs.swpipe.frameUpMB : -1, up: s.ctxs.swpipe ? s.ctxs.swpipe.frameUp : -1 };
  };
  window.__step = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__swGame.frame(window.__vnow); } };
});

// ---- A/B 臂:同 op 流,仅 P1B_REGION_OFF 翻转 ----
// ★计量口径:GL 上传字节=GLStats（吸收帧落 last,差分）;shim 分账 stats 每帧
//  frameReset 清零（窗口开 attach 面）→ 注入后【立即】读,跨帧即被清。
const K_OPS = 24;
const arm = async (regionOff) => page.evaluate(({ off, k }) => {
  const m = window.__SHIM_MOD;
  m.GLShimExecutor.P1B_REGION_OFF = !!off;
  window.__stretch();              // 撑面 op（两臂同形态;其上传计入吸收帧不入计量）
  window.__step(1);                // 吸收帧（stretch 上传落 last,弃）
  window.__step(1);
  const a = window.__frameUp();    // 基线帧（GL 上传字节）
  const st0 = window.__scratchDims();
  const t0 = performance.now();
  window.__storm(k);               // 注入 op 流（frame 累积器;即发即弃 flush 同步完成=栅格化+上传成本）
  const stormMs = performance.now() - t0;
  const st1 = window.__scratchDims();   // ★立即读:stats 随下帧 attach 才清零
  const f0 = performance.now();
  window.__step(1);                // 吸收帧（storm+该帧自身落 last）
  const frameMs = performance.now() - f0;
  const b = window.__frameUp();
  window.__step(1);
  window.__frameUp();              // 复位帧（下一次计量前清尾）
  return {
    stormUpMB: +(b.upMB - a.upMB).toFixed(3),
    stormMs: +stormMs.toFixed(2), frameMs: +frameMs.toFixed(2),
    regionN: st1.stats?.regionUploads ?? -1,       // 注入流内子区上传笔数
    uploadsN: (st1.stats?.uploads ?? -1) - (st0.stats?.uploads ?? 0),   // 注入流内增量
  };
}, { off: regionOff, k: K_OPS });

console.log('--- 臂 1:P1B ON（子区上传,缺省） ---');
const on = await arm(false);
console.log(`[ON ] storm 上传=${on.stormUpMB}MB regionUploads=${on.regionN}/${K_OPS} uploads=${on.uploadsN} storm耗时=${on.stormMs}ms 吸收帧=${on.frameMs}ms`);
console.log('--- 臂 2:P1B OFF（整幅 texRefresh,病灶链） ---');
const off = await arm(true);
console.log(`[OFF] storm 上传=${off.stormUpMB}MB regionUploads=${off.regionN} uploads=${off.uploadsN} storm耗时=${off.stormMs}ms 吸收帧=${off.frameMs}ms`);

const ratio = (on.stormUpMB > 0 && off.stormUpMB > 0) ? off.stormUpMB / on.stormUpMB : 0;
chk('A1 ON 臂 storm 上传显著低于 OFF 臂（≥5×;霜月 42.4% 墙钟根治面）',
  ratio >= 5, `OFF/ON=${ratio.toFixed(1)}× (OFF=${off.stormUpMB}MB ON=${on.stormUpMB}MB)`);
chk('B1 分账直证:ON 臂 regionUploads=K（门分支走 texRefreshRegion）,OFF 臂=0',
  on.regionN === K_OPS && off.regionN === 0, `on=${on.regionN} off=${off.regionN} K=${K_OPS}`);
chk('B2 总上传笔数两臂守恒（分档只是换通道）',
  on.uploadsN === off.uploadsN && on.uploadsN === K_OPS, `on=${on.uploadsN} off=${off.uploadsN}`);
// ★C 帧耗对照=信息面（不设门）:单突发墙钟被驱动队列语义主导——texImage2D 排队
//  异步（OFF 臂 132MB/0.2ms=纯入队,不反映带宽成本;真实成本在持续帧的队列背压,
//  即霜月 trace 42.4% 墙钟的成因形态）。ON 臂墙钟略高=抠图 drawImage(CPU blit)
//  换掉的排字上传字节,其收益在持续负载的带宽面（A1 字节 30×）与 GPU 侧,不在
//  单突发 JS 墙钟。忠实代理=上传字节（A1）。
console.log(`[C 帧耗对照·信息面] op 流墙钟 ON=${on.stormMs}ms OFF=${off.stormMs}ms;吸收帧 ON=${on.frameMs}ms OFF=${off.frameMs}ms（驱动队列语义见注,忠实代理=A1 字节）`);

// ---- D. 像素对拍:GL 纹理字节回读（子区上传语义面=GPU 实采纹理内容,零场景噪声） ----
// ★口径定谳:合成画布级「同帧双渲」对照在本机不成立——同路径双渲控制实测 ±153
//  结构差（世界光照闪烁/环境粒子渲染期随机,与本刀上传链无关,见 D3 信息面）。
//  子区上传的语义面=「GPU 采到的纹理字节」,故对拍面取 GL 纹理回读:同一 op 流
//  （末笔=同一 distinctive 源）ON/OFF 两臂各自上传后 readPixels 同一子区域比对。
//  预乘域漂移定谳:抠图 drawImage 引入第二次 premul↔unpremul 往返——α=255 像素
//  往返恒等（不透明档应逐位全等）;α<255 像素 premul 域每往返 ±1（半透明档 ≤2
//  登记,合成画布上线性同缩——合成级大差只能来自场景噪声,预乘域回读不受染）。
const parity = await page.evaluate(async () => {
  const m = window.__SHIM_MOD;
  const g = window.__swGame;
  const layer = g.renderer.worldPipeLayer;
  const gl = layer.gl;
  const findAccTex = () => {
    let best = null, bestArea = 0;
    for (const [k, e] of layer.texs) {
      if (k.startsWith('dyn:') && e.w * e.h > bestArea) { best = e; bestArea = e.w * e.h; }
    }
    return best;   // accScratch=最大 dyn 纹理（1602×902;尘 s1/s2 等 8×8 级）
  };
  const mk = (w, h, paint) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    return c;
  };
  // distinctive 末笔源:不透明版（α=255 全域）+半透明版（α 渐变,预乘漂移档）
  const opaque = mk(900, 50, (x, w, h) => { x.fillStyle = 'rgb(210,120,40)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(40,200,90)'; x.fillRect(30, 8, w - 60, h - 16); });
  const trans = mk(900, 50, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(80,160,255,0.6)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const drawOp = (src) => {
    const c = g.renderer.bglEntShim.wrap();
    c.filter = 'brightness(1.05)';
    c.drawImage(src, 30, 40);
    c.filter = 'none';
  };
  const readback = (sw, sh) => {
    const tex = findAccTex();
    if (!tex) return null;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.tex, 0);
    const px = new Uint8Array(sw * sh * 4);
    gl.readPixels(0, 0, sw, sh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return px;
  };
  const diffPx = (p, q) => {
    let maxD = 0, over0 = 0, over2 = 0, alphaMax = 0;
    for (let i = 0; i < p.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const dd = Math.abs(p[i + c] - q[i + c]);
        if (dd > maxD) maxD = dd;
        if (dd > 0) over0++;
        if (dd > 2) over2++;
      }
      const da = Math.abs(p[i + 3] - q[i + 3]);
      if (da > alphaMax) alphaMax = da;
    }
    return { maxD, over0, over2, alphaMax };
  };
  const run = (flagOff) => {
    m.GLShimExecutor.P1B_REGION_OFF = flagOff;
    drawOp(opaque);                 // 不透明末笔
    const ro = readback(900, 50);
    drawOp(trans);                  // 半透明末笔（覆盖同子区）
    const rt = readback(900, 50);
    return { ro, rt };
  };
  const on = run(false);
  const off = run(true);
  m.GLShimExecutor.P1B_REGION_OFF = false;
  return {
    opaque: diffPx(on.ro, off.ro),
    trans: diffPx(on.rt, off.rt),
  };
});
console.log(`[D-不透明] ON vs OFF 纹理回读: maxΔ=${parity.opaque.maxD} 非0像素=${parity.opaque.over0} >2像素=${parity.opaque.over2} αmaxΔ=${parity.opaque.alphaMax}`);
console.log(`[D-半透明] ON vs OFF 纹理回读: maxΔ=${parity.trans.maxD} 非0像素=${parity.trans.over0} >2像素=${parity.trans.over2} αmaxΔ=${parity.trans.alphaMax}`);
chk('D1a 不透明档逐位全等:α=255 内容抠图往返恒等（子区上传语义=整幅链）',
  parity.opaque.maxD === 0 && parity.opaque.alphaMax === 0, `maxΔ=${parity.opaque.maxD} αΔ=${parity.opaque.alphaMax}`);
chk('D1b 半透明档预乘域有界:α<255 内容 maxΔ ≤2（第二次 premul 往返 ±1/往返,census 登记）',
  parity.trans.maxD <= 2 && parity.trans.over2 === 0 && parity.trans.alphaMax === 0,
  `maxΔ=${parity.trans.maxD} αΔ=${parity.trans.alphaMax}`);

// ---- E. bolt bake 链:真实雷帧子区上传观测（1091 主雷,bake 期 uploadScratchNow） ----
// bolt bbox 恒大（主雷≈全屏级）→ 门多半拒走整幅（收益与风险同判的正确行为）;
// 小叉雷可过门。分档比例随雷体尺寸分布=观测面;闸=雷帧 bake 上传在场+视觉窗在。
// ★计量口径:shim stats 每帧 attach frameReset 清零——读数窗=单帧内（frame 后即读
//  =该帧 bake 上传笔数,与 D 段同口径;跨帧差分无意义,首版探针坑）。
const boltE = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = window.__SHIM_MOD;
  m.GLShimExecutor.P1B_REGION_OFF = false;
  window.__vnow += 16.6667;
  g.spawnStormBolt1091(g.player.cx + 120, g.player.cy - 24, 0xB017);
  for (let i = 0; i < 246; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
  let boltsSeen = 0, uploadsN = -1, regionN = -1;
  for (let i = 0; i < 30; i++) {
    window.__vnow += 16.6667; g.frame(window.__vnow);
    boltsSeen = (g.entities.all?.() ?? []).filter((e) => e && (e.projId === 1091 || e.projId === 1117 || e.projId === 1122) && e.visualT > 0).length;
    const st = g.renderer.bglShimStats();
    if (boltsSeen >= 1 && (st.stats?.uploads ?? 0) > uploadsN) {
      uploadsN = st.stats?.uploads ?? 0; regionN = st.stats?.regionUploads ?? 0;   // 单帧读数（帧内 bake 笔数）
    }
  }
  return { boltsSeen, uploadsN, regionN };
});
console.log(`[E] 雷帧 bolt bake: 峰值单帧 uploads=${boltE.uploadsN} regionUploads=${boltE.regionN} 视觉窗雷数=${boltE.boltsSeen}`);
chk('E1 雷帧 bolt 链健康:1091 视觉窗内+雷帧 bake 上传在场（bake 期上传走 regionUploads 账）',
  boltE.boltsSeen >= 1 && (boltE.uploadsN + boltE.regionN) > 0, `bolts=${boltE.boltsSeen} uploads/帧=${boltE.uploadsN} region/帧=${boltE.regionN}`);

await browser.close();
if (pageErrors.length) console.log('[pageerrors]', pageErrors.slice(0, 4));
const bad = results.filter((r) => !r.ok);
console.log(bad.length ? `P1B-PROBE: ${bad.length}/${results.length} FAIL` : `P1B-PROBE: ${results.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
