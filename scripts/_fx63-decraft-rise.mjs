// FX63 探针（一次性,tools/run-diag.mjs 运行,SW_ORIGIN 走私有 5273）：
// 微光 decraft 产物上浮三刀端到端——自建封底微光湖（S+4..S+5 实心底+侧壁,防
// LiquidSim 漏干）+ 木剑 vid 24（单材料 → 木材×7 单垛,vx=0 无横漂）直放湖底:
//   案A【偏差2 出生列预扫】顶板盖 X0+4..X0+16（盖住投放列 X0+8,右 ±6 全盖）→
//      预扫应取最近通畅列 X0+3（|offset|=5）→ 产物该列出生并浮出顶板悬停,零穿块。
//   案B【偏差1 钉死穿块兜底】整湖顶板（X0+60..X0+99）→ 预扫回退原位出生
//      （=原版 Center=center）→ 原版钉死位 y=(S+1)*16 → ≥300t tileCollide=false
//      穿块 → 浮出顶板悬停恢复 undefined（原版=永久钉死无超时,明令分歧面）。
// 定步驱动 = 页内 g.fixedUpdate(1/60) 循环（钉位玩家 ~5/13 格内,防掉落冻结距离）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 页内自包含场景函数（真函数 + cfg 参数,闭包不携带 node 侧变量）:
// 建封底湖 → 顶板(可选) → 直放木剑湖底 → 玩家钉位 → 定步驱动 → 回读产物态
const scenarioBody = (cfg) => {
  const { X0, S, roofFrom, roofTo, dropCol, ticks, pinCol } = cfg;
  const g = window.__swGame;
  const st = g.world.store;
  const T = 16;
  const stone = st.type[st.idx(X0, S + 10)] || 1;
  for (let x = X0 - 1; x <= X0 + 40; x++) {          // 封底+侧壁（LiquidSim 防漏）
    st.setTile(x, S + 4, stone); st.setTile(x, S + 5, stone);
    st.liquid[st.idx(x, S + 4)] = 0; st.liquidType[st.idx(x, S + 4)] = 0;
    st.liquid[st.idx(x, S + 5)] = 0; st.liquidType[st.idx(x, S + 5)] = 0;
    if (x === X0 - 1 || x === X0 + 40) {
      for (let y = S - 2; y <= S + 3; y++) { st.setTile(x, y, stone); st.liquid[st.idx(x, y)] = 0; st.liquidType[st.idx(x, y)] = 0; }
    }
  }
  for (let x = X0; x <= X0 + 39; x++) {
    for (let y = S - 2; y <= S; y++) {               // 液面上空清 air（顶板基面）
      st.setTile(x, y, 0); st.liquid[st.idx(x, y)] = 0; st.liquidType[st.idx(x, y)] = 0;
    }
    for (let y = S + 1; y <= S + 3; y++) { st.setTile(x, y, 0); st.liquid[st.idx(x, y)] = 255; st.liquidType[st.idx(x, y)] = 4; }
  }
  for (let x = roofFrom; x <= roofTo; x++) {         // 顶板（row S,液面上一格）
    st.setTile(x, S, stone); st.liquid[st.idx(x, S)] = 0; st.liquidType[st.idx(x, S)] = 0;
  }
  g.entities.drops.length = 0;
  const itemKey = Object.keys(window.__swItems).find((k) => /^vi_24_/.test(k));
  g.spawnDrop((X0 + dropCol) * T, (S + 1) * T, itemKey, 1, 0, 0);
  let sawPhase = false, pinnedY = null, spawnX = null;
  for (let i = 0; i < ticks; i++) {
    g.player.x = pinCol * T; g.player.y = (S - 3) * T; g.player.vx = 0; g.player.vy = 0;
    g.fixedUpdate(1 / 60);
    const prod = g.entities.drops.find((d) => d.shimmered);
    if (!prod) continue;
    if (spawnX === null) spawnX = prod.x + 6;        // vx=0 单垛,x 恒 = 出生 x
    if (prod.tileCollide === false) sawPhase = true;
    if (i === 350) pinnedY = prod.y;                 // 钉死窗采样（decraft~115t+上浮~40t 后）
  }
  const prod = g.entities.drops.find((d) => d.shimmered);
  return { sawPhase, pinnedY, spawnX, found: !!prod,
    finalCy: prod ? prod.y + 6 : -1, finalTile: prod ? prod.tileCollide : 'gone' };
};

await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 30000 });
// 关欢迎弹窗（遮挡截图证物）
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /我已知晓/.test(x.textContent || '')); b?.click(); });
await new Promise((r) => setTimeout(r, 400));
const base = await page.evaluate(() => ({ X0: Math.floor(window.__swGame.player.cx / 16) + 6, S: Math.floor(window.__swGame.world.groundLevel) + 40 }));

// ---- 案A:偏差2 预扫（顶板 X0+4..X0+16 → 通畅列 X0+3,玩家钉 X0−2 ≈5 格）----
const A = await page.evaluate(scenarioBody, { X0: base.X0, S: base.S, roofFrom: base.X0 + 4, roofTo: base.X0 + 16, dropCol: 8, ticks: 700, pinCol: base.X0 - 2 });
check('案A 顶板盖投放列 → 预扫改列出生 col X0+3（右侧 +1..+6 全盖,左侧 −5 最近）',
  A.found && A.spawnX === (base.X0 + 3) * 16 + 8, `spawnX=${A.spawnX} 期望=${(base.X0 + 3) * 16 + 8}`);
check('案A 产物浮出顶板上方悬停 + 全程零穿块',
  A.found && A.finalCy < base.S * 16 + 8 && !A.sawPhase && A.finalTile === undefined,
  `cy=${Math.round(A.finalCy)} (<${base.S * 16 + 8}) tile=${String(A.finalTile)} sawPhase=${A.sawPhase}`);

// ---- 案B:偏差1 整盖钉死 → 300t 穿块兜底（湖2 = X0+60..X0+99,玩家钉 X0+55 ≈13 格）----
const B = await page.evaluate(scenarioBody, { X0: base.X0 + 60, S: base.S, roofFrom: base.X0 + 60, roofTo: base.X0 + 99, dropCol: 8, ticks: 1400, pinCol: base.X0 + 55 });
check('案B 整湖有盖 → 预扫回退原位出生（=原版 SpawnShimmeredItem Center=center）',
  B.found && B.spawnX === (base.X0 + 68) * 16, `spawnX=${B.spawnX} 期望=${(base.X0 + 68) * 16}`);
check('案B 原版钉死位采样（顶板格底 (S+1)*16）', B.pinnedY === (base.S + 1) * 16, `pinnedY=${B.pinnedY} 期望=${(base.S + 1) * 16}`);
check('案B ≥300t 翻 tileCollide=false 穿块 → 浮出顶板悬停恢复 undefined（原版=永久钉死,明令分歧）',
  B.found && B.sawPhase && B.finalCy < (base.S + 1) * 16 - 4 && B.finalTile === undefined,
  `sawPhase=${B.sawPhase} cy=${Math.round(B.finalCy)} tile=${String(B.finalTile)}`);

await page.screenshot({ path: '/tmp/fx63-decraft-rise.png' });
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
