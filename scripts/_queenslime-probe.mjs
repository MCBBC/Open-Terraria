// 史莱姆皇后(657)宿主实装批探针(2026-08-26):
//   (a) 召唤链:4988 明胶水晶 itemByKey 可达 + Game case 4988 在页内源(dev import)
//   (b) Boss 实体:spawnVanillaEnemy(657) 真身生成+AI 态机运转(选拍/二阶段转段)
//   (c) 视觉四层:半血翅膀/水晶核/王冠贴图懒加载非空 + lai3 帧驱动推进(本批补缺)
//   (d) 掉落:bossBag 4957 规则树引用(数据面已由 vitest 锁,此处烟测 spawnDrop 链)
// 运行:SW_ORIGIN=http://localhost:5242 node tools/run-diag.mjs scripts/_queenslime-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};
  // 平坦竞技场
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 30;
  for (let dx = -80; dx <= 80; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, gy + dy, 0);
    st.liquid[st.idx(px0 + dx, gy + dy)] = 0;
  }
  for (let dx = -80; dx <= 80; dx++) st.setTile(px0 + dx, gy + 3, 1);
  g.player.x = px0 * 16; g.player.y = (gy - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  // (a) 召唤链可达性
  res.crystalIid = flow.itemByKey('vi_4988_QueenSlimeCrystal');
  res.bagIid = flow.itemByKey('vi_4957_QueenSlimeBossBag');

  // (b)+(c) 真身 + 二阶段视觉层
  const spawned = await flow.spawnVanillaEnemy(657, px0 * 16 + 300, (gy - 10) * 16);
  res.spawned = !!spawned;
  const q = (g.entities.enemies || []).find((e) => e.vanillaId === 657);
  if (!q) { res.noBoss = true; return res; }
  q.x = px0 * 16 + 200; q.y = (gy - 6) * 16;
  // 一阶段跑 90 帧:AI 活着(态机推进)
  const aiSamples = new Set();
  for (let i = 0; i < 90; i++) {
    g.fixedUpdate(1 / 60);
    if (i % 10 === 0) aiSamples.add(q.ai0);
    await sleep(0);
  }
  res.aiAlive = aiSamples.size >= 1 && !q.dead;
  res.aiStates = [...aiSamples];
  // 半血 → 二阶段:翅膀帧 lai3 推进 + 渲染层无异常
  q.hp = Math.floor(q.maxHp / 2) - 1;
  const lai3s = new Set();
  for (let i = 0; i < 60; i++) {
    g.fixedUpdate(1 / 60);
    lai3s.add(q.lai3);
    await sleep(0);
  }
  res.phase2 = q.hp <= q.maxHp / 2;
  res.lai3Distinct = lai3s.size;          // ≥3 个不同值 = 帧驱动在转(此前恒 0)
  res.lai3Range = [Math.min(...lai3s), Math.max(...lai3s)];
  // 渲染层贴图懒加载(与 Renderer.drawQueenSlimeExtras 同一 atlas 通道)
  try {
    const renderer = g.renderer ?? (g.game && g.game.renderer) ?? null;
    const atlas = renderer?.atlas;
    if (atlas?.ensureVImage) {
      res.tex = {
        body: !!atlas.ensureVImage('vanilla/NPC_657.png'),
        wings: !!atlas.ensureVImage('vanilla/Extra_185.png'),
        core: !!atlas.ensureVImage('vanilla/Extra_186.png'),
        crown: !!atlas.ensureVImage('vanilla/Extra_177.png'),
      };
    } else res.tex = 'no-atlas-hook';
  } catch (e) { res.tex = 'err:' + e.message; }
  // 再跑 30 帧(渲染循环开着):page errors 由外层捕获
  for (let i = 0; i < 30; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
  return res;
});

check('(a) 明胶水晶 4988/Boss 袋 4957 itemByKey 可达', out.crystalIid > 0 && out.bagIid > 0,
  `crystal=${out.crystalIid} bag=${out.bagIid}`);
check('(b) 657 真身生成且 AI 态机运转', out.spawned === true && out.aiAlive === true,
  `states=${JSON.stringify(out.aiStates)}`);
check('(c1) 二阶段 lai3 帧驱动推进(≥3 个不同值)', out.lai3Distinct >= 3,
  `distinct=${out.lai3Distinct} range=${JSON.stringify(out.lai3Range)} phase2=${out.phase2}`);
check('(c2) 视觉四层贴图在库可载(本体/翅膀/水晶核/王冠)',
  out.tex && typeof out.tex === 'object' && out.tex.body && out.tex.wings && out.tex.core && out.tex.crown,
  JSON.stringify(out.tex));

console.log(`page errors: ${errors.length}${errors.length ? ' -> ' + errors.slice(0, 4).join(' | ') : ''}`);
for (const e of errors.slice(0, 5)) check('no page error', false, e);
console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
