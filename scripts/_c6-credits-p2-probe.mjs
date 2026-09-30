// C6-P2 清偿刀探针：endTime 20545 / 树段 hold / 箱盖开箱链 / 门板相位 / NPC_550
// 跃走段 / Blink 域 实机取证。
// 用法：SW_ORIGIN=http://localhost:5420 SW_EVIDENCE=docs/evidence/credits \
//   node tools/run-diag.mjs scripts/_c6-credits-p2-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_EVIDENCE ?? '/tmp/c6-credits';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inWorld = false;
for (let i = 0; i < 240; i++) {
  await sleep(500);
  inWorld = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (inWorld && i > 8) break;
}
if (!inWorld) { console.log(JSON.stringify({ fatal: 'world boot timeout', errs })); await browser.close(); process.exit(1); }
await sleep(3000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|Got it/.test(x.textContent ?? ''));
  if (b) b.click();
});
await sleep(800);

// ① 状态面取证（页内纯函数域：composer/overlay 导出面直调）
const A = await page.evaluate(async () => {
  const comp = await import('/src/world/creditsRollComposer.ts');
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const fill = comp.getCreditsRollFill(true);
  const segs = fill.segments;
  const spr = (tex) => segs.find((s) => s.k === 'spr' && s.tex === tex);
  const tree = spr('Extra_215'), chest = spr('Extra_228'), door = spr('Extra_240');
  const bgBye = spr('Extra_235'), jumper = spr('NPC_550'), princessBg = spr('Extra_241');
  const evalAt = (seg, local) => {
    const st = ov.blankState();
    ov.evalActs(seg.acts.acts, local, st, seg.k === 'npc');
    return st;
  };
  const out = { endTime: fill.endTime };
  // endTime 不变量：金标 20545@twoLines（每类目 2 行,18 类目=36 行）——实机语言包
  // 行数 Σn → endTime = 20545 + 55×(Σn−36)（textRoll totalTime=n*55-55 线性面）
  const linesByCat = {};
  segs.filter((s) => s.k === 'text').forEach((s) => {
    const c = s.text.replace(/\.\d+$/, '');
    linesByCat[c] = (linesByCat[c] ?? 0) + 1;
  });
  const sumN = Object.values(linesByCat).reduce((a, b) => a + b, 0);
  out.sumLines = sumN;
  out.expectedEnd = 20545 + 55 * (sumN - 36);
  out.endTimeOk = fill.endTime === out.expectedEnd;
  // F1：树段 seq 账面 72 进链（wait30 delay=72）+ hold 末帧
  out.treeWaitDelay = tree.acts.acts.find((a) => a.a === 'wait' && a.d === 30).delay;
  out.treeGrowingIdx = ov.seqFrameIndex(evalAt(tree, 20).seq, 20);
  out.treeHoldIdx = ov.seqFrameIndex(evalAt(tree, 200).seq, 200);
  // F2②：门板循环相位锚段首（local=770 → idx 2,旧公式=0）
  out.doorIdx770 = ov.seqFrameIndex(evalAt(door, 770).seq, 770);
  out.doorIdx772 = ov.seqFrameIndex(evalAt(door, 772).seq, 772);
  out.doorWin = door.acts.time;                       // 830（F5①）
  // F2①③：箱盖覆写链 seq1 hold → seq2 循环 → SetFrame → seq3 hold 钳末帧
  out.chest = [10, 25, 160, 250, 400].map((L) => {
    const st = evalAt(chest, L);
    if (st.seq) return { L, src: 'seq', f: st.seq.frames[ov.seqFrameIndex(st.seq, L)] };
    return { L, src: st.frame ? 'frame' : 'none', f: st.frame };
  });
  // F5：dry 硬切 690 / tav 987 原地 / NPC_550 跃走段 / item6
  const dry = segs.find((s) => s.k === 'npc' && s.type === 550 && s.t === bgBye.t);
  const tav = segs.find((s) => s.k === 'npc' && s.type === 20 && s.t === bgBye.t);
  out.dryWin = [690, 691].map((k) => ov.inSegWindow(dry, bgBye.t + k));
  out.tavTime = tav.acts.time;
  out.tavDx700 = Math.round(evalAt(tav, 700).dx * 100) / 100;
  out.jumperT = jumper.t - bgBye.t;
  out.jumperWin = jumper.acts.time;
  out.item6 = !!segs.find((s) => s.k === 'emote' && s.id === 10 && s.t === bgBye.t + 770);
  // F6：663 blink 域
  const p663 = segs.find((s) => s.k === 'npc' && s.type === 663 && s.t >= princessBg.t && s.t <= princessBg.t + 800);
  const blink = p663.acts.acts.find((a) => a.a === 'blink');
  out.blink = {
    d: blink?.d, delay: blink?.delay,
    active: blink ? evalAt(p663, blink.delay + 30).blink : null,
    gone: blink ? evalAt(p663, blink.delay + 181).blink : null,
    rowExpect: 20,
  };
  out.sceneT = {
    bye: bgBye.t, tree: tree.t, chest: chest.t, princess: princessBg.t,
  };
  // 触发演出（真实 canPlay 面）+ 离屏像素证据
  const cr = await import('/src/world/CreditsRoll.ts');
  cr.creditsRoll.tryStarting(fill.endTime);
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1;
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 800;
  const ctx = cv.getContext('2d');
  window.__c6ctx = ctx; window.__c6inst = inst; window.__c6ov = ov;
  const drawOnce = async (t) => {
    inst.t = t;
    ctx.clearRect(0, 0, 1280, 800);
    ov.drawCreditsRollSky(ctx, 1280, 800, 1);
    await new Promise((r) => setTimeout(r, 350));   // loadSheet 异步落地
    ov.drawCreditsRollSky(ctx, 1280, 800, 1);
  };
  const bandLit = (x0, y0, w, h) => {
    const d = ctx.getImageData(x0, y0, w, h).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 10) lit++;
    return lit;
  };
  // 树 hold 帧（local=300 → (0,8) 全树,opacity 1）
  await drawOnce(tree.t + 300);
  out.treeHoldLit = bandLit(Math.round(640 + tree.dx) - 50, Math.round(400 + tree.dy) - 80, 100, 80);
  // 跃走段悬空帧（bgBye+730 → local=40,重力位移(−8,−14),opacity≈0.53）
  await drawOnce(bgBye.t + 730);
  out.jumperLit = bandLit(Math.round(640 + jumper.dx) - 40, Math.round(400 + jumper.dy) - 100, 80, 100);
  // 箱盖 hold 帧（local=300 → (0,13)）
  await drawOnce(chest.t + 300);
  out.chestHoldLit = bandLit(Math.round(640 + chest.dx) - 40, Math.round(400 + chest.dy) - 60, 80, 60);
  return out;
});

// ② 实拍六帧（inst.t 钉针防 Game tick 漂移;整页=Renderer 世界画布内嵌演出）
async function shoot(label, t) {
  await page.evaluate(async (tt) => {
    const inst = window.__c6inst;
    if (window.__c6Pin) clearInterval(window.__c6Pin);
    window.__c6Pin = setInterval(() => { inst.t = tt; }, 16);
  }, t);
  await sleep(600);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  await page.evaluate(() => { clearInterval(window.__c6Pin); window.__c6Pin = null; });
}
await shoot('c6-tree-growing', A.sceneT.tree + 20);
await shoot('c6-tree-hold', A.sceneT.tree + 300);
await shoot('c6-chest-open', A.sceneT.chest + 10);
await shoot('c6-chest-hold', A.sceneT.chest + 300);
await shoot('c6-jumper-airborne', A.sceneT.bye + 730);
await shoot('c6-blink-princess', A.sceneT.princess + A.blink.delay + 30);

const ok = A.endTimeOk && A.treeWaitDelay === 72 && A.treeHoldIdx === 8 && A.treeGrowingIdx === 2
  && A.doorIdx770 === 2 && A.doorWin === 830
  && JSON.stringify(A.chest) === JSON.stringify([
    { L: 10, src: 'seq', f: [0, 3] }, { L: 25, src: 'seq', f: [0, 6] },
    { L: 160, src: 'frame', f: [0, 5] }, { L: 250, src: 'seq', f: [0, 11] },
    { L: 400, src: 'seq', f: [0, 13] }])
  && A.dryWin[0] === true && A.dryWin[1] === false && A.tavTime === 987 && A.tavDx700 === -150
  && A.jumperT === 690 && A.jumperWin === 80 && A.item6
  && A.blink.d === 180 && A.blink.active === true && A.blink.gone === false
  && A.treeHoldLit > 0 && A.jumperLit > 0 && A.chestHoldLit > 0;
console.log(JSON.stringify({ ok, ...A, shots: ['c6-tree-growing', 'c6-tree-hold', 'c6-chest-open', 'c6-chest-hold', 'c6-jumper-airborne', 'c6-blink-princess'], errs: errs.slice(0, 5) }, null, 1));
await browser.close();
process.exit(ok ? 0 : 1);
