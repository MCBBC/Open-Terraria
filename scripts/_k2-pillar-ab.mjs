// ★K2 四柱盾泡 A/B 实机探针（2026-10-01）：强置四塔盾可见,真 rAF 实时窗口计量
// 【GL 批路径 vs ?ffgl=0 2D 原链】——冷跑计数（__forceFieldBubbleStats）、
// g.frame 逐帧自耗（均值/p95）、texImage2D/texSubImage2D 归因账（计数+字节),
// 双臂截图目检。泵互斥纪律:perf 计量必须真 rAF（headless 探针五坑判例）。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_k2-pillar-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const TOWER_IDS = [517, 422, 507, 493];   // Solar/Vortex/Nebula/Stardust（LunarEvent.ts）

async function wrapTexCounter(page) {
  await page.evaluate(() => {
    const proto = WebGL2RenderingContext.prototype;
    const st = { uploads: 0, bytes: 0, byTag: {} };
    const tag = (img) => {
      const w = img?.width ?? 0, h = img?.height ?? 0;
      if (w === 128 && h === 128) return '128x128';
      if (w >= 512 || h >= 512) return 'big';
      return 'small';
    };
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const orig = proto[name];
      proto[name] = function (...args) {
        // 9 参 DOM 源重载尾参=img;字节账按源尺寸估
        const img = args.find((a) => a && typeof a === 'object' && 'width' in a && 'height' in a && !(a instanceof ArrayBuffer) && !(ArrayBuffer.isView(a)));
        if (img && img.width > 0 && img.height > 0) {
          st.uploads++; st.bytes += img.width * img.height * 4;
          const t = tag(img);
          st.byTag[t] = st.byTag[t] || { n: 0, bytes: 0 };
          st.byTag[t].n++; st.byTag[t].bytes += img.width * img.height * 4;
        } else if (typeof args[2] === 'number' && typeof args[7] === 'number') {
          st.uploads++; st.bytes += args[2] * args[7] * 4;   // (w,h) 数据重载
        }
        return orig.apply(this, args);
      };
    }
    window.__texStats = st;
  });
}

async function setupTowers(page) {
  return page.evaluate(async (ids) => {
    const g = window.__swGame;
    if (!g?.world) return { ok: false, why: 'no game' };
    const px = g.player.cx, py = g.player.cy;
    const spawned = [];
    for (let i = 0; i < ids.length; i++) {
      const e = await window.__swFlow.spawnVanillaEnemy(ids[i], px - 300 + i * 200, py - 40);
      if (e) spawned.push(e.id);
    }
    // 强置盾满（drawTowerShield 读 world.lunarEvent.shield[key];frac 钳 0..1）
    const le = g.world.lunarEvent;
    for (const k of ['solar', 'vortex', 'nebula', 'stardust']) le.shield[k] = 10000;
    return { ok: true, spawned, px, py };
  }, TOWER_IDS);
}

async function measureWindow(page, ms, label) {
  // 相机贴住玩家（塔在屏内）;g.frame 包裹逐帧自耗
  await page.evaluate((ids) => {
    const g = window.__swGame;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    const st = { durs: [], n: 0 };
    if (!g.__origFrame) {
      g.__origFrame = g.frame;
      g.frame = function (...a) {
        const t0 = performance.now();
        const r = g.__origFrame.apply(this, a);
        const d = performance.now() - t0;
        st.durs.push(d); st.n++;
        return r;
      };
    }
    window.__frameSt = st;
    // 计数窗起点
    const ff = globalThis.__ffStatsSnap = null;
    void ff;
    window.__ffStart = null;
    import('/src/fx/ForceFieldBubble.ts').then((m) => {
      window.__ffStart = { ...m.__forceFieldBubbleStats };
    });
    window.__texStart = JSON.parse(JSON.stringify(window.__texStats));
    void ids;
  }, TOWER_IDS);
  await sleep(ms);
  return page.evaluate((lbl) => {
    const st = window.__frameSt;
    const durs = st.durs.slice().sort((a, b) => a - b);
    const p = (q) => durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * q))] : 0;
    const mean = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
    const texNow = window.__texStats;
    const texStart = window.__texStart;
    return {
      label: lbl, frames: st.n,
      mean, p50: p(0.5), p95: p(0.95), max: durs[durs.length - 1] ?? 0,
      tex: {
        uploads: texNow.uploads - texStart.uploads,
        bytes: texNow.bytes - texStart.bytes,
        byTag: Object.fromEntries(Object.entries(texNow.byTag).map(([k, v]) => [k, v.n])),
      },
    };
  }, label).then(async (r) => {
    const ff = await page.evaluate(() => import('/src/fx/ForceFieldBubble.ts').then((m) => ({ now: { ...m.__forceFieldBubbleStats }, start: window.__ffStart })));
    r.ff = ff.start
      ? { sm2Runs: ff.now.sm2Runs - ff.start.sm2Runs, cacheHits: ff.now.cacheHits - ff.start.cacheHits, glEmits: ff.now.glEmits - ff.start.glEmits, glFails: ff.now.glFails - ff.start.glFails }
      : { sm2Runs: ff.now.sm2Runs, cacheHits: ff.now.cacheHits, glEmits: ff.now.glEmits, glFails: ff.now.glFails, note: 'cumulative' };
    return r;
  });
}

async function shoot(page, path) {
  try { await page.screenshot({ path }); } catch { /* 截图失败不阻塞台账 */ }
}

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));

// ---- A 臂:GL 批路径（缺省） ----
await bootstrap(page, ORIGIN + '/');
const flagA = await page.evaluate(() => import('/src/fx/ForceFieldBubble.ts').then(() => true));
void flagA;
const gA = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
chk('A 臂世界就绪', !!gA?.ok, gA?.why ?? '');
await wrapTexCounter(page);   // 导航后包装（goto 会冲掉 evaluateOnNewDocument 之外的注入）
await page.evaluate(() => { const g = window.__swGame; g.player.debugGod = true; });
const towerA = await setupTowers(page);
chk('A 臂四塔强置', towerA.ok && towerA.spawned.length === 4, JSON.stringify(towerA).slice(0, 160));
await sleep(1200);
const A = await measureWindow(page, 5000, 'GL');
await shoot(page, '/tmp/k2-armA-gl.png');
console.log('A(GL)  =', JSON.stringify(A));

// ---- B 臂:?ffgl=0 2D 原链 ----
const pageB = await openPage(browser, {});
// ★BJ95:bootstrap 的 carried query 快照自 page.url()——先带参导航再 bootstrap,
// 否则 clean-reload 把 ?ffgl=0 洗掉（首跑 B 臂两臂同 GL 的教训）
await pageB.goto(ORIGIN + '/?ffgl=0', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await bootstrap(pageB, ORIGIN);
const gB = await createGame(pageB, { mode: 'direct', seed: '05162020', size: 'small' });
chk('B 臂世界就绪', !!gB?.ok, gB?.why ?? '');
await wrapTexCounter(pageB);
await pageB.evaluate(() => { const g = window.__swGame; g.player.debugGod = true; });
const towerB = await setupTowers(pageB);
chk('B 臂四塔强置', towerB.ok && towerB.spawned.length === 4, JSON.stringify(towerB).slice(0, 160));
await sleep(1200);
const B = await measureWindow(pageB, 5000, '2D');
await shoot(pageB, '/tmp/k2-armB-2d.png');
console.log('B(2D)  =', JSON.stringify(B));

// ---- 判读 ----
chk('A 臂 GL 发射在场（glEmits>0,sm2Runs≈0）', A.ff.glEmits > 0 && A.ff.sm2Runs <= 1,
  JSON.stringify(A.ff));
chk('B 臂 2D 冷跑复现（sm2Runs ≈ 5/秒×窗）', B.ff.sm2Runs >= 5,
  JSON.stringify(B.ff));
chk('GL 帧自耗 ≤ 2D（mean）', A.mean <= B.mean * 1.05,
  `mean GL=${A.mean.toFixed(2)}ms 2D=${B.mean.toFixed(2)}ms;p95 GL=${A.p95.toFixed(2)} 2D=${B.p95.toFixed(2)}`);
chk('GL 帧产物/ring 零整幅重传（128²+big 上传 < 2D 同窗）',
  (A.tex.byTag['128x128'] ?? 0) + (A.tex.byTag['big'] ?? 0) < (B.tex.byTag['128x128'] ?? 0) + (B.tex.byTag['big'] ?? 0),
  `tex GL=${JSON.stringify(A.tex)} 2D=${JSON.stringify(B.tex)}`);
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(0);   // A/B 计量臂:失败也保留台账供判读（判读行照打）
