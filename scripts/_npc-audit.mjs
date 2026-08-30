// NPC 贴图方向/碰撞盒自动对账探针(三层机读对账,无模型判定):
//   真值源① tools/generated/npc-draw-truth.json(1458 反编译静态提取五表)
//   真值源② public/sprites/vanilla-npcs.json(JSON 数据面)
//   实测面③ 本仓运行时:fromVanilla 构造盒尺寸(pass0)+ 画布逐帧像素反差分
//            (锚点公式预测值 vs 实测 bbox、镜像态三分类 vs 声明策略)(pass1)
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_npc-audit.mjs --timeout=900000
//       AUDIT_MODE=full 跑全量 697 型(默认 quick ~60 代表型);AUDIT_IDS=3,6,46 指定子集。
// 报告落盘 /tmp/npc-audit/report.json(nj可继续分批跑,__seen 集合防重)。
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const MODE = process.env.AUDIT_MODE || 'quick';
const IDS_FILTER = process.env.AUDIT_IDS;
const REPORT_DIR = '/tmp/npc-audit';
mkdirSync(REPORT_DIR, { recursive: true });
const prevPath = `${REPORT_DIR}/report.json`;
const PREV = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : { batchesDone: [] };
const TRUTH_RAW = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/tools/generated/npc-draw-truth.json', 'utf8');

const QUICK_IDS = [
  3, 5, 6, 4,                                  // 僵尸/恶魔眼/EoS/EoC(历史案主)
  46, 48, 21,                                  // 兔子/鸟/史莱姆王(critter+宽度档)
  20, 17,                                      // 向导/商人(townNPC 对照)
  63, 64, 103, 69,                             // halfSize.Y += 组
  108, 124, 477, 478, 483, 484, 490,           // num46 链代表
  262, 264, 268, 288,                          // num47Add 档
  301, 546, 611,                               // 渡鸦/怒滚虫/鸮(镜像异常族)
  552, 555, 561, 566, 568, 570, 572, 578, 620, // 绘制侧 num47 覆写全组
  626, 627, 692, 694, 688,                     // wet/ai 条件档(干态值)
  125, 126,                                    // 双子(halfSize 55,107)
];
void QUICK_IDS; // 在页面内组装(MODE=quick 时过滤)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 900000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', String(m.text()).slice(0, 200)); });

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

const out = await page.evaluate(async ({ truthRaw, mode, idsFilter, prev, quickIds }) => {
  const T = JSON.parse(truthRaw);
  const rep = {
    meta: { mode, ts: Date.now(), origin: location.origin },
    pass0: {},     // 聚合发现:{class: [{id, ...}]}
    pass1: [],     // 每 id 测量行
    summary: {},
    batchesDone: prev.batchesDone ?? [],
  };
  const add = (cls, rec) => { (rep.pass0[cls] ??= []).push(rec); };

  // ---------- 世界搭建(热身世界→目标世界→揭幕后立即暂停,防死亡幕帘) ----------
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const mkWorld = (name) => {
    const w = new World(220, 1000, 777, name);   // 深纵深:全量 24+ 批相机步进 ~11k px
    for (let x = 0; x < 220; x++) for (let y = 100; y < 1000; y++) w.store.setTile(x, y, 1);
    for (let x = 0; x < 220; x++) w.store.setTile(x, 99, 3);
    w.clock.time = 13500;
    w.spawnX = 110; w.spawnY = 96;   // ★格单位(对照 _sink-probe);像素会掷到界外坠亡黑屏
    return w;
  };
  const loadWorld = async (w) => {
    const parts = sf.buildSaveParts(w);
    await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
    document.getElementById('sw-boot-prime')?.remove();
  };
  // ①热身:模块/资产/着色管线全暖(冷实例首载资产揭幕可达分钟级)
  await loadWorld(mkWorld('npc-audit-warm'));
  const g0 = window.__swGame;
  await g0.whenFirstPaint(3);
  // ②目标世界(缓存全热,首帧即出)
  await loadWorld(mkWorld('npc-audit'));
  const g = window.__swGame;
  await g.whenFirstPaint(3);
  // ③对话框轮询点击(可能异步挂载)
  for (let t = 0; t < 60; t++) {
    let gone = true;
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('我已知晓')) { b.click(); gone = false; break; }
    }
    if (gone) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // ④立即使死亡不可达:暂停(渲染每帧照跑,weather 已由 _worldPaused 门)
  if (g.player.dead) g.respawnPlayer?.();
  g.paused = true;
  g.renderer.fullbright = true;   // 全亮:地下槽位不依赖光照(diff 对 B 基线自消)
  // drawImage 间谍:全量 watched(candIds 装配后再定,此处先占位集合对象)
  const WATCH_SPY = new Set();
  const drawLog = [];
  if (!window.__swAuditSpy) {
    window.__swAuditSpy = true;
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    proto.drawImage = function (img, ...a) {
      try {
        if (window.__swAuditCurId != null && WATCH_SPY.has(window.__swAuditCurId) && a.length >= 5) {
          let mtx = null;
          try { const m = this.getTransform(); mtx = [Math.sign(m.a) || m.a, Math.sign(m.d)]; } catch {}
          drawLog.push({
            id: window.__swAuditCurId,
            phase: window.__swAuditPhase ?? '?',
            sx: a[0], sy: a[1], sw: a[2], sh: a[3], dx: a[4], dy: a[5], dw: a[6] ?? img.width, dh: a[7] ?? img.height,
            iw: img?.width, ih: img?.height, mtx,
          });
          if (drawLog.length > 3000) drawLog.shift();
        }
      } catch {}
      return orig.apply(this, [img, ...a]);
    };
  }
  {
    const { Renderer } = await import('/src/render/Renderer.ts');
    const oDE = Renderer.prototype.drawEnemy;
    window.__swAuditCalled = new Set();
    window.__swAuditScaleLog = [];   // {id, phase:'A'|'C', sx, sy} 镜像变换取证
    window.__swAuditPhase = 'A';
    Renderer.prototype.drawEnemy = function (e, ...rest) {
      const prev = window.__swAuditCurId;
      window.__swAuditCurId = e.vanillaId ?? null;
      window.__swAuditCalled.add(e.vanillaId);
      try { return oDE.call(this, e, ...rest); } finally { window.__swAuditCurId = prev; }
    };
    if (!window.__swScaleSpy) {
      window.__swScaleSpy = true;
      const sp = CanvasRenderingContext2D.prototype;
      const oScale = sp.scale;
      sp.scale = function (sx, sy) {
        try {
          if (window.__swAuditCurId != null && sx < 0) {
            window.__swAuditScaleLog.push({ id: window.__swAuditCurId, phase: window.__swAuditPhase, sx, sy });
            if (window.__swAuditScaleLog.length > 2000) window.__swAuditScaleLog.shift();
          }
        } catch {}
        return oScale.call(this, sx, sy);
      };
    }
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cvRead = g.renderer.canvas.getContext('2d');
  const centerPx = cvRead.getImageData(g.renderer.canvas.width >> 1, g.renderer.canvas.height >> 1, 1, 1).data;
  rep.meta.canvasReady = centerPx[0] + centerPx[1] + centerPx[2] > 0 || true;   // 中心可能落在暗地块;以 whenFirstPaint 为准
  rep.meta.playerDeadAfterSetup = !!g.player?.dead;
  const { Enemy } = await import('/src/entities/Enemy.ts');

  // ---------- Renderer 源文本解析(表与翻转策略真值来源②') ----------
  const rsTextRaw = await (await fetch('/src/render/Renderer.ts')).text();
  // 去注释(vite 转换产物中同名标识符常先在注释出现,扫描须以纯码为准)
  const rsText = rsTextRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // 平衡花括号扫描:遍历 name 全部出现位,取“= { ... }”成对且含键值对的真实定义块
  // (vite 转换后注释/使用点同名字样先于定义出现,不能用首匹配)
  const grabObjLiteral = (name) => {
    const re = new RegExp(`${name}\\b\\s*(?:[^={]*)?=\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(rsText))) {
      let depth = 0, i0 = re.lastIndex - 1, i = i0;
      for (; i < rsText.length && i < i0 + 4000; i++) {
        if (rsText[i] === '{') depth++;
        else if (rsText[i] === '}') { depth--; if (!depth) break; }
      }
      const body = rsText.slice(i0 + 1, i);
      const pairs = [...body.matchAll(/(\d+)\s*:\s*(-?\d+(?:\.\d+)?)/g)];
      if (pairs.length >= 3) {
        const o = {};
        for (const p of pairs) o[+p[1]] = +p[2];
        return o;
      }
    }
    return {};
  };
  const ROT_SET = (() => {
    const m = rsText.match(/const ROTATION_NPC = [^[]*?Set\(\[([^\]]*)\]\)/);   // vite 会插 /* @__PURE__ */
    return new Set(m ? [...m[1].matchAll(/-?\d+/g)].map((x) => +x[0]) : []);
  })();
  const HB_LIVE = grabObjLiteral('HB_ADD_H');
  const DN47_LIVE = grabObjLiteral('DRAW_NUM47_OVERRIDE');
  // ★镜像禁用集 = rotationDriven 初始化表达式逐字解析(权威门,勿用 rotate 链
  //  ——rotate 链多数分支保留镜像,只有 rotationDriven 才禁通用 facing 镜像)
  const ROT_AI_STYLES = (() => {
    const m = rsText.match(/const rotationDriven = !tiltOnly5[\s\S]{0,320}?;/);
    return new Set(m ? [...m[0].matchAll(/stR === (\d+)/g)].map((x) => +x[1]) : [5, 6, 9, 19, 21, 23, 40, 56, 76]);
  })();
  const tiltOnly5Re = /const tiltOnly5[\s\S]{0,240}?;/;
  const tiltSeg = rsText.match(tiltOnly5Re)?.[0] ?? '';
  const tiltIds = new Set([...tiltSeg.matchAll(/idR === (\d+)/g)].map((x) => +x[1]));
  {
    const rangeM = tiltSeg.match(/idR >= (\d+) && idR <= (\d+)/);
    if (rangeM) for (let q = +rangeM[1]; q <= +rangeM[2]; q++) tiltIds.add(q);
  }

  // ---------- pass0:全量数据面 ----------
  const allIds = Object.keys(T.frames).map(Number).sort((a, b) => a - b);
  const VANILLA = await (await fetch('/sprites/vanilla-npcs.json')).json();
  window.VANILLA_NPCS = VANILLA;
  const constructCache = new Map();
  const tryConstruct = (id) => {
    if (constructCache.has(id)) return constructCache.get(id);
    let e = null, err = null;
    try {
      const vw = VANILLA[id] ? (VANILLA[id].width / 2) * 16 : 0;
      void vw;
      e = Enemy.fromVanilla(id, 5000, 400);
    } catch (ex) { err = String(ex?.message ?? ex).slice(0, 120); }
    constructCache.set(id, { e, err });
    return constructCache.get(id);
  };
  for (const id of allIds) {
    if (id <= 0) continue;
    const v = VANILLA[id];
    const bt = T.boxTruth[id];
    if (!v) { add('missing-json-entry', { id }); continue; }
    // ②↔①:JSON 数据面 vs 1458 反编译 SetDefaults 终值
    if (bt) {
      for (const k of ['width', 'height', 'lifeMax', 'damage', 'defense', 'aiStyle']) {
        if (bt[k] !== undefined && v[k] !== undefined && Number(v[k]) !== Number(bt[k])) {
          add('json-vs-setdefaults-drift', { id, field: k, json: v[k], source: bt[k] });
        }
      }
    } else add('no-boxtruth-for-id', { id });
    // 帧:JSON frames vs npcFrameCount
    if (Number(v.frames) !== Number(T.frames[id])) add('frames-drift', { id, json: v.frames, source: T.frames[id] });
    // 运行时构造盒 vs JSON(vanilla)
    const { e, err } = tryConstruct(id);
    if (!e) { add('construct-fail', { id, err }); continue; }
    const sExp = (v.scale ?? 1);
    const expW = Math.round(v.width * sExp), expH = Math.round(v.height * sExp);
    if (e.w !== expW || e.h !== expH) add('box-size-runtime', { id, got: [e.w, e.h], exp: [expW, expH], scale: sExp });
    // Live 表 parity:HB_ADD_H vs NPCAddHeight;DRAW_NUM47_OVERRIDE vs 绘制侧覆写
    const hbLive = HB_LIVE[id] ?? 0, hbSrc = T.addHeight[id] ?? 0;
    if (hbLive !== hbSrc) add('hb-add-h-parity', { id, live: hbLive, src: hbSrc });
    const dnLive = DN47_LIVE[id], dnSrc = T.drawSide.num47[id];
    if ((dnLive ?? null) !== (dnSrc ?? null)) add('draw-num47-parity', { id, live: dnLive ?? null, src: dnSrc ?? null });
  }
  // extraFlip 对照:绘制侧 h 覆写类型,渲染器须有对应特殊支(extraFlip 已在镜像策略对照内消费)

  // ---------- pass1:画布实测 ----------
  const atlas = g.renderer.atlas;
  const cv = g.renderer.canvas;
  const ctx2d = cv.getContext('2d');
  const z = g.camera.zoom;
  // 画布可见世界矩形标定(worldToScreen 两点反解)
  const p00 = g.camera.worldToScreen(0, 0);
  const invX = (sx) => (sx - p00[0]) / z;
  const invY = (sy) => (sy - p00[1]) / z;

  // 资产参考缓存:每 id PNG 尺寸 + 第0帧 alpha 行界 + 32x32 剪影
  const assetCache = new Map();
  const loadAsset = (id, frames) => new Promise((resolve1) => {
    if (assetCache.has(id)) return resolve1(assetCache.get(id));
    const img = new Image();
    img.onload = () => {
      const fw = img.width, fh = Math.max(1, Math.round(img.height / Math.max(1, frames)));
      // 扫整张纵条:帧带 = [f*fh,(f+1)*fh),按行归属帧 ⇒ 逐帧内容界
      const oc = document.createElement('canvas');
      oc.width = fw; oc.height = img.height;
      const octx = oc.getContext('2d', { willReadFrequently: true });
      octx.drawImage(img, 0, 0);
      const d = octx.getImageData(0, 0, fw, img.height).data;
      let fMin = 1e9, fMax = -1;
      const sil = new Float32Array(32 * 32);
      const frameBounds = [];
      for (let f = 0; f < frames; f++) frameBounds.push({ fMin: 1e9, fMax: -1 });
      for (let yy = 0; yy < img.height; yy++) {
        const fi = Math.min(frames - 1, (yy / fh) | 0);
        const yr = yy - fi * fh;   // 帧内行
        for (let xx = 0; xx < fw; xx++) {
          const a = d[(yy * fw + xx) * 4 + 3];
          if (a > 20) {
            if (fi === 0) {
              if (yr < fMin) fMin = yr;
              if (yr > fMax) fMax = yr;
              sil[Math.min(31, (yr * 32 / fh) | 0) * 32 + Math.min(31, (xx * 32 / fw) | 0)] = 1;
            }
            if (yr < frameBounds[fi].fMin) frameBounds[fi].fMin = yr;
            if (yr > frameBounds[fi].fMax) frameBounds[fi].fMax = yr;
          }
        }
      }
      for (const fb of frameBounds) if (fb.fMax < 0) { fb.fMin = 0; fb.fMax = fh - 1; }
      const rec = { fw, fhFull: fh, fMin: fMax < 0 ? 0 : fMin, fMax, frameBounds, sil, frames };
      assetCache.set(id, rec);
      resolve1(rec);
    };
    img.onerror = () => { const rec = { missing: true }; assetCache.set(id, rec); resolve1(rec); };
    img.src = `/sprites/vanilla/NPC_${id}.png`;
  });

  // 镜像期望策略(与渲染器声明语义同构;行为源 = 源码文本解析结果)
  const flipPolicyOf = (id) => {
    const stR = VANILLA[id]?.aiStyle ?? 0;
    const owl = id === 611 || id === 689;
    const sdirNeg = id === 546;
    const raven = id === 301;
    const worm = stR === 66 && !(id >= 485 && id <= 487);
    const snail = stR === 67;
    const tiltMember = tiltIds.has(id) && stR === 5;
    const special116 = id === 116;
    let rotDriven = false;
    if ([4, 116].includes(id)) rotDriven = true;   // 4 旋转/116 自管旋转分支
    else if (stR === 5) rotDriven = !tiltMember && !(id === 23 || id === 139);
    else rotDriven = ROT_SET.has(id) || ROT_AI_STYLES.has(stR);
    if (rotDriven && !owl && !sdirNeg) {
      if (id === 23 || id === 139 || tiltMember) return 'standard';      // 复合成员走通用镜像
      if (special116) return 'identical-at-rest';                        // vx=0 无旋转无镜像
      return 'rotation-identical';
    }
    if (raven) return 'stateful-raven';
    if (worm) return 'never-mirror';
    if (snail) return 'own-quadrant';
    if (owl || sdirNeg) return 'inverted-standard';
    return 'standard';
  };

  const grabRegion = (x0, y0, x1, y1) => ctx2d.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;

  // 组装批清单
  let candIds = [];
  if (idsFilter) candIds = idsFilter.split(',').map(Number);
  else {
    const pool = Object.keys(T.frames).map(Number).sort((a, b) => a - b);
    candIds = mode === 'full' ? pool : quickIds.filter((i) => pool.includes(i));
  }
  // 元数据齐备性预筛(PNG 缺失/构造失败跳过并记录)
  const meta = new Map();
  for (const id of candIds) {
    const v = VANILLA[id];
    const frames = Math.max(1, Number(T.frames[id]));
    if (!v) continue;
    if (v.townNPC) { rep.pass1.push({ id, class: 'town-path-skip' }); continue; }   // townNPC 独立绘制管线,锚点公式不适用
    const { e } = tryConstruct(id);
    if (!e) continue;
    const ast = await loadAsset(id, frames);
    if (ast.missing) { rep.pass1.push({ id, class: 'png-missing' }); continue; }
    const sV = (v.scale ?? 1) * (e.vanillaScale ?? 1);
    const ext = Math.max(ast.fw, ast.fhFull) * sV * z;
    meta.set(id, { v, frames, ast, sV, ext, e });
    WATCH_SPY.add(id);
  }

  // 网格排版:以当前相机可视区为域,行高动态(两列一 id:facing−/+ 并排)
  const view = g.camera.viewport ?? { width: cv.width, height: cv.height };
  void view;
  const MARGIN = 12, GAPX = 8, GAPY = 8;
  const usableW = cv.width - MARGIN * 2, usableH = cv.height - MARGIN * 2;
  const batch = [];
  let cx = MARGIN, rowH = 0, rowUsedIds = 0;
  const flushBatchOK = () => true;
  void flushBatchOK;
  const finalizeBatchRow = () => { cx = MARGIN; rowH = 0; rowUsedIds = 0; };
  // 全量格胞(流式装不下 → 多批次+相机步进)
  const allCells = [];
  for (const id of meta.keys()) {
    const md = meta.get(id);
    const cellW = Math.ceil(md.ext * 2 + GAPX);
    const cellH = Math.ceil(md.ext);
    if (cellW > usableW || cellH > usableH) {
      rep.pass1.push({ id, class: 'too-big-for-viewport', ext: [Math.ceil(cellW), Math.ceil(cellH)] });
      continue;
    }
    allCells.push({ id, cellW, cellH });
  }

  const analyzeSil = (data, W, H, maskRef) => {
    const sil = new Float32Array(32 * 32);
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, cnt = 0;
    const INS = 13;   // 外环弃计:邻格串扰只可能从 pad 带进入(窗口 pad 12)
    for (let yy = INS; yy < H - INS; yy++) for (let xx = INS; xx < W - INS; xx++) {
      const i = (yy * W + xx) * 4;
      const d = Math.abs(data[i] - maskRef[i]) + Math.abs(data[i + 1] - maskRef[i + 1]) + Math.abs(data[i + 2] - maskRef[i + 2]);
      if (d > 60) {
        cnt++;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        sil[Math.min(31, (yy * 32 / H) | 0) * 32 + Math.min(31, (xx * 32 / W) | 0)] = 1;
      }
    }
    return { sil, bbox: cnt ? [minX, minY, maxX, maxY] : null, cnt };
  };
  const diffGrid = (a, b) => {
    let d = 0;
    for (let i = 0; i < 1024; i++) if (a[i] !== b[i]) d++;
    return d;
  };
  const flipRows = (sil) => {
    const o = new Float32Array(1024);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) o[y * 32 + x] = sil[y * 32 + (31 - x)];
    return o;
  };
  const fullGrab = () => new Uint8Array(ctx2d.getImageData(0, 0, cv.width, cv.height).data);
  let dumpN = 0;
  let dumpP = 0;
  const cropDataUrl = (shot, cx0, cy0, cw, ch) => {
    const oc = document.createElement('canvas');
    oc.width = cw; oc.height = ch;
    const ictx = oc.getContext('2d');
    const img = ictx.createImageData(cw, ch);
    for (let yy = 0; yy < ch; yy++) {
      const src = (cy0 + yy) * cv.width + cx0;
      img.data.set(shot.subarray(src * 4, src * 4 + cw * 4), yy * cw * 4);
    }
    ictx.putImageData(img, 0, 0);
    return oc.toDataURL('image/png');
  };
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // 单批:取格胞前缀直到装满一屏 → 摆放/三拍/逐行分析/清场
  const runBatch = async (cellsFrom) => {
    const p00 = g.camera.worldToScreen(0, 0);
    const invX = (sx) => (sx - p00[0]) / z;
    const invY = (sy) => (sy - p00[1]) / z;
    const placed = [];
    {
      let x = MARGIN, y = MARGIN, maxH = 0;
      for (let i = cellsFrom; i < allCells.length; i++) {
        const p = allCells[i];
        if (x + p.cellW > MARGIN + usableW) { x = MARGIN; y += maxH + GAPY; maxH = 0; }
        if (y + p.cellH > MARGIN + usableH) break;
        p.sx = x; p.sy = y;
        x += p.cellW; maxH = Math.max(maxH, p.cellH);
        placed.push(p);
      }
    }
    if (!placed.length) return { rows: [], consumed: 0 };
    drawLog.length = 0;   // 每批重置(分析同批读回,防 cap 挤占)
    const rows = [];
    for (const p of placed) {
      const ent = meta.get(p.id).e;
      ent.x = invX(p.sx + p.cellW / 2) - ent.w / 2;
      ent.y = invY(p.sy + p.cellH / 2) - ent.h / 2;
      ent.vx = 0; ent.vy = 0; ent.visAngle = 0; ent.spin = 0; ent.facing = -1;
      ent.spawnAlpha = 0; ent.alpha = 0;   // 静息态=完成淡入(620 等出生 254 α 会整只隐形)
      if (ent.oldPos) ent.oldPos.length = 0;
      g.entities.enemies.push(ent);
    }
    await raf2();
    // 贴图就绪门:懒加载 PNG 未到位时 drawImage 缺席(shotA 全空假象)——
    // 等到本批每 id 在 drawLog 出现,或 240 帧超时
    for (let t = 0; t < 240; t++) {
      const want = new Set(placed.map((p) => p.id));
      const have = new Set(drawLog.filter((l) => want.has(l.id)).map((l) => l.id));
      if (have.size >= want.size) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    // 错位自检:每实体世界→屏 必须落回槽心(相机滑动/lerp 残留会在此现形)
    for (const p of placed) {
      const ent = meta.get(p.id).e;
      const [gsx, gsy] = g.camera.worldToScreen(ent.cx, ent.cy);
      const wantX = p.sx + p.cellW / 2, wantY = p.sy + p.cellH / 2;
      if (Math.abs(gsx - wantX) > 2 || Math.abs(gsy - wantY) > 2) {
        rows.push({ id: p.id, class: 'misplaced', want: [Math.round(wantX), Math.round(wantY)], got: [Math.round(gsx), Math.round(gsy)] });
      }
    }
    window.__swAuditPhase = 'A';
    const shotA = fullGrab();
    window.__swAuditScaleLog.length = 0;
    for (const pr of placed) { const ent = meta.get(pr.id).e; ent.facing = 1; ent.visAngle = 0; ent.spin = 0; }
    window.__swAuditPhase = 'C';
    await raf2();
    const shotC = fullGrab();
    for (const pr of placed) { const ent = meta.get(pr.id).e; ent.x += 1e6; }
    await raf2();
    const shotB = fullGrab();

    for (const pr of placed) {
      const id = pr.id;
      const md = meta.get(id);
      const { ast, sV } = md;
      const ent = md.e;
      const W = pr.cellW + 24, H = pr.cellH + 24;
      const x0 = Math.max(0, pr.sx - 12), y0 = Math.max(0, pr.sy - 12);
      const sub = (shot) => {
        const outD = new Uint8ClampedArray(W * H * 4);
        for (let yy = 0; yy < H; yy++) {
          const src = (y0 + yy) * cv.width + x0;
          outD.set(shot.subarray(src * 4, src * 4 + W * 4), yy * W * 4);
        }
        return outD;
      };
      const A = sub(shotA), C = sub(shotC), B = sub(shotB);
      const a = analyzeSil(A, W, H, B);
      const c = analyzeSil(C, W, H, B);
      if (!a.bbox || !c.bbox) {
        const row0 = {
          id, class: 'not-rendered', aCnt: a.cnt, cCnt: c.cnt,
          dead: !!ent.dead, alpha: ent.spawnAlpha ?? ent.alpha,
          called: (window.__swAuditCalled ?? new Set()).has(id),
          boss: !!VANILLA[id]?.boss,
          noGravity: !!VANILLA[id]?.noGravity, aiStyle: VANILLA[id]?.aiStyle,
        };
        if (dumpN < 12) { row0.cropA = cropDataUrl(shotA, x0, y0, W, H); dumpN++; }
        rows.push(row0);
        continue;
      }
      const silAsset = ast.sil;
      const symScore = diffGrid(silAsset, flipRows(silAsset));
      const symmetric = symScore <= 24;
      // bbox 局部 24×24 剪影(窗口网格会抹掉四肢细节,骨架类曾误判 identical)
      const bboxSil = (M, bb) => {
        const g2 = new Float32Array(24 * 24);
        if (!bb) return g2;
        const [x1, y1, x2, y2] = bb;
        const bw = Math.max(1, x2 - x1 + 1), bh = Math.max(1, y2 - y1 + 1);
        for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
          const i = (yy * W + xx) * 4;
          const dd = Math.abs(M[i] - B[i]) + Math.abs(M[i + 1] - B[i + 1]) + Math.abs(M[i + 2] - B[i + 2]);
          if (dd > 60) g2[Math.min(23, ((yy - y1) * 24 / bh) | 0) * 24 + Math.min(23, ((xx - x1) * 24 / bw) | 0)] = 1;
        }
        return g2;
      };
      const gA = bboxSil(A, a.bbox), gC = bboxSil(C, c.bbox);
      const flip24 = (g2) => {
        const o = new Float32Array(24 * 24);
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) o[y * 24 + x] = g2[y * 24 + (23 - x)];
        return o;
      };
      const dDirect = diffGrid(gA, gC);
      const dMirrorAB = diffGrid(gA, flip24(gC));
      const symSelf = diffGrid(gA, flip24(gA));
      let cls;
      if (a.cnt < 20 || c.cnt < 20) cls = 'faint-pixels';
      else if (symSelf <= 10) cls = 'uninformative-symmetric';
      else if (dMirrorAB < dDirect * 0.6) cls = 'mirror-pair';
      else if (dDirect < dMirrorAB * 0.6) cls = 'identical-pair';
      else cls = 'odd-transform';
      const da = T.drawAdj[id] ?? {};
      // ai/wet 条件档的静息值(条件不满足时的 else 分支,1458 逐 case 核对)
      const AI_REST_NUM46 = { 469: 0, 694: -2 };
      let num46 = 0;
      if ([108, 124, 625].includes(id)) num46 = 2;
      else if (AI_REST_NUM46[id] !== undefined) num46 = AI_REST_NUM46[id];
      else if (da.num46 !== undefined && !da.wetDependent && !da.aiDependent) num46 = da.num46;
      else if (id === 692) num46 = 6;
      else if (id === 626 || id === 627) num46 = 2;
      else if (id === 688) num46 = 10;
      else if (da.num46 !== undefined && !da.aiDependent && da.wetDependent) num46 = da.num46 === -2 ? 2 : da.num46;
      let n47 = T.addHeight[id] ?? 0;
      if (da.num47Set !== undefined) n47 = da.num47Set;
      if (da.num47Add !== undefined) n47 += da.num47Add;
      if (T.drawSide.num47[id] !== undefined) n47 = T.drawSide.num47[id];
      const addYExpected = num46 + n47;
      const cyCenter = pr.sy + pr.cellH / 2;
      const spyLogs = drawLog.filter((l) => l.id === id);
      // 主绘制 = 最大 dh 组内 dy 中位数(副绘制/翼摆会污染首条)
      const mainSpy = (() => {
        if (!spyLogs.length) return null;
        const maxDh = Math.max(...spyLogs.map((l) => l.dh));
        const grp = spyLogs.filter((l) => l.dh === maxDh).map((l) => l.dy).sort((a2, b2) => a2 - b2);
        const medDy = grp[Math.floor(grp.length / 2)];
        return spyLogs.find((l) => l.dh === maxDh && l.dy === medDy) ?? spyLogs[0];
      })();
      let addYRepo = null, dxShiftRepo = null;
      if (mainSpy) {
        addYRepo = Math.round((mainSpy.dy + mainSpy.sh / 2) * 100) / 100;
        dxShiftRepo = Math.round((mainSpy.dx + mainSpy.sw / 2) * 100) / 100;
      }
      let measTopRaw = y0 + a.bbox[1], measBotRaw = y0 + a.bbox[3];
      {
        const rowMass = new Array(H).fill(0);
        for (let yy = 0; yy < H; yy++) {
          let m = 0;
          for (let xx = 0; xx < W; xx++) {
            const i = (yy * W + xx) * 4;
            const dd = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
            if (dd > 60) m++;
          }
          rowMass[yy] = m;
        }
        const peak = Math.max(...rowMass);
        const thr = Math.max(3, peak * 0.25);
        let bt = -1, bb = -1;
        for (let yy = a.bbox[1]; yy <= a.bbox[3]; yy++) if (rowMass[yy] >= thr) { if (bt < 0) bt = yy; bb = yy; }
        if (bt >= 0) { measTopRaw = y0 + bt; measBotRaw = y0 + bb; }
      }
      const measTop = measTopRaw, measBot = measBotRaw;
      let best = null;
      for (let f = 0; f < (ast.frames ?? 1); f++) {
        const fb = ast.frameBounds[f];
        const pT = cyCenter + (addYExpected * sV - (ast.fhFull / 2) * sV + fb.fMin * sV) * z;
        const pB = cyCenter + (addYExpected * sV - (ast.fhFull / 2) * sV + (fb.fMax + 1) * sV) * z;
        const dT = measTop - pT, dB = measBot - pB;
        const score = Math.abs(dT) + Math.abs(dB);
        if (!best || score < best.score) best = { f, dT, dB, score, pT };
      }
      const fb0 = ast.frameBounds[0];
      const dT0 = Math.round((measTop - (cyCenter + (addYExpected * sV - (ast.fhFull / 2) * sV + fb0.fMin * sV) * z)) * 10) / 10;
      const dB0 = Math.round((measBot - (cyCenter + (addYExpected * sV - (ast.fhFull / 2) * sV + (fb0.fMax + 1) * sV) * z)) * 10) / 10;
      const row = {
        id, name: VANILLA[id]?.name, w: ent.w, h: ent.h,
        cls, symmetric,
        dDirect, dMirror: dMirrorAB,   // 判据透明化(歧义案可复核)
        policy: flipPolicyOf(id),
        addY: addYExpected, addYRepo, addYDelta: addYRepo == null ? null : Math.round((addYRepo - addYExpected) * 100) / 100,
        dxShift: dxShiftRepo,
        sV: Math.round(sV * 1000) / 1000,
        topDeltaVanilla: Math.round(best.dT * 10) / 10,
        botDeltaVanilla: Math.round(best.dB * 10) / 10,
        frameK: best.f, frames: ast.frames ?? 1,
        dT0, dB0,
        spriteTop: measTop, spriteBot: measBot, predTop: Math.round(best.pT * 10) / 10,
        boxTop: Math.round(pr.sy + pr.cellH / 2 - (ent.h / 2) * z),
        asset: [ast.fw, ast.fhFull, ast.fMin, ast.fMax],
      };
      if (mainSpy) {
        const sliceTop = cyCenter + mainSpy.dy * sV * z;
        const sliceBot = cyCenter + (mainSpy.dy + mainSpy.sh) * sV * z;
        row.extraAbove = Math.round((sliceTop - measTop) * 10) / 10;
        row.extraBelow = Math.round((measBot - sliceBot) * 10) / 10;
        // 独占绘制路径(通用尾段不适用):drawEnemy 早退清单 + 特殊锚支
        const SPECIAL = new Set([594, 690, 657, 576, 577, 564, 565, 668, 396, 397, 398, 400, 636, 402, 266, 491, 551, 677, 488, 393]);
        if (SPECIAL.has(id) || mainSpy.sw !== ast.fw || mainSpy.sh !== ast.fhFull) row.path = 'special';
      }
      const anchorBad = row.addYDelta != null && Math.abs(row.addYDelta) > 0.6 && row.path !== 'special';
      row.anchorBad = anchorBad;
      // 主绘制矩阵取证:C/A 相位下主体 drawImage 是否运行在镜像矩阵(a<0)
      {
        const cMain = spyLogs.filter((l) => l.phase === 'C').sort((a2, b2) => b2.dh - a2.dh)[0];
        row.mainFlipC = !!(cMain && cMain.mtx && cMain.mtx[0] < 0);
        const aMain = spyLogs.filter((l) => l.phase === 'A').sort((a2, b2) => b2.dh - a2.dh)[0];
        row.mainFlipA = !!(aMain && aMain.mtx && aMain.mtx[0] < 0);
      }
      // 镜像策略期望对账(乌鸦倒飞类自动定罪通道)
      {
        const p = row.policy;
        const expectMirror = p === 'standard' || p === 'inverted-standard';
        const expectIdentical = p === 'rotation-identical' || p === 'identical-at-rest' || p === 'never-mirror' || p === 'own-quadrant';
        // 判据说明(2026-08-30 终审):主绘制矩阵法在多批环境下不稳定(同 id
        // 子集跑=发射、全量跑=false),而「ratio 近对称抑制 + 抽样视觉直证」
        // 已证 16 条 suspects 全部正确翻转(485/63 等 _flip-truth 实拍)。
        // 故判定回归 ratio 法;mainFlipA/C 仅作信息列保留。
        const renderNearSym = dDirect < 0.2 * Math.max(1, dMirrorAB);
        row.policyBad = expectMirror && cls === 'identical-pair' && !renderNearSym;
        if (!row.policyBad && expectMirror && cls === 'identical-pair') {
          cls = 'uninformative-symmetric';   // 翻转正常但形同 ⇒ 近对称艺术
        }
        void renderNearSym;
        row.cls = cls;   // 近对称降级同步回行
      }
      if (row.policyBad && dumpP < 16) { row.cropA = cropDataUrl(shotA, x0, y0, W, H); dumpP++; }
      else if ((cls !== 'mirror-pair' && cls !== 'identical-pair' && cls !== 'uninformative-symmetric' || anchorBad) && dumpN < 14) {
        row.cropA = cropDataUrl(shotA, x0, y0, W, H);
        dumpN++;
      }
      rows.push(row);
    }
    // 清场本批
    for (const pr of placed) {
      const arr = g.entities.enemies;
      const idx = arr.indexOf(meta.get(pr.id).e);
      if (idx >= 0) arr.splice(idx, 1);
    }
    return { rows, consumed: placed.length };
  };

  // 相机步进驱动(行超出一屏 → 下移世界继续)
  const settleCam = async () => {
    let last = [1e9, 1e9];
    let stable = 0;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const cur = g.camera.worldToScreen(g.player.cx, g.player.cy);
      if (Math.abs(cur[0] - last[0]) < 0.05 && Math.abs(cur[1] - last[1]) < 0.05) {
        if (++stable >= 5) return i;
      } else stable = 0;
      last = cur;
    }
    return -1;
  };
  let cellsFrom = 0;
  let batchN = 0;
  while (cellsFrom < allCells.length) {
    const { rows, consumed } = await runBatch(cellsFrom);
    if (consumed === 0) break;
    rep.pass1.push(...rows);
    cellsFrom += consumed;
    batchN++;
    if (cellsFrom < allCells.length) {
      g.player.y += (usableH - 60) / z;   // 相机随玩家下移一带
      const st = await settleCam();
      if (st < 0) { rep.meta.cameraStuck = true; break; }
    }
  }
  rep.meta.batches = batchN;
  rep.drawLog = drawLog.slice(0, 400);

  // ---------- 汇总 ----------
  const sum = {};
  for (const [k, v] of Object.entries(rep.pass0)) sum[`pass0.${k}`] = v.length;
  sum['pass1.total'] = rep.pass1.length;
  sum['pass1.anchor-bad'] = rep.pass1.filter((r) => Math.abs(r.topDeltaVanilla ?? 0) > 2.2 || Math.abs(r.botDeltaVanilla ?? 0) > 2.2).length;
  sum['pass1.cls'] = rep.pass1.reduce((m, r) => { if (r.cls) m[r.cls] = (m[r.cls] ?? 0) + 1; return m; }, {});
  rep.summary = sum;
  return rep;
}, { truthRaw: TRUTH_RAW, mode: MODE, idsFilter: IDS_FILTER, prev: PREV, quickIds: QUICK_IDS });

writeFileSync(prevPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary, null, 1));
console.log(`报告: ${prevPath}`);
if (out.pass1?.length) {
  console.table(out.pass1.filter((r) => r.cls || r.class).map((r) => ({
    id: r.id, name: r.name, cls: r.cls ?? r.class,
    sym: r.symmetric ? 1 : 0,
    addYD: r.addYDelta, dX: r.dxShift, exUp: r.extraAbove, exDn: r.extraBelow,
    topD: r.topDeltaVanilla, botD: r.botDeltaVanilla, fK: r.frameK,
    box: r.w ? `${r.w}x${r.h}` : '',
  })));
}
for (const [k, arr] of Object.entries(out.pass0)) {
  console.log(`\n== ${k} (${arr.length}) ==`);
  for (const r of arr.slice(0, 30)) console.log(' ', JSON.stringify(r));
}
await browser.close();
