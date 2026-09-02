// 圣骑士 290 AI 行为探针（AI_003_Fighters 射击族分支 NPC.cs:59659-60393）
// A) 有视线 <700px → 开瞄(ai2>0)+掷锤(弹 300)、vx 衰减定身（原版如此）
// B) 视线被墙挡 → 不开瞄、行走 vx≈±1 朝玩家
// C) 超开瞄包络出生(784px) → 行走逼近，入包络(≈691px=±40抖动+0.1|dx|下坠后矢量)
//    后转开瞄掷锤——演示原版「走→瞄」完整动态（射程门是抖动包络非裸 700px）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const g = window.__swGame;
  const st = g.world.store;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { canHit } = await import('/src/physics/LineOfSight.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tiles = await import('/src/data/tiles.ts');
  const dirt = tiles.TILE_BY_KEY['dirt'];

  const res = {};

  // 场地：出生点正下方找平地,清一块 60×20 工作区（y=地面行）
  const Y = Math.floor(g.world.groundLevel) + 2;
  const X0 = g.world.spawnX;
  for (let dy = -14; dy <= -1; dy++) {
    for (let dx = -35; dx <= 35; dx++) {
      if (st.inBounds(X0 + dx, Y + dy) && st.get(X0 + dx, Y + dy) !== 0) st.setTile(X0 + dx, Y + dy, 0, 0, 0);
    }
  }
  for (let dx = -35; dx <= 35; dx++) st.setTile(X0 + dx, Y, dirt, 0, 0);

  const p = g.player;
  p.debugGod = true;                       // 探针防死：圣锤 60×2 伤会杀 100hp 新号
  const groundYpx = Y * 16;
  const spawnPaladin = (px) => {
    const e = Enemy.fromVanilla(290, px, groundYpx - 62);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    e.hp = e.maxHp;
    return e;
  };
  const countHammer = () => {
    let n = 0;
    for (const pr of g.entities.projectiles) {
      if (!pr.dead && pr.projId === 300) n++;
    }
    return n;
  };
  const clearHammer = () => {
    g.entities.projectiles = g.entities.projectiles.filter((pr) => pr.projId !== 300);
  };
  const sample = (e) => ({ x: +e.cx.toFixed(1), y: +e.cy.toFixed(1), vx: +e.vx.toFixed(3), ai1: e.ai1, ai2: e.ai2, ai3: e.ai3, aiT: e.aiT, facing: e.facing, onGround: e.onGround, hitWall: e.hitWall, inList: g.entities.enemies.includes(e), dead: e.dead, paused: g.paused, vis: document.visibilityState, pdead: p.dead, php: p.hp, pdist: Math.hypot(p.cx - e.cx, p.cy - e.cy).toFixed(0) });

  // 玩家放场地左端站地
  p.x = (X0 - 20) * 16; p.y = groundYpx - p.h; p.vx = 0; p.vy = 0;

  // ---- A) 视线通 + 300px：期望开瞄掷锤、基本定身 ----
  {
    clearHammer();                       // 场景隔离：清上场景残留弹（活体计数差会被寿命稀释成负值）
    const e = spawnPaladin((X0 + 1) * 16 + 300 - 17);
    await sleep(300);
    const s0 = sample(e);
    let hammerMax = countHammer();
    const maxXmove = { fwd: 0, total: 0 };
    let el = 0;
    for (let i = 0; i < 60; i++) {
      const dt = i < 16 ? 60 : 150;              // 前 1s 逐 60ms 细采样看 ai1 步进
      el += dt;
      await sleep(dt);
      const s = sample(e);
      maxXmove.total = Math.max(maxXmove.total, Math.abs(s.x - s0.x));
      hammerMax = Math.max(hammerMax, countHammer());
      if (i < 16 || i % 10 === 0) (res.A_samples ??= []).push({ t: el, ...s, los: canHit(st, e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h), hammers: hammerMax });
    }
    res.A = { s0, total: maxXmove.total, hammers: hammerMax, aimTicks: e.ai2, cd: e.ai1 };
    // 直接出桶：置 dead 旗后尸体仍会吃一次 fixedUpdate（Entities.update 先遍历后
    // compact）→ 可在清桶后再掷一把幽灵锤污染下场景
    const arr = g.entities.enemies; arr.splice(arr.indexOf(e), 1);
  }

  // ---- B) 视线挡墙：3 宽×8 高墙隔开 → 期望不开瞄、行走 ----
  {
    // 墙在玩家右 6 格,高 8（挡住 62 高圣骑士的视线）
    for (let dy = -8; dy <= -1; dy++) for (let dx = 0; dx <= 2; dx++) st.setTile(X0 - 14 + dx, Y + dy, dirt, 0, 0);
    clearHammer();
    const e = spawnPaladin((X0 + 6) * 16);
    e.x = (X0 + 6) * 16; e.y = groundYpx - e.h; // 墙右 20 格
    await sleep(300);
    const s0 = sample(e);
    let hammerMax = countHammer();
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      const s = sample(e);
      hammerMax = Math.max(hammerMax, countHammer());
      if (i % 10 === 0) (res.B_samples ??= []).push({ t: i * 150, ...s, los: canHit(st, e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h), moved: +(s.x - s0.x).toFixed(1), hammers: hammerMax });
    }
    res.B = { s0, moved: +(sample(e).x - s0.x).toFixed(1), hammers: hammerMax };
    // 拆墙
    for (let dy = -8; dy <= -1; dy++) for (let dx = 0; dx <= 2; dx++) st.setTile(X0 - 14 + dx, Y + dy, 0, 0, 0);
    const arrB = g.entities.enemies; arrB.splice(arrB.indexOf(e), 1);
  }

  // ---- C) 距离 >700px 视线通：期望不开瞄、行走 ----
  {
    p.x = (X0 - 20) * 16; p.y = groundYpx - p.h; p.vx = 0; p.vy = 0;
    // 出生点改带内（清整区 X0±35）：X0+29 距玩家 49 tile=784px——须超出【抖动外扩
    // 包络】（开瞄门=±40 抖动+0.1|dx| 下坠后的矢量长,720px 处 min=sqrt(680²+122²)
    // ≈691<700 仍可开瞄=原版本相,784px 处 min≈744>700 恒不走瞄）
    const e = spawnPaladin((X0 + 29) * 16);
    await sleep(300);
    const s0 = sample(e);
    const los0 = canHit(st, e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h);
    let hammerMax = countHammer();
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      const s = sample(e);
      hammerMax = Math.max(hammerMax, countHammer());
      if (i % 10 === 0) (res.C_samples ??= []).push({ t: i * 150, ...s, dist: Math.hypot(p.cx - e.cx, p.cy - e.cy).toFixed(0), los: canHit(st, e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h), moved: +(s.x - s0.x).toFixed(1), hammers: hammerMax });
    }
    // 场景完好性护栏：LOS 通（清整带内无地形遮挡）+ 未被顶出出生位姿
    res.C = { s0, moved: +(sample(e).x - s0.x).toFixed(1), hammers: hammerMax, sceneLosOk: los0 };
    const arrC = g.entities.enemies; arrC.splice(arrC.indexOf(e), 1);
  }

  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
