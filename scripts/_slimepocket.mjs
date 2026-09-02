// 丛林史莱姆水囊卡死复现（2026-09-02 用户实报 害兽姐妹会）
// ① dump 存档实况地形+液体（水囊 3094,244 周边）② 生成丛林史莱姆(vanilla -10)
// 逐 tick 采样 1200t，抓上下循环
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-害兽姐妹会.json';
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
  const st = g.world.store;

  // ---- 地形+液体 dump（含水） ----
  const grid = [];
  for (let y = 236; y <= 254; y++) {
    let row = '';
    for (let x = 3086; x <= 3102; x++) {
      const i = st.idx(x, y);
      const t = st.type[i], sl = st.slope[i], hf = st.half[i], lq = st.liquid[i], lt = st.liquidType[i];
      let ch = ' ';
      if (t !== 0) {
        if (st.isPlatform(x, y)) ch = 'P';
        else if (hf) ch = 'h';
        else if (sl) ch = String(sl);
        else if (t === 59) ch = 'm';
        else if (t === 309) ch = 'G';
        else ch = '#';
      } else if (lq > 0) ch = lt === 1 ? '~' : (lt === 2 ? 'L' : '?');
      else if (st.wall[i]) ch = ',';
      row += ch;
    }
    grid.push(y + ' ' + row);
  }
  // 水囊格实况
  const pocket = {};
  for (let y = 242; y <= 247; y++) for (let x = 3092; x <= 3096; x++) {
    const i = st.idx(x, y);
    pocket[x + ',' + y] = [st.type[i], st.liquid[i], st.liquidType[i]];
  }

  // ---- 生成丛林史莱姆（NET_ID_MAP: base=绿史莱姆1 ×scale1.1 → 盒 26×20，同 spawner :568 换算）----
  const spawned = await window.__swFlow.spawnVanillaEnemy(1, 3094.5 * 16, 244.5 * 16);
  const slime = g.enemies().find((e) => e.vanillaId === 1);
  if (!slime) return { grid, pocket, spawned, err: 'spawn failed' };
  slime.w = slime.def.width = 26;             // netIdSpawnScale(24×18, 1.1) ≈ 26×20
  slime.h = slime.def.height = 20;
  slime.vanillaNetId = -10;
  const dims = { w: slime.w, h: slime.h, hp: slime.hp, vanillaId: slime.vanillaId };

  const snap = (n) => ({
    t: g.tickCount, x: +n.x.toFixed(1), y: +n.y.toFixed(1),
    vx: +n.vx.toFixed(2), vy: +n.vy.toFixed(2),
    g: n.onGround ? 1 : 0, hw: n.hitWall ? 1 : 0, hh: n.hitHead ? 1 : 0,
    eT: n.embedTicks | 0, eP: n.embedPushed | 0, wet: n.wet ? 1 : 0,
    cx: +n.cx.toFixed(1), cy: +n.cy.toFixed(1),
  });
  const trace = [];
  for (let i = 0; i < 1200; i++) {
    g.fixedUpdate(1 / 60);
    // 探针伪影中和：出生拍 despawn 误杀(runDespawnFx)后 compact 摘桶 → 复活并塞回,
    // 保证 AI/物理每 tick 照常跑（消散系统本体不受影响）
    if (slime.dead) { slime.dead = false; slime.despawnTimer = 750; }
    if (!g.enemies().includes(slime)) g.entities.enemies.push(slime);
    trace.push(snap(slime));
  }

  // 环检测: cy 峰谷序列
  let loops = 0;
  for (let i = 2; i < trace.length; i++) {
    const a = trace[i - 2].y, b = trace[i - 1].y, c = trace[i].y;
    if (b < a && b < c) loops++;
  }
  return { grid, pocket, dims, spawned, loops, trace: trace.slice(0, 400), tail: trace.slice(-10), dbg: window.__swPhysDbg };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
