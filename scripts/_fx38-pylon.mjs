// SW-FX38 探针（2026-09-15 用户实报晶塔双缺陷修复面）：
//   ① 晶塔悬浮水晶层缺绘（TileDrawing.DrawTeleportationPylons TileDrawing.cs:8806-8888）
//      —— 断言 Extra_181 水晶层出现（像素增量 vs 无塔基线）、塔型配色（纯净=绿）、
//         动画（浮动脉冲 → 双采样差 > 基座静态差）、摘塔即消失（因果闭环）
//   ② 传送缺光效与音效（Main.TeleportEffect case 9 :13544-13557）
//      —— 断言尘 43 双位 100×2 入原版尘池 + Item_6 Entry/Exit 双播且旧位声不被
//         Sfx.ATTEN(2500px) 吃掉（o 结局码 ≠ 'att'；旧刀只播目的塔=跨图恒静默根因）
//      —— 触发链：stub 门禁/落位后走 tryPylonMapTeleport 真路径 → pylonTeleportFx 必达
// 跑法：SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_fx38-pylon.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 200)); });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI,
  { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const fails = [];
const chk = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  | ' + detail : ''}`);
  if (!ok) fails.push(name);
};
const isCrG = (c) => c.g > c.r + 15 && c.g > c.b + 15;   // 水晶绿调判别（同页内 sample）

// ---- 场景 A：水晶层绘制/动画/摘塔消失 ----
const sceneA = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = (n) => new Promise((res) => { const s = () => { if (--n <= 0) res(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
  const g = window.__swGame, p = g.player, st = g.world.store, cam = g.camera;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const pylon = TILE_BY_KEY['v_597_pylons'];
  // 玩家脚下清平台（晶塔在玩家左侧 4 格,自然在屏内——相机恒跟随玩家,免挪相机）
  const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
  for (let x = px - 12; x <= px + 12; x++) {
    for (let y = py - 8; y <= py + 2; y++) st.setTile(x, y, 0);
    st.setTile(x, py + 3, TILE_BY_KEY['stone']);
  }
  // 晶塔 3×4（style 0 纯净）：锚格 (px-6, py-1) → 底行贴 py+2 上沿（先定基线再放）
  const ax = px - 6, ay = py - 1;
  p.x = (px + 1) * 16; p.y = (py + 1) * 16 - p.h; p.vx = 0; p.vy = 0;
  await raf(30); await wait(400);

  const cv = g.renderer.canvas;
  const scale = cv.width / cv.clientWidth;
  const g2d = cv.getContext('2d');
  // 水晶域 = 锚点 ToWorldCoordinates(24,64)+(0,-40)（DrawTeleportationPylons :8821-8823）
  const cxW = ax * 16 + 24, cyW = ay * 16 + 24;      // 晶心（含 ±4 浮动）
  const rectOf = (wx, wy, w, h) => {
    const [sx, sy] = cam.worldToScreen(wx, wy);
    return {
      x: Math.round(sx * scale - w * scale / 2), y: Math.round(sy * scale - h * scale / 2),
      w: Math.round(w * scale), h: Math.round(h * scale),
    };
  };
  const sample = (r) => {
    const d = g2d.getImageData(Math.max(0, r.x), Math.max(0, r.y), r.w, r.h).data;
    let green = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
      if (A > 0 && (R + G + B) > 60) lit++;
      if (G > R + 15 && G > B + 15) green++;       // 纯净塔水晶绿调（配色表 [0.05,0.8,0.3] 族）
    }
    return { lit, green, total: d.length / 4 };
  };
  const rect = rectOf(cxW, cyW, 30, 46);
  // 基线 = 放塔前同域采样（草地面也是绿调,断言须走基线相对差）
  const baseline = sample(rect);
  // 控制域 = 基座中段（水晶之下,静态烘焙区）
  const baseRect = rectOf(ax * 16 + 24, ay * 16 + 54, 30, 24);
  // 放塔（清区后才放——基线已取）
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(ax + dx, ay + dy, pylon, dx * 18, dy * 18);
  g.refreshPylons();
  const pylons = g.renderer.pylons.length;
  await raf(30); await wait(400);
  const placed = sample(rect);
  const placedBase = sample(baseRect);
  // 像素差比较器
  const diffOf = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; } return n; };
  // 动画：间隔 700ms 双采样（8 相位帧 500ms/相 + 浮动 ±4px/5s）
  const s1 = g2d.getImageData(rect.x, rect.y, rect.w, rect.h).data;
  await wait(700);
  const s2 = g2d.getImageData(rect.x, rect.y, rect.w, rect.h).data;
  const animDiff = diffOf(s1, s2);
  const baseS1 = g2d.getImageData(baseRect.x, baseRect.y, baseRect.w, baseRect.h).data;
  await wait(60);
  const baseS2 = g2d.getImageData(baseRect.x, baseRect.y, baseRect.w, baseRect.h).data;
  const baseDiff = diffOf(baseS1, baseS2);
  // ★A6 层序（用户明令：水晶不得画在角色上方）：玩家站塔柱格=身体与水晶下半重叠
  //   → 玩家身位两采样点（身体中心/头部）必须非水晶绿调（水晶若压角色,晶心不透明
   //   绿会盖住两点）
  const homeX = p.x, homeY = p.y;
  p.x = ax * 16 + 24 - p.w / 2; p.y = (py + 3) * 16 - p.h; p.vx = 0; p.vy = 0;
  await raf(12); await wait(120);
  const pxOf = (wx, wy) => {
    const [sx, sy] = cam.worldToScreen(wx, wy);
    const d = g2d.getImageData(Math.round(sx * scale), Math.round(sy * scale), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  };
  const bodyPix = pxOf(p.x + p.w / 2, p.y + p.h * 0.55);
  const headPix = pxOf(p.x + p.w / 2, p.y + 6);
  const isCrystalGreen = (c) => c.g > c.r + 15 && c.g > c.b + 15;
  p.x = homeX; p.y = homeY; p.vx = 0; p.vy = 0;
  await raf(6); await wait(100);
  // 摘塔 → 水晶层须消失（回归 ≈ 基线）
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(ax + dx, ay + dy, 0);
  g.refreshPylons();
  await raf(20); await wait(300);
  const removed = sample(rect);
  return {
    baseline, placed, removed, animDiff, baseDiff, pylons, placedBase,
    bodyPix, headPix,
    greenDelta: placed.green - baseline.green,
    removedDelta: removed.green - baseline.green,
  };
});
chk('A1 塔表已建（renderer.pylons=1）', sceneA.pylons === 1, `pylons=${sceneA.pylons}`);
chk('A2 水晶点亮域（放塔后亮像素非空）', sceneA.placed.lit > 40, `lit=${sceneA.placed.lit}/${sceneA.placed.total}`);
chk('A3 水晶绿调增量（纯净塔配色 vs 背景草地基线）', sceneA.greenDelta > 20,
  `green placed=${sceneA.placed.green} baseline=${sceneA.baseline.green} Δ=${sceneA.greenDelta}`);
chk('A4 水晶动画（双采样差>基座静态差）', sceneA.animDiff > sceneA.baseDiff && sceneA.animDiff > 4,
  `anim=${sceneA.animDiff} base=${sceneA.baseDiff}`);
chk('A5 摘塔回归基线（因果闭环）', Math.abs(sceneA.removedDelta) < Math.max(10, sceneA.greenDelta * 0.4),
  `removed Δ=${sceneA.removedDelta} vs placed Δ=${sceneA.greenDelta}`);
chk('A6 层序：水晶在角色之下（玩家身位非水晶绿）',
  !isCrG(sceneA.bodyPix) && !isCrG(sceneA.headPix),
  `body=${JSON.stringify(sceneA.bodyPix)} head=${JSON.stringify(sceneA.headPix)}`);

// ---- 场景 B：连续 3 次传送稳定性（FX38b 复测面：首次有/后续无 双根因排除）----
//   尘池面：每次 spawn 全量 200 零 null（游标漂移判例 dust-pool-gate-cursor-drift 排查）
//   音效面：每次 Item_6 ×2 且结局码非 att/mut（R26 槽 stop-then-play 反噬排查）
//   光效面：每次落位帧后活性尘 ≥40（Exit 批挂落位帧=相机窗内,照度门不清杀）
const sceneB = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame, p = g.player;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const pylon = TILE_BY_KEY['v_597_pylons'];
  // 建两座不同型晶塔（同型全图唯一,直写 tile 绕放置门）：A=style0 玩家西侧、
  // B=style6 玩家东侧 220 格（远超 Sfx.ATTEN 2500px 的传送域,还原真实跨图路径）。
  // 两处同规格清区+地板=teleportNear 必落位。落位后相机跟玩家=arrival 批在窗内。
  const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
  const siteA = { ax: px - 6, ay: py - 1, type: 0 };
  const siteB = { ax: px + 220, ay: py - 1, type: 6 };
  for (const site of [siteA, siteB]) {
    const cx = site.ax + 1;
    for (let x = cx - 12; x <= cx + 12; x++) {
      for (let y = py - 8; y <= py + 2; y++) st.setTile(x, y, 0);
      st.setTile(x, py + 3, TILE_BY_KEY['stone']);
    }
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) {
      st.setTile(site.ax + dx, site.ay + dy, pylon, site.type * 54 + dx * 18, dy * 18);
    }
  }
  g.refreshPylons();
  // 音效捕获面：Sfx.onEvent（触发面结局码,含 o 结局与坐标）
  const { Sfx } = await import('/src/core/Sfx.ts');
  const wavEvents = [];
  const prevOnEvent = Sfx.onEvent;
  Sfx.onEvent = (k, d) => { if (k === 'wav') wavEvents.push(d); };
  // 尘面：spawn 影子计数（入池量/池满 null）+ type43 活性尘计数
  const dust43 = () => (g.vanillaDust?.pool ?? []).filter((d) => d.active && d.type === 43).length;
  let spawnOk = 0, spawnNull = 0;
  const origSpawnDust = g.spawnDust.bind(g);
  g.spawnDust = (...args) => {
    const d = origSpawnDust(...args);
    if (d) spawnOk++; else spawnNull++;
    return d;
  };
  // 门禁/命中 stub（门禁五连是 SW-BD1 已验面,此处只验 fx 稳定性）;teleportWhenReady 走真链
  g.pylonIconHitTest = () => g.__fx38Target;
  g.pylonGateCheck = () => ({ ok: true, fail: null });
  const rounds = [];
  const targets = [siteB, siteA, siteB];   // B→A→B 三连传（每次都跨图）
  for (let r = 0; r < targets.length; r++) {
    const t = targets[r];
    g.__fx38Target = { x: t.ax, y: t.ay, type: t.type };
    wavEvents.length = 0; spawnOk = 0; spawnNull = 0;
    const fromTx = Math.floor(p.x / 16);
    const clickOk = g.tryPylonMapTeleport(10, 10);
    // 轮询落位（首访目标区有贴图预载延迟;落位=player tile 变化,尘 43 寿命仅
    // ~0.4s,采样必须在落位后立即取,不能按定长等待）
    let arrived = false;
    for (let i = 0; i < 60 && !arrived; i++) {
      await wait(50);
      arrived = Math.abs(Math.floor(p.x / 16) - fromTx) > 8;
    }
    await wait(150);                        // 落位帧尘批入池后取样（寿命内）
    const aliveAfter = dust43();
    const at = Math.floor(p.x / 16);
    rounds.push({
      clickOk,
      arrivedNear: Math.abs(at - (t.ax + 1)) <= 24,   // 落位在塔区附近(teleportNear 允许就近)
      spawned: spawnOk, nulled: spawnNull,
      arrived,
      aliveAfter,
      wav: wavEvents.filter((e) => e.f === 'Item_6').map((e) => ({ o: e.o, x: Math.round(e.x) })),
    });
    await wait(600);                        // 尘自然衰尽,隔离下一轮
  }
  Sfx.onEvent = prevOnEvent;
  g.spawnDust = origSpawnDust;
  return { rounds };
});
for (let r = 0; r < sceneB.rounds.length; r++) {
  const rd = sceneB.rounds[r];
  chk(`B${r + 1}.a 第${r + 1}传 触发链消费`, rd.clickOk === true, `clickOk=${rd.clickOk}`);
  chk(`B${r + 1}.b 第${r + 1}传 落位`, rd.arrivedNear, `playerTileX≈${JSON.stringify(rd)}`);
  chk(`B${r + 1}.c 第${r + 1}传 尘全量 spawn 零 null（尘池游标漂移排除）`,
    rd.spawned === 200 && rd.nulled === 0, `spawned=${rd.spawned} nulled=${rd.nulled}`);
  chk(`B${r + 1}.d 第${r + 1}传 Item_6 双声且可闻（o 非 att/mut——槽反噬排除）`,
    rd.wav.length === 2 && rd.wav.every((e) => e.o && e.o !== 'att' && e.o !== 'mut'),
    `wav=${JSON.stringify(rd.wav)}`);
  chk(`B${r + 1}.e 第${r + 1}传 落位帧活性尘（光效可见,照度门幸存）`,
    rd.aliveAfter >= 40, `alive43=${rd.aliveAfter}`);
}

// ---- 截图（先关欢迎弹窗——盖世界画面；放大 2× 让水晶清晰） ----
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('我已知晓'));
  if (btn) btn.click();
});
await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const pylon = TILE_BY_KEY['v_597_pylons'];
  g.camera.zoom = 2; g.camera.zoomTarget = 2;   // 2× 取景（水晶 30×46 → 60×92 css）
  const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
  const ax = px - 6, ay = py - 1;
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(ax + dx, ay + dy, pylon, dx * 18, dy * 18);
  g.refreshPylons();
  g.pylonTeleportFxOrigin(0);                     // 传送光效同框（FX38b:Entry 半,尘 43）
  await wait(150);                                // 尘 43 寿命 ~0.4s,取样在生命周期内
  g.pylonTeleportFxArrival(0);
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/fx40-pylon-crystal.png' });
const clipA = await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
  const rc = cv.getBoundingClientRect();
  const ax = Math.floor(g.player.x / 16) - 6, ay = Math.floor((g.player.y + g.player.h) / 16) - 1;
  const [sx, sy] = cam.worldToScreen(ax * 16 + 24, ay * 16 + 40);   // 塔锚中上（水晶+基座）
  const R = 90;
  return { x: Math.max(0, Math.round(rc.left + sx - R)),
    y: Math.max(0, Math.round(rc.top + sy - R)), width: R * 2, height: R * 2 };
});
await page.screenshot({ path: '/tmp/fx40-pylon-tp.png', clip: clipA });
console.log('PAGES', JSON.stringify({ errs: errs.slice(0, 5) }));
console.log(fails.length ? `FX38 RESULT: ${fails.length} FAIL` : 'FX38 RESULT: ALL PASS');
browser.close().catch(() => {});
process.exit(fails.length ? 1 : 0);
