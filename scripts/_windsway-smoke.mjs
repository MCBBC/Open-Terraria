// 风摆动系统冒烟（scripts/_windsway-smoke.mjs）：
//   1. 摆动图块可见性：烘焙摘除后草/植物仍在屏上（静态帧存在）
//   2. 高风时摆动：连续帧 hash 变化（逐帧偏移+旋转）
//   3. 无风门：风速归零后帧间稳定
//   4. 玩家扰动：跑过草丛触发 WindGrid 脉冲
//   5. 树冠摆动：树冠区域像素随帧变化
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('风摆测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
// 用已有世界（如有）否则新建
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const res = {};

  // 找地表：从出生点向上扫到天空，再往下找草面
  const { floor } = Math;
  let groundY = -1;
  for (let y = 10; y < g.world.h - 10; y++) {
    const i = st.idx(g.world.spawnX, y);
    if (st.flags[i] && st.type[i] !== 0) { groundY = y; break; }
  }
  res.groundY = groundY;

  // 附近找 v_3（sheet 3 植物）格：地表 ±60 行 × ±80 列扫描
  let grassX = -1, grassY = -1;
  outer:
  for (let dy = -8; dy <= 4; dy++) {
    for (let dx = -80; dx <= 80; dx++) {
      const x = g.world.spawnX + dx, y = groundY + dy;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      const t = st.type[i];
      const def = TILE_DEFS[t];
      if (def && def.vanilla && def.vanilla.sheet === 3 && st.flags[i]) { grassX = x; grassY = y; break outer; }
    }
  }
  res.grass = [grassX, grassY];

  // 树冠标记帧搜索（提前——草缺失时以树冠代位采样）
  let treeX = -1, treeY = -1;
  outer2:
  for (let dx = -120; dx <= 120; dx++) {
    for (let dy = -30; dy <= 2; dy++) {
      const x = g.world.spawnX + dx, y = groundY + dy;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      const def = TILE_DEFS[st.type[i]];
      if (def && def.vanilla && def.vanilla.sheet === 5 && st.frameY[i] >= 198) { treeX = x; treeY = y; break outer2; }
    }
  }
  res.tree = [treeX, treeY];
  if (grassX < 0 && treeX >= 0) { grassX = treeX; grassY = treeY - 2; res.sampleTarget = 'treeCrown'; }

  // 玩家停在草左 6 格（采样区不含玩家精灵；相机跟随玩家→草在屏上固定偏移）
  const park = () => { p.x = (grassX - 6) * 16; p.y = (groundY - 2) * 16; p.vx = 0; p.vy = 0; };
  park();
  await new Promise(r => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const crownTarget = res.sampleTarget === 'treeCrown';
  const SW = crownTarget ? 72 : 24; // 树冠代位时大窗（慢速摆动+天空背景）
  const sampleHash = () => {
    const ctx = canvas.getContext('2d');
    // 草所在屏幕位置附近的 SW×SW 区域
    const sx = Math.round(canvas.width / 2 + (grassX * 16 + 8 - g.camera.x) * g.camera.zoom);
    const sy = Math.round(canvas.height / 2 + (grassY * 16 + 8 - g.camera.y) * g.camera.zoom);
    if (sx < SW / 2 + 2 || sy < SW / 2 + 2 || sx + SW / 2 > canvas.width || sy + SW / 2 > canvas.height) return null;
    const d = ctx.getImageData(sx - SW / 2, sy - SW / 2, SW, SW).data;
    let h = 0;
    for (let k = 0; k < d.length; k += 16) h = (h * 31 + d[k]) | 0;
    return { h, sx, sy };
  };

  // 1. 静态可见性：草应被画出（区域非纯背景）
  const s0 = sampleHash();
  res.samplePos = s0 && [s0.sx, s0.sy];
  // 取整个 64×64 的非透明/非黑像素数作为"有东西"证据
  const ctx = canvas.getContext('2d');
  if (s0) {
    const d = ctx.getImageData(s0.sx - SW / 2, s0.sy - SW / 2, SW, SW).data;
    let lit = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 60) lit++;
    res.staticLitPxNarrow = lit;
    res.staticLitPx = lit;
  }

  // 变化率采样器：n 次 ×80ms
  const ratio = async (n) => {
    const hs = [];
    for (let i = 0; i < n; i++) { hs.push(sampleHash()?.h ?? 'null'); await new Promise(r => setTimeout(r, 80)); }
    return new Set(hs).size / n;
  };

  // 2. 无风：变化率应低（getWindCycle 门 <0.08 恒 0；偶发粒子稀疏）
  g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0;
  await new Promise(r => setTimeout(r, 300));
  res.calmRatio = await ratio(12);

  // 3. 高风：连续摆动 → 变化率高且显著高于无风
  g.world.weather.windSpeedCurrent = 0.8; g.world.weather.windSpeedTarget = 0.8;
  await new Promise(r => setTimeout(r, 200));
  res.windyRatio = await ratio(12);
  res.windyMoves = res.windyRatio > 0.5 && res.windyRatio > res.calmRatio * 1.5;

  // 4. 玩家扰动：从草旁跑过（wind=0，只有 WindGrid push 生效）
  g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0;
  await new Promise(r => setTimeout(r, 250));
  p.x = (grassX - 6) * 16; p.vx = 4;
  const pushHashes = [];
  p.vx = 4; // 从草左侧跑向草（扰动 + 玩家短暂入画）
  for (let i = 0; i < 8; i++) {
    pushHashes.push(sampleHash()?.h ?? 'null');
    await new Promise(r => setTimeout(r, 80));
  }
  p.vx = 0;
  res.pushDistinct = new Set(pushHashes).size;

  // 5. 树冠摆动
  if (treeX >= 0) {
    g.world.weather.windSpeedCurrent = 0.8; g.world.weather.windSpeedTarget = 0.8;
    p.x = (treeX - 6) * 16; p.y = (groundY - 2) * 16; p.vx = 0; p.vy = 0;
    await new Promise(r => setTimeout(r, 400));
    const treeHash = () => {
      const c = canvas.getContext('2d');
      const sx = Math.round(canvas.width / 2 + (treeX * 16 + 8 - g.camera.x) * g.camera.zoom);
      const sy = Math.round(canvas.height / 2 + (treeY * 16 + 40 - g.camera.y) * g.camera.zoom);
      if (sx < 40 || sy < 40 || sx + 80 > canvas.width || sy + 80 > canvas.height) return null;
      const d = c.getImageData(sx - 40, sy - 40, 80, 80).data;
      let h = 0;
      for (let k = 0; k < d.length; k += 16) h = (h * 31 + d[k]) | 0;
      return h;
    };
    const th = [];
    for (let i = 0; i < 6; i++) { th.push(treeHash()); await new Promise(r => setTimeout(r, 100)); }
    res.treeHashes = th;
    res.treeMoves = new Set(th).size >= 3;
  }

  // 6. 设置门：语义级验证（注意 HMR 双实例——并行编辑期 import 可能拿到新实例，
  //    与 app 内 WindSway 持有的 Options 不同步；gate 语义以单测为准，此处仅参考）
  try {
    const { options: opts } = await import('/src/core/Options.ts');
    const ws = await import('/src/render/WindSway.ts');
    opts.data.swayInWind = false;
    ws.windSway.update(0.8, null, 8, 8);
    res.gateOffWind = ws.windSway.wind;
    opts.data.swayInWind = true;
  } catch (e) { res.gateErr = String(e); }

  // 6.5 落叶：高风下树冠区数秒内喷出落叶（EmitTreeLeaves 频率门 + 粒子上限）
  const np = window.__swNatureParticles ?? (await import('/src/render/NatureParticles.ts')).natureParticles; // app 实例优先（HMR 双实例防误读）
  g.world.weather.windSpeedCurrent = 0.8; g.world.weather.windSpeedTarget = 0.8;
  p.x = (treeX - 6) * 16; p.y = (groundY - 2) * 16; p.vx = 0; p.vy = 0;
  if (treeX >= 0) {
    await new Promise(r => setTimeout(r, 400));
    np.clear();
    let peak = 0;
    const gores = new Set();
    for (let i = 0; i < 30; i++) {
      peak = Math.max(peak, np.leaves.length);
      for (const l of np.leaves) gores.add(l.gore);
      await new Promise(r => setTimeout(r, 100));
    }
    res.leafPeak = peak;
    res.leavesOk = peak > 0;
    res.leafGores = [...gores].sort((a, b) => a - b);
    // 合法叶色族：普通草 910-925（910 绿/911 雪/915 沙…）+ 装饰/宝石树 1248-1257
    //（樱花粉/黄柳黄/宝石彩）；1113-1121=中空树彩叶——普通树出这些即 bug 信号
    res.leafColorOk = res.leafGores.every((g) => (g >= 910 && g <= 925) || (g >= 1248 && g <= 1257));

    // 暂停门（_isActiveAndNotPaused）：paused 时不再喷新叶（已有叶冻结）
    np.clear();
    g.paused = true;
    await new Promise(r => setTimeout(r, 1200));
    res.pausedLeafCount = np.leaves.length;
    res.pauseGateOk = np.leaves.length === 0;
    g.paused = false;
  }

  // 7. 性能：草密集区逐帧动态绘制的帧间隔（p95 应 < 20ms）
  park();
  g.world.weather.windSpeedCurrent = 0.8; g.world.weather.windSpeedTarget = 0.8;
  await new Promise(r => setTimeout(r, 300));
  const frames = await new Promise((resolve) => {
    const ts = []; let last = 0;
    const loop = (t) => { if (last) ts.push(t - last); last = t; if (ts.length >= 180) resolve(ts); else requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const sorted = frames.slice().sort((a, b) => a - b);
  res.frameP50 = Math.round(sorted[Math.floor(sorted.length * 0.5)] * 10) / 10;
  res.frameP95 = Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10;

  return res;
});

// 落叶链路调试（叶色修复验证）：树标记 fx/fy、树底地面 tile、gore 选择
try {
  const dbg = await page.evaluate(async () => {
    const { TILE_DEFS } = await import('/src/data/tiles.ts');
    const vt = await import('/src/render/VanillaTiler.ts');
    const npMod = await import('/src/render/NatureParticles.ts');
    const ws = await import('/src/render/WindSway.ts');
    const g = window.__swGame, st = g.world.store;
    const markers = [];
    const px = g.player.cx / 16, py = g.player.cy / 16;
    for (let dy = -40; dy <= 4; dy++) for (let dx = -120; dx <= 120; dx++) {
      const x = Math.floor(px) + dx, y = Math.floor(py) + dy;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      const d = TILE_DEFS[st.type[i]];
      if (d?.vanilla?.sheet === 5 && st.frameY[i] >= 198) markers.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
    }
    if (!markers.length) return { markers: [] };
    const m = markers[0];
    const scan = vt.scanTreeType(st, m.x, m.y);
    const baseIdx = st.idx(m.x, scan.floorY);
    const baseTile = TILE_DEFS[st.type[baseIdx]];
    return {
      marker: m, markers: markers.length,
      scan,
      baseTile: { key: baseTile?.key, sheet: baseTile?.vanilla?.sheet },
      gore: npMod.getTreeLeaf(m.x, m.fx, m.fy, 5, baseTile?.vanilla?.sheet ?? -1),
      emits: true, active: ws.windSway.active, leafFreq: ws.windSway.leafFreq, paused: g.paused,
    };
  });
  console.log('LEAF-DBG', JSON.stringify(dbg));
} catch (e) { console.log('LEAF-DBG-ERR', String(e)); }
console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', JSON.stringify(errs));
await browser.close();
