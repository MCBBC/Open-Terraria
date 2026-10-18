// 向导楔死案·终审探针（2026-09-02 备案收齐版；替代过程脚本 _guidewedge{,2..6}.mjs）
// 案卷：behavior-log-Starter_World-2026-09-02T14-23-50-255Z.json（326 事件）
//  机制：1 格门洞(3181 列,净高 32px<40)挤不进 → 左缘 1px 嵌 (3180,378) 王朝木
//  →X 恒拦 hw=1 + 悬空 stuckT 不折返 → unembedPass topEmbedded 抬升 ↔ 重力
//  = 10t 极限环「电梯」。修复 = TileCollision unembedPass 悬空无支撑假嵌入
//  门（!onGround && vy>=0 && !centerSolid → 交还原版物理）。
// 场景：A 日志起点态端到端 / B 站台楔死态水平支救援 / C 存档原始位长跑
//  / D 自然入场微路径三支（上部落入·2px 深嵌落入·邻列落入）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (28).json'));
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  window.__swPhysDbg = {};
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');
  if (!guide) return { err: 'no guide' };

  const press = (n) => {                       // 复现日志姿态: wm=1 恒左行意图
    n.walkMode = 1; n.walkT = 3000; n.facing = -1;
  };
  const place = (n, x, y) => {
    n.x = x; n.y = y; n.vx = 0; n.vy = 0;
    n.embedTicks = 0; n.embedPushed = 0; press(n);
  };
  // 电梯签名：x 冻结(±1px) + 悬空 + cy 落在井区[6040,6100) 连续 >60t
  const scanElevator = (trace) => {
    let run = 0, worst = 0, lastX = null;
    for (const r of trace) {
      if (r.g === 0 && r.cy >= 6040 && r.cy < 6100 && lastX !== null && Math.abs(r.x - lastX) <= 1) {
        run++; worst = Math.max(worst, run);
      } else run = 0;
      lastX = r.x;
    }
    return worst;                              // 电梯环=数百拍; 瞬态下落≤~15 拍
  };

  // ---- A 日志起点态（t=390 样本: cx=50904, cy=6057, 悬空, hw, wm=1, dir=-1）----
  place(guide, 50904 - guide.w / 2, 6057 - guide.h / 2);
  const traceA = [];
  let lastX = guide.x, lastY = guide.y, stuckRun = 0, maxStuckA = 0;
  for (let i = 0; i < 1500; i++) {
    g.fixedUpdate(1 / 60);
    if (Math.abs(guide.x - lastX) < 0.01 && Math.abs(guide.y - lastY) < 0.01 && !guide.onGround) {
      maxStuckA = Math.max(maxStuckA, ++stuckRun);
    } else stuckRun = 0;
    lastX = guide.x; lastY = guide.y;
    traceA.push({ x: Math.round(guide.x), cy: Math.round(guide.y + guide.h / 2), g: guide.onGround ? 1 : 0, hw: guide.hitWall ? 1 : 0 });
  }
  const A = {
    elevatorSignature: scanElevator(traceA),
    maxAirborneFrozenRun: maxStuckA,
    final: traceA[traceA.length - 1],
  };

  // ---- B 站台楔死态（feet=平台顶 6048, cx=50904, onGround）——水平支救援必须存活 ----
  place(guide, 50895, 6048 - guide.h);
  const traceB = [];
  for (let i = 0; i < 12; i++) { g.fixedUpdate(1 / 60); traceB.push({ x: Math.round(guide.x), g: guide.onGround ? 1 : 0, eP: guide.embedPushed | 0 }); }
  const B = {
    rescued: traceB.some((r) => r.x > 50900 && r.g === 1),
    pushedPx: Math.max(...traceB.map((r) => r.eP)),
  };

  // ---- C 存档原始位（ramp 顶 50958,6024）长跑 ----
  place(guide, 50958 - guide.w / 2, 6024);
  guide.facing = 1;
  lastX = guide.x; lastY = guide.y; stuckRun = 0;
  let maxStuckC = 0;
  for (let i = 0; i < 1200; i++) {
    g.fixedUpdate(1 / 60);
    if (Math.abs(guide.x - lastX) < 0.01 && Math.abs(guide.y - lastY) < 0.01 && !guide.onGround) {
      maxStuckC = Math.max(maxStuckC, ++stuckRun);
    } else stuckRun = 0;
    lastX = guide.x; lastY = guide.y;
  }
  const C = { maxAirborneFrozenRun: maxStuckC, finalX: Math.round(guide.x), finalG: guide.onGround ? 1 : 0 };

  // ---- D 自然入场微路径（各自落到「站台楔死→水平支救援」或「井内→下落自解」）----
  const D = {};
  // d1 正上方落入 cx=50904（左缘 1px 嵌 (3180,378) 触 X 拦的入场路径）
  // freed 判据 = 离开楔点(>32px) + 途中有着地样本 + 无电梯签名；
  // 终样允许半空（拐角跳跃是 AI 正常行为,末 100t 落地样本数单列复核）
  const exited = (trace, x0) => trace.some((r) => Math.abs(r.x - x0) > 32)
    && trace.some((r) => r.g === 1);
  const groundedInTail = (trace) => trace.slice(-100).filter((r) => r.g === 1).length;
  const hopEvidence = (trace) => {           // 末 100t g 翻转次数(>0 = 起跳态非冻结)
    let flips = 0;
    for (let i = 1; i < Math.min(100, trace.length); i++) if (trace[i].g !== trace[i - 1].g) flips++;
    return flips;
  };
  place(guide, 50904 - guide.w / 2, 5960);
  guide.vy = 2;
  let d1 = [];
  for (let i = 0; i < 400; i++) { g.fixedUpdate(1 / 60); d1.push({ x: Math.round(guide.x), cy: Math.round(guide.y + guide.h / 2), g: guide.onGround ? 1 : 0 }); }
  D.d1_fallAbove = {
    elevatorSignature: scanElevator(d1),
    exitedWedge: d1.some((r) => Math.abs(r.x - 50895) > 32),
    groundedInTail: groundedInTail(d1),
    hopFlips: hopEvidence(d1),
    freed: exited(d1, 50895) && scanElevator(d1) <= 20,
    final: d1[d1.length - 1],
  };
  // d2 邻列落入 cx=50903（左缘 2px 深嵌,顶行 375 嵌活木的深楔形态）
  place(guide, 50903 - guide.w / 2, 5960);
  guide.vy = 2;
  let d2 = [];
  for (let i = 0; i < 400; i++) { g.fixedUpdate(1 / 60); d2.push({ x: Math.round(guide.x), cy: Math.round(guide.y + guide.h / 2), g: guide.onGround ? 1 : 0 }); }
  D.d2_fallAbove2px = {
    elevatorSignature: scanElevator(d2),
    exitedWedge: d2.some((r) => Math.abs(r.x - 50894) > 32),
    groundedInTail: groundedInTail(d2),
    freed: exited(d2, 50894) && scanElevator(d2) <= 20,
    final: d2[d2.length - 1],
  };
  // d3 井内直落（行为日志起点态的自然前身:平台缘下方悬空左行）
  place(guide, 50904 - guide.w / 2, 6060);
  guide.vy = 1;
  let d3 = [];
  for (let i = 0; i < 400; i++) { g.fixedUpdate(1 / 60); d3.push({ x: Math.round(guide.x), cy: Math.round(guide.y + guide.h / 2), g: guide.onGround ? 1 : 0 }); }
  D.d3_shaft = { elevatorSignature: scanElevator(d3), freed: d3[d3.length - 1].g === 1, final: d3[d3.length - 1] };

  return { A, B, C, D };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
