// BJ65 热扭曲顶缘横线伪影探针（沙漠地表白天 heat ON vs 森林地表 heat OFF）。
// 断言=目标态（修复后应全绿）：
//   A. heat 斜坡满（Visible+Opacity>0.95+I>0.3）——前提门
//   B. ON 顶行连续（dTop≈dBase 且 顶行≠底行）——修前此处红=伪影指纹
//   C. OFF 顶行连续——对照组
//   D. 内部扭曲仍活（ON 纹理带自差分 ≫ OFF 底噪）——修复不得杀死效果本体
// 指纹：dTop=顶行vs次行差、dBase=次行vs第3行差、wrapMin=min(顶行vs底部1-4行差)
//   伪影成立 ⟺ dTop>12 ∧ dTop>3·max(1,dBase) ∧ wrapMin<dTop/2
//   （沙大地表：顶行应=蓝天；伪影时顶行=屏幕底行地下物→与次行高断裂、与底行低差）
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger, saveCanvasShot, resolveShotPath } from '../tools/probe/lib/index.mjs';

const L = ledger();

async function grabMetrics(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const d = ctx.getImageData(0, 0, w, h).data;
    const x0 = Math.floor(w * 0.55), x1 = Math.floor(w * 0.97);
    const rowDiff = (ya, yb) => {
      let s = 0;
      for (let x = x0; x < x1; x++) {
        const ia = (ya * w + x) * 4, ib = (yb * w + x) * 4;
        s += Math.abs(d[ia] - d[ib]) + Math.abs(d[ia + 1] - d[ib + 1]) + Math.abs(d[ia + 2] - d[ib + 2]);
      }
      return s / (x1 - x0) / 3;
    };
    const wraps = [];
    for (let k = 1; k <= 4; k++) wraps.push(rowDiff(0, h - k));
    const sfx = g.renderer.screenFx;
    return {
      w, h,
      dTop: +rowDiff(0, 1).toFixed(2),
      dBase: +rowDiff(1, 2).toFixed(2),
      wrapMin: +Math.min(...wraps).toFixed(2),
      glsfx: sfx ? { dead: !!sfx.diedAt, unavail: !!sfx.unavailable } : 'absent',
    };
  });
}

async function grabRaw(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const ctx = cv.getContext('2d');
    return Array.from(ctx.getImageData(0, 0, cv.width, cv.height).data);
  });
}

async function heatState(page) {
  return page.evaluate(() => {
    const m = window.__swGame?.renderer?.monoFilters;
    return m ? { v: m.heatVisible, op: +m.heatOpacity.toFixed(3), i: +m.heatIntensity.toFixed(3),
      zoneDesert: !!window.__swGame.renderer.scene?.zoneDesert } : null;
  });
}

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '1247539775', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await pump(page, 60, { clearEnemies: true });

  // ---- 定位沙漠中心列与森林列（沙漠选址=最大化 SceneMetrics 169×124 扫描窗沙格数,
  //      阈值 DESERT_THRESHOLD=1500）----
  const spots = await page.evaluate(async () => {
    const { TILE_DEFS } = await import('/src/data/tiles.ts');
    const g = window.__swGame;
    const st = g.world.store, w = st.w, h = st.h;
    const sandSheets = new Set([53, 396, 397]);
    const sandIds = [], grassIds = [];
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const sh = TILE_DEFS[i]?.vanilla?.sheet;
      if (sandSheets.has(sh)) sandIds.push(i);
      else if (sh === 2) grassIds.push(i);
    }
    const isSand = (x, y) => sandIds.includes(st.type[st.idx(x, y)]);
    const surf = (x) => { let y = 40; while (y < h - 10 && !st.isSolid(x, y)) y++; return y; };
    const yTop = 40, yBot = Math.min(h - 10, Math.floor(g.world.groundLevel ?? 300) + 80);
    // 全域窗口选址：SceneMetrics 扫描窗=玩家±84×±62，DESERT_THRESHOLD=1500；
    // ★海滨带 x<380 ∪ x>w−380 的沙会被 oceanSand 扣减（desert = sand − oceanSand
    //   →BJ65 首跑选址落在沙滩 winSand=8181 而 scene 计 0）——全域扫描+海滨带回避
    const beach = 380;
    let bestWin = -1, bestWinX = -1, bestWinTy = -1;
    for (let x = Math.max(beach + 90, 90); x <= Math.min(w - 90 - beach, w - 90); x += 4) {
      const cy = surf(x) - 4;
      let n = 0;
      for (let y = Math.max(0, cy - 62); y <= Math.min(h - 1, cy + 61); y += 2) {
        for (let xx = x - 84; xx <= x + 84; xx += 2) if (isSand(xx, y)) n++;
      }
      if (n > bestWin) { bestWin = n; bestWinX = x; bestWinTy = surf(x); }
    }
    if (bestWin * 4 < 1500) return { ok: false, why: `no-desert-inland(bestWinSand=${bestWin * 4})` };
    let bestGrass = -1, bestGrassX = -1;
    for (let x = 64; x < w - 64; x += 2) {
      if (Math.abs(x - bestWinX) < 220 || x < beach + 40 || x > w - beach - 40) continue;
      let sand = 0, grass = 0;
      for (let y = yTop; y < yBot; y++) {
        const t = st.type[st.idx(x, y)];
        if (sandIds.includes(t)) sand++; else if (grassIds.includes(t)) grass++;
      }
      if (sand === 0 && grass > bestGrass) { bestGrass = grass; bestGrassX = x; }
    }
    if (bestGrassX < 0) return { ok: false, why: 'no-forest' };
    return {
      ok: true,
      desert: { x: bestWinX, ty: bestWinTy, winSand: bestWin * 4 },
      forest: { x: bestGrassX, ty: surf(bestGrassX), grass: bestGrass },
    };
  });
  L.chk('沙漠/森林定位', !!spots?.ok, JSON.stringify(spots?.why ?? spots));
  if (!spots?.ok) process.exit(L.exitCode());
  console.log('[bj65] spots', JSON.stringify(spots));

  const tp = async (spot) => {
    await page.evaluate((s) => {
      const g = window.__swGame;
      g.player.x = s.x * 16 + 8; g.player.y = (s.ty - 6) * 16;
      g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp;
      if (g.entities?.enemies) g.entities.enemies.length = 0;
      g.world.timeOfDay = 0.5;                                   // 正午
      const wea = g.world?.weather;
      if (wea) { if ('cloudAlpha' in wea) wea.cloudAlpha = 0; if ('maxRaining' in wea) wea.maxRaining = 0; }
      if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    }, spot);
  };
  const settle = async (spot, loops) => {
    for (let i = 0; i < loops; i++) { await pump(page, 30, { clearEnemies: true }); await tp(spot); }
  };

  // ---- heat ON：沙漠地表白天 ----
  await settle(spots.desert, 12);
  const zd = await page.waitForFunction(() => window.__swGame?.renderer?.scene?.zoneDesert === true,
    { timeout: 10000, polling: 300 }).then(() => true).catch(() => false);
  const sc = await page.evaluate(() => {
    const g = window.__swGame; const s = g.renderer.scene;
    return { tileY: s?.tileY, worldSurface: g.world?.groundLevel, zd: s?.zoneDesert, sand: s?.desertSandTileCount };
  });
  console.log('[bj65] scene', JSON.stringify(sc), 'zoneDesertOK=', zd);
  await page.waitForFunction(() => {
    const m = window.__swGame?.renderer?.monoFilters;
    return !!m && m.heatVisible && m.heatOpacity > 0.95 && m.heatIntensity > 0.3;
  }, { timeout: 30000, polling: 300 }).catch(() => {});
  const stOn = await heatState(page);
  L.chk('A. heat 斜坡满(Visible+Op>0.95+I>0.3)', !!(stOn?.v && stOn.op > 0.95 && stOn.i > 0.3), JSON.stringify(stOn));
  console.log('[bj65] heatON', JSON.stringify(stOn));
  await pump(page, 10);
  const onFrames = [];
  for (let i = 0; i < 3; i++) { onFrames.push(await grabMetrics(page)); await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 300); }
  await saveCanvasShot(page, resolveShotPath('bj65-heat-ON-desert'));

  // ---- heat OFF：森林地表白天 ----
  await settle(spots.forest, 12);
  await page.waitForFunction(() => {
    const m = window.__swGame?.renderer?.monoFilters; return !!m && m.heatOpacity < 0.02;
  }, { timeout: 15000, polling: 300 }).catch(() => {});
  console.log('[bj65] heatOFF', JSON.stringify(await heatState(page)));
  const offFrames = [];
  for (let i = 0; i < 3; i++) { offFrames.push(await grabMetrics(page)); await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 300); }
  await saveCanvasShot(page, resolveShotPath('bj65-heat-OFF-forest'));

  // ---- 内部活动性（同机位自归一 + 6× max）：每轮 f1/f2=相邻两帧(op=1)→poke 清零
  //      op→f3(扭曲≈0)。onAct=diff(f1,f3)=扭曲位移量；ambAct=diff(f1,f2)=相邻帧底噪。----
  const bandDiff = (A, B, w, h) => {
    const rowGrad = (d, y) => {
      let s = 0;
      for (let x = Math.floor(w * 0.2); x < w * 0.95; x += 3) {
        const ia = (y * w + x) * 4, ib = ((y + 1) * w + x) * 4;
        s += Math.abs(d[ia] - d[ib]) + Math.abs(d[ia + 2] - d[ib + 2]);
      }
      return s;
    };
    let hy = Math.floor(h * 0.35), best = -1;
    for (let y = Math.floor(h * 0.35); y < Math.floor(h * 0.85); y++) {
      const g = rowGrad(A, y);
      if (g > best) { best = g; hy = y; }
    }
    let s = 0, n = 0;
    for (let y = hy - 6; y <= hy + 6; y++) {
      for (let x = Math.floor(w * 0.2); x < w * 0.95; x++) {
        const i = (y * w + x) * 4;
        s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        n++;
      }
    }
    return { v: +(s / Math.max(1, n) / 3).toFixed(2), hy };
  };
  await settle(spots.desert, 12);
  await page.waitForFunction(() => {
    const m = window.__swGame?.renderer?.monoFilters; return !!m && m.heatVisible && m.heatOpacity > 0.9;
  }, { timeout: 30000, polling: 300 }).catch(() => {});
  await pump(page, 10);
  // 6× 采样取 max：瞬时 delta=nA−nB−0.5 相位决定整体位移大小（某些时刻≈0），
  // 单采样会漏判（判例 slime-water-pocket：随机域必须 6× 统计）
  let onActD = { v: -1, hy: -1 }, ambActD = { v: -1, hy: -1 };
  for (let it = 0; it < 6; it++) {
    const f1 = await grabRaw(page);
    const f2 = await grabRaw(page);
    await page.evaluate(() => {
      const m = window.__swGame.renderer.monoFilters;
      m.heatActive = false; m.heatOpacity = 0; m.heatIntensity = 0;
    });
    const f3 = await grabRaw(page);
    const W = onFrames[0].w, H = onFrames[0].h;
    const a = bandDiff(f1, f3, W, H), b = bandDiff(f1, f2, W, H);
    if (a.v > onActD.v) onActD = a;
    if (b.v > ambActD.v) ambActD = b;
    await page.waitForFunction(() => {
      const m = window.__swGame?.renderer?.monoFilters; return !!m && m.heatOpacity > 0.9;
    }, { timeout: 8000, polling: 100 }).catch(() => {});
    await pump(page, 5);
  }
  const onAct = onActD.v, offAct = Math.max(0.01, ambActD.v);
  console.log('[bj65] horizon max-of-6: on=', onActD.v, ' amb=', ambActD.v);

  const agg = (fs) => ({
    dTop: +Math.max(...fs.map((f) => f.dTop)),
    dBase: +Math.max(...fs.map((f) => f.dBase)),
    wrapMin: +Math.max(...fs.map((f) => f.wrapMin)),
    glsfx: fs[0].glsfx, w: fs[0].w, h: fs[0].h,
  });
  const ON = agg(onFrames), OFF = agg(offFrames);
  const artifact = (m) => m.dTop > 12 && m.dTop > 3 * Math.max(1, m.dBase) && m.wrapMin < m.dTop / 2;
  console.log('[bj65] ON ', JSON.stringify(ON));
  console.log('[bj65] OFF', JSON.stringify(OFF));
  console.log('[bj65] activity onTex=', onAct, ' offTex=', offAct, ' ratio=', +(onAct / Math.max(0.01, offAct)).toFixed(1));

  L.chk('B. ON 顶行连续(无顶缘伪影)', !artifact(ON), `dTop=${ON.dTop} dBase=${ON.dBase} wrapMin=${ON.wrapMin}`);
  L.chk('C. OFF 顶行连续', !artifact(OFF), `dTop=${OFF.dTop} dBase=${OFF.dBase} wrapMin=${OFF.wrapMin}`);
  L.chk('D. 内部扭曲仍活(地平线带 开关差≫相邻帧底噪)', onAct > offAct * 1.8 + 2,
    `on=${onAct} amb=${offAct}（决定化活证另见 _bj65-heathaze-unit interiorWarp=21.69）`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
