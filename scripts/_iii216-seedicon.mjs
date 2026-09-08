// ★IIIII216 一次性验收探针：天顶种子图标两域（创建屏 + 世界列表）+ 特殊种子抽查。
//   SW_ORIGIN=http://localhost:5274 node tools/run-diag.mjs scripts/_iii216-seedicon.mjs
// 验收面：
//   ① 创建屏 get fixed boi：.sw-wc-seedicon-cv canvas 可见、静态 img 隐藏；
//      canvas 像素 ∈ 图集 7×16 某 62×60 帧（=UIImageFramed 裁帧语义,非整图压缩）；
//      内容随时间变化（动画在跑）；面板截图。
//   ② 创建屏其余种子抽查：drunk/ftw/celebration/constant/skyblock/noTraps/remix/
//      notTheBees → 静态 img src 正确且自然尺寸 60×60；秘密种子路由（monochrome/
//      vampire…）不命中图标键 → Seed_Normal 默认。
//   ③ 世界列表天顶行：.sw-vitem-zenith canvas 非空白（首拍竞态修复:不再因
//      onload 未到清钟）且动画推进;普通行 img 正常。
// 产物：/tmp/iii216-out/{report.json, shot-create-zenith.png, shot-wsel.png}
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5274';
const OUT = '/tmp/iii216-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/error/i.test(t)) errs.push(t.slice(0, 160)); });
await page.goto(ORIGIN + '/?menu=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && typeof window.__swFlow?.showCharSelect === 'function', { timeout: 180000 });
// 真实流桥进角色选择页:showCharacterSelect 会 titleMenu.destroy()——标题菜单的
// z=10000 不透明画布(黑底+向日葵)若不摘,直接构面板会被整幅遮住(截图全黑)
await page.evaluate(() => window.__swFlow.showCharSelect());
await new Promise((r) => setTimeout(r, 800));
// headless 启动幕不交接(过渡图 backgroundImage 等待)——幕 z=10000 会盖住一切 DOM,
// 截图前摘除(app 域无改动;探针侧 DOM 清理)
await page.evaluate(() => { document.getElementById('sw-boot-prime')?.remove(); document.getElementById('sw-splash')?.remove(); });
await new Promise((r) => setTimeout(r, 200));

const report = await page.evaluate(async () => {
  const out = { create: {}, spot: [], wsel: {} };
  const hash = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0; let opaque = 0;
    for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] + d[i + 2]) | 0; if (d[i + 3] > 0) opaque++; }
    return { h, opaque };
  };
  // ── ① 创建屏：直接构造面板（同 _wsel-cycle-probe 直构模式）──
  const { WorldCreationPanel } = await import('/src/ui/WorldCreation.ts');
  const flow = { onCreate: () => {}, onCancel: () => {} };
  const panel = new WorldCreationPanel(document.getElementById("game-root") ?? document.body, flow);
  const input = document.querySelector('.sw-wc-panel [data-f=seed]');
  const setSeed = (v) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); };
  setSeed('get fixed boi');
  await new Promise((r) => setTimeout(r, 600));   // 图集加载+首帧
  const cv = document.querySelector('.sw-wc-seedicon-cv');
  const img = document.querySelector('.sw-wc-seedicon');
  const c1 = hash(cv);
  await new Promise((r) => setTimeout(r, 500));
  const c2 = hash(cv);
  // 图集 112 帧 (variation 0..6, frame 0..15) 中恰有一帧与当前 canvas 全等?
  const atlas = new Image();
  atlas.src = '/sprites/vanilla-ui/UI_WorldCreation_Seed_Everything.png';
  await new Promise((res) => { atlas.onload = res; atlas.onerror = res; });
  const probe = document.createElement('canvas');
  probe.width = 62; probe.height = 60;
  const pc = probe.getContext('2d', { willReadFrequently: true });
  const live = cv.getContext('2d').getImageData(0, 0, 62, 60).data;
  let matchedFrame = -1;
  if (atlas.complete && atlas.width === 434) {
    outer:
    for (let f = 0; f < 16; f++) for (let v = 0; v < 7; v++) {
      pc.clearRect(0, 0, 62, 60);
      pc.drawImage(atlas, v * 62, f * 60, 62, 60, 0, 0, 62, 60);
      const fd = pc.getImageData(0, 0, 62, 60).data;
      let eq = true;
      for (let i = 0; i < fd.length; i += 7) { if (fd[i] !== live[i] || fd[i + 1] !== live[i + 1] || fd[i + 2] !== live[i + 2] || fd[i + 3] !== live[i + 3]) { eq = false; break; } }
      if (eq) { matchedFrame = f * 7 + v; break outer; }
    }
  }
  out.create.zenith = {
    cvVisible: cv && getComputedStyle(cv).display !== 'none',
    imgHidden: img && getComputedStyle(img).display === 'none',
    cvSize: cv ? `${cv.width}x${cv.height}` : null,
    opaqueA: c1.opaque, opaqueB: c2.opaque,
    animChanged: c1.h !== c2.h,
    matchedFrame,   // -1=无帧全等(错);>=0=variation*7+frame 帧全等(对)
    atlasLoaded: atlas.width === 434 && atlas.height === 960,
  };
  // ── ② 特殊种子抽查（图标键 + 自然尺寸）──
  const CASES = [
    ['05162020', 'UI_WorldCreation_Seed_Drunk.png'], ['for the worthy', 'UI_WorldCreation_Seed_ForTheWorthy.png'],
    ['celebrationmk10', 'UI_WorldCreation_Seed_Celebration.png'], ['constant', 'UI_WorldCreation_Seed_TheConstant.png'],
    ['skyblock', 'UI_WorldCreation_Seed_Skyblock.png'], ['no traps', 'UI_WorldCreation_Seed_NoTraps.png'],
    ['dont dig up', 'UI_WorldCreation_Seed_Remix.png'], ['not the bees', 'UI_WorldCreation_Seed_NotTheBees.png'],
    ['monochrome', 'UI_WorldCreation_Seed_Normal.png'], ['what a horrible night to have a curse', 'UI_WorldCreation_Seed_Secret.png'],
    ['12345', 'UI_WorldCreation_Seed_Normal.png'],
  ];
  for (const [seed, want] of CASES) {
    setSeed(seed);
    await new Promise((r) => setTimeout(r, 80));
    const i2 = document.querySelector('.sw-wc-seedicon');
    const cvHidden = getComputedStyle(cv).display === 'none';
    out.spot.push({ seed, want, src: i2.getAttribute('src').split('/').pop(), ok: i2.getAttribute('src').endsWith(want) && cvHidden && i2.naturalWidth === 60 && i2.naturalHeight === 60, nat: `${i2.naturalWidth}x${i2.naturalHeight}` });
  }
  // 回到天顶态供截图
  setSeed('get fixed boi');
  await new Promise((r) => setTimeout(r, 400));
  out.create.panelOk = !!document.querySelector('.sw-wc-panel');
  window.__iii216Keep = true;   // 截图后再收尾（外层先拍这张面板）
  return out;
});
report.errs = errs.slice(0, 6);
await page.screenshot({ path: `${OUT}/shot-create-zenith.png` }).catch(() => {});
await page.evaluate(() => { const p = document.querySelector('.sw-wc-panel'); if (p) p.remove(); });

// ── ③ 世界列表（同页,标题画布已摘;直构 WorldSelectPanel + fakeStore,同 _wsel-cycle-probe）──
await new Promise((r) => setTimeout(r, 300));
report.wsel = await page.evaluate(async () => {
  const { WorldSelectPanel } = await import('/src/ui/WorldSelect.ts');
  const metas = [
    { id: 1, name: '天顶III216', seed: 'get fixed boi', w: 4200, h: 1200, difficulty: 0, evil: 0, hardMode: false, createdAt: 1, lastPlayed: 1, playTimeMs: 0, favorite: false },
    { id: 2, name: '普通III216', seed: '12345', w: 6400, h: 1800, difficulty: 0, evil: 1, hardMode: true, createdAt: 3, lastPlayed: 3, playTimeMs: 0, favorite: false },
  ];
  const fakeStore = { ensureLoaded: async () => {}, list: () => metas, setFavorite: async () => {}, rename: async () => {}, delete: async () => {} };
  const panel = new WorldSelectPanel(document.getElementById("game-root") ?? document.body, fakeStore, { onPlay: () => {}, onNew: () => {}, onBack: () => {}, onImport: async () => {} });
  const hash = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0; let opaque = 0;
    for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] + d[i + 2]) | 0; if (d[i + 3] > 0) opaque++; }
    return { h, opaque };
  };
  const blank = document.createElement('canvas'); blank.width = 62; blank.height = 60;
  const blankHash = hash(blank).h;
  // 冷加载语义:reload() 异步建行——等 400ms 再查(此窗内图集尚未 onload,
  // 旧代码首拍已清钟 → 恰好复现用户空白域;修复后钟存活继续轮询)
  await new Promise((r) => setTimeout(r, 400));
  const items = [...document.querySelectorAll('.sw-vsel .sw-vitem')];
  const zc = items[0]?.querySelector('.sw-vitem-zenith');
  await new Promise((r) => setTimeout(r, 700));
  const a = hash(zc);
  await new Promise((r) => setTimeout(r, 500));
  const b = hash(zc);
  const normalImg = items[1]?.querySelector('.sw-vitem-icon');
  const res = {
    rows: items.length,
    zenithPresent: !!zc,
    zenithPainted: a.opaque > 0 && a.h !== blankHash,
    zenithAnim: a.h !== b.h,
    zenithOpaque: a.opaque,
    normalIcon: normalImg ? { src: normalImg.getAttribute('src').split('/').pop(), nat: `${normalImg.naturalWidth}x${normalImg.naturalHeight}`, loaded: normalImg.complete && normalImg.naturalWidth > 0 } : null,
  };
  window.__iii216Shot = true;
  return res;   // 面板留活,外层拍完再收
});
await page.screenshot({ path: `${OUT}/shot-wsel.png` }).catch(() => {});
await page.evaluate(() => { document.querySelector('.sw-vsel')?.remove(); });

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log('SUMMARY', JSON.stringify({
  zenithCreate: report.create.zenith, panelOk: report.create.panelOk,
  spotFails: report.spot.filter((s) => !s.ok), spotOk: report.spot.filter((s) => s.ok).length,
  wsel: report.wsel, errs: report.errs,
}));
await browser.close();
