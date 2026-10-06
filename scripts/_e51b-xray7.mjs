// ★E51b 案①定谳仪:2D fallback 烘焙税三相量化（xray6 续刀）。
//  相1 ?bgl=0  2D 会话:fbKey(含未量化 tq) fallback = 常驻主链 → 键漂移全量;
//  相2 GL 缺省:刀B cut+uTint 主流 → 期望 emp 族烘焙≈0(健康帧);
//  相3 GL+开背包:降级窗(bridged/degraded) fallback 接管 → 降级窗烘焙税实测。
//  记账口径:TintAtlas 新键(=烘焙)按家族分账 + 逐帧新键序列(p50/p95/max)
//  + 字节(w×h×4) + distinct 键域 + allocs/recycled(页churn) + bglPathStats。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=560000 scripts/_e51b-xray7.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51B_FRAMES || 600);

const INSTR = async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const ren = g.renderer;
  const C = globalThis.__e51b = {
    calls: new Map(),      // tintedSprite 调用按家族
    miss: new Map(),       // 新键(=烘焙)按家族
    missBytes: new Map(),  // 新键字节按家族
    distinct: new Map(),   // distinct 完整键(按家族→Set)
    frameMiss: 0, frameMissBytes: 0,
    frameSeries: [],       // 逐帧 [miss, bytes]
    allocs: 0, recycled: 0,
    sliceOk: 0, sliceFail: 0,
  };
  const fam = (k) => {
    const s = String(k).split('|');
    if (s[0] === 'emp' || s[0] === 'empG' || s[0] === 'empW') return s[0] + ':' + (s[1] || '');
    return s.slice(0, 2).join('|').replace(/\d+/g, '#');
  };
  const oTint = ren.tintedSprite;
  ren.tintedSprite = function (k, f, c) {
    C.calls.set(fam(k), (C.calls.get(fam(k)) ?? 0) + 1);
    return oTint.call(this, k, f, c);
  };
  const taProto = TA.TintAtlas.prototype;
  const oBake = taProto.bake;
  taProto.bake = function (key, w, h, paint) {
    const had = this.entries.has(key);
    const r = oBake.call(this, key, w, h, paint);
    if (!had && r) {
      const b = w * h * 4;
      const f = fam(key);
      C.miss.set(f, (C.miss.get(f) ?? 0) + 1);
      C.missBytes.set(f, (C.missBytes.get(f) ?? 0) + b);
      const d = C.distinct.get(f) ?? new Set();
      d.add(String(key)); C.distinct.set(f, d);
      C.frameMiss++; C.frameMissBytes += b;
    }
    return r;
  };
  const oAlloc = taProto.alloc;
  taProto.alloc = function (w, h) {
    const r = oAlloc.call(this, w, h);
    C.allocs++;
    if (r && r[3]) C.recycled++;
    return r;
  };
  const oMk = ren.markWorldDynamicScratch;
  ren.markWorldDynamicScratch = function (img, key, tint) {
    const r = oMk.call(this, img, key, tint);
    if (key && tint) { if (r) C.sliceOk++; else C.sliceFail++; }
    return r;
  };
  // boss pin:phase2+拍号钉 2 → 恒 atk8(xray6 判例)
  const ensureBoss = () => {
    let e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e || e.dead) {
      e = Enemy.fromVanilla(636, g.player.cx + 260, g.player.cy - 140);
      if (!e) return;
      g.entities.add(e, 'enemies');
    }
    e.dead = false; e.spawnAlpha = 0;
    if (e.hp > 1) e.hp = 1;
    e.ai3 = 1; e.ai2 = 2;
    e.cx = g.player.cx + 260; e.cy = g.player.cy - 140;
    e.despawnTimer = 750;
    const p = g.player;
    if (p) { p.hp = p.maxHp; p.dead = false; }
  };
  globalThis.__e51bEnsure = ensureBoss;
  globalThis.__e51bReset = () => {
    C.calls.clear(); C.miss.clear(); C.missBytes.clear();
    for (const d of C.distinct.values()) d.clear();
    C.frameMiss = 0; C.frameMissBytes = 0; C.frameSeries.length = 0;
    C.allocs = 0; C.recycled = 0; C.sliceOk = 0; C.sliceFail = 0;
  };
  // 逐帧采样:rAF 拍点切帧桶
  globalThis.__e51bSample = async (framesWanted) => {
    let last = -1;
    for (let i = 0; i < framesWanted * 3 && C.frameSeries.length < framesWanted; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      ensureBoss();
      const f = g.renderer._diagFrame ?? performance.now();
      if (f !== last) {
        C.frameSeries.push([C.frameMiss, C.frameMissBytes]);
        C.frameMiss = 0; C.frameMissBytes = 0;
        last = f;
      }
    }
    const s = C.frameSeries.splice(0, framesWanted);
    const arr = s.map((x) => x[0]).sort((a, b) => a - b);
    const pct = (p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
    const tot = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      frames: s.length,
      newKeys: s.reduce((a, x) => a + x[0], 0),
      newKeysKB: +(s.reduce((a, x) => a + x[1], 0) / 1024).toFixed(1),
      perFrame: { p50: pct(0.5), p95: pct(0.95), max: arr[arr.length - 1] ?? 0, zeroFrames: arr.filter((x) => x === 0).length },
      missByFam: tot(C.miss),
      missKBByFam: tot(C.missBytes).map(([k, v]) => [k, +(v / 1024).toFixed(1)]),
      callsByFam: tot(C.calls),
      distinctByFam: tot(C.distinct).map(([k, d]) => [k, d.size]),
      atlas: { entries: ren.tintAtlas.entries.size, pages: ren.tintAtlas.pageCount, allocs: C.allocs, recycled: C.recycled },
      slice: { ok: C.sliceOk, fail: C.sliceFail },
      path: { ...ren.bglPathStats },
    };
  };
};

async function phase(label, url, extraSetup) {
  const browser = await launchBrowser({ headless: true });
  const page = await openPage(browser, ORIGIN, { width: 1280, height: 800 });
  await page.goto(ORIGIN + url, { waitUntil: 'domcontentloaded' });
  const boot = await bootstrap(page, ORIGIN, { log: () => {} });
  if (!boot?.ok) { console.error(label, 'boot fail', boot); await browser.close(); return null; }
  const made = await createGame(page, { mode: 'direct', seed: 'e51b', size: 'small', pinRandom: 20261007, log: () => {} });
  if (!made?.ok) { console.error(label, 'createGame fail'); await browser.close(); return null; }
  await sleep(1200);
  await page.evaluate(INSTR);
  if (extraSetup) await page.evaluate(extraSetup);
  await page.evaluate(() => globalThis.__e51bEnsure());
  await sleep(1500);   // 预热:首攻渐显+键域热身
  await page.evaluate(() => globalThis.__e51bReset());
  const r = await page.evaluate((n) => globalThis.__e51bSample(n), N);
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
  return r;
}

const openInv = () => { window.__swUI.openInventory(true); };

// ★相隔离:GPU/GL 资源连续 launchBrowser 偶发桥超时(实测)——每进程只跑一相,PHASE 环境变量选相。
const P = process.env.E51B_PHASE || '1';
if (P === '1') await phase('相1 2D会话(?bgl=0) fallback=常驻主链', '/?bgl=0');
else if (P === '2') await phase('相2 GL缺省 刀B主流(cut+uTint)', '/');
else await phase('相3 GL+开背包 降级窗fallback', '/', openInv);
process.exit(0);
