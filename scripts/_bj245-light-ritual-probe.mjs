// ★BJ245 实机探针——光照域两缺口 + 邪教徒仪式召唤环 三件取证（只出数据与截图,判读在报告层）。
//   A 虎体夜面发光（833-835 lightRGB 通道）：子夜冻结钟面 → 光数组基线采样 →
//     生成 834（钉位）→ 采样同点位光值差（量化 glow）+ 截图。
//   B 判镰 811 k 衰减：包装 Renderer.raiseSelfLuminousProjLight 捕获逐帧
//     {id,age,alpha,tile 光 before/after}（after≈k×(255−α)/255×255 地板）——
//     双弹错龄（A 老弹 age≫15 vs B 幼弹 age≈12）对照 + 白化序列在页值 + 截图。
//   C 邪教徒仪式环（439 ai0==5 && ai1∈[0,30)）：spawnVanillaEnemy + aiInit 钉态 +
//     rAF 重钉 ai1（AI 每 tick 推进）→ 双相位（ai1=8/15）截图。
// GPU 页禁 trace。跑法：node tools/probe.mjs run scripts/_bj245-light-ritual-probe.mjs --seed=05162020 --size=small
import { launchBrowser, openPage, bootstrap, createGame, godMode, freezeClock, unfreezeClock,
  teleport, front, pump, litStats, saveCanvasShot, resolveShotPath, saveJson, ledger }
  from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const errors = [];
const page = await openPage(browser, { errors });
try {
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot?.ok !== false, JSON.stringify(boot ?? {}));
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED ?? '05162020', size: 'small' });
  L.chk('世界已建', gen.ok, JSON.stringify({ w: gen.w, h: gen.h }));
  await godMode(page, true);
  const fr = await freezeClock(page, { tod: 0 });           // 子夜（全暗基线）
  L.chk('钟面冻结@子夜', fr?.ok === true, JSON.stringify(fr));

  // ---- 页内装具：光数组/地板包装 + 钉位循环 ----
  const rig = await page.evaluate(() => {
    const g = window.__swGame;
    const S = { log: [], LR: null, RX: 0, RY: 0, RW: 0, RH: 0, pinned: [] };
    window.__bj245 = S;
    const r = g.renderer;
    if (r && typeof r.raiseSelfLuminousProjLight === 'function') {
      const orig = r.raiseSelfLuminousProjLight.bind(r);
      r.raiseSelfLuminousProjLight = (ents, lr, lg, lb, rx, ry, rw, rh) => {
        S.LR = lr; S.RX = rx; S.RY = ry; S.RW = rw; S.RH = rh;
        const recs = [];
        for (const e of ents) {
          if (e.dead) continue;
          const pid = e.projId;
          if (pid === 811 || (pid >= 833 && pid <= 835)) {
            const tx = Math.floor(e.cx / 16) - rx, ty = Math.floor(e.cy / 16) - ry;
            recs.push({ id: pid, age: e.age ?? -1, alpha: e.alpha ?? -1, tx, ty, before: lr[ty * rw + tx] ?? -1 });
          }
        }
        orig(ents, lr, lg, lb, rx, ry, rw, rh);
        for (const rec of recs) rec.after = lr[rec.ty * rw + rec.tx] ?? -1;
        if (recs.length) S.log.push(...recs);
      };
      return { ok: true, wrapped: true };
    }
    return { ok: true, wrapped: false };
  });
  L.chk('raise 包装在位', rig.wrapped === true, JSON.stringify(rig));

  // 钉位循环（实体 x/y 每帧拉回——AI/位移覆盖不跑飞）
  await page.evaluate(() => {
    const loop = () => {
      const S = window.__bj245;
      if (S) for (const e of S.pinned) { e.x = e.__px; e.y = e.__py; e.vx = 0; e.vy = 0; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    return { px: p.cx, py: p.cy };
  });
  await teleport(page, spot.px, spot.py, { snapCamera: true, zeroVel: true });
  await pump(page, 10);

  // ============ A 虎体 834 夜面发光 ============
  const tigerSpot = { x: spot.px + 48, y: spot.py - 8 };
  const baseLit = await litStats(page, { wx: tigerSpot.x, wy: tigerSpot.y, w: 80, h: 80 });
  const baseTile = await page.evaluate(({ wx, wy }) => {
    const S = window.__bj245;
    if (!S.LR) return { ok: false };
    const tx = Math.floor(wx / 16) - S.RX, ty = Math.floor(wy / 16) - S.RY;
    let sum = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = S.LR[(ty + dy) * S.RW + (tx + dx)];
      if (v !== undefined) { sum += v; n++; }
    }
    return { ok: n > 0, mean: sum / Math.max(1, n) };
  }, { wx: tigerSpot.x, wy: tigerSpot.y });
  L.chk('夜面光数组基线可读', baseTile.ok === true && baseLit.total > 0, JSON.stringify({ baseTile, baseLit }));

  const tiger = await page.evaluate(async ({ x, y }) => {
    const g = window.__swGame;
    const { MinionProj } = await import('/src/entities/MinionProj.ts');
    const m = new MinionProj(x - 13, y - 10, 834, 10, 1, false, 0, false, () => g.player);
    m.__px = x - 13; m.__py = y - 10;
    g.entities.add(m, 'projectiles');
    window.__bj245.pinned.push(m);
    window.__bj245Tiger = m;
    return { ok: true, lightRGB: m.lightRGB, tigerA0: m.tigerA0 ?? null };
  }, { x: tigerSpot.x, y: tigerSpot.y });
  L.chk('834 已生成（lightRGB=0.8 白）', tiger.ok && tiger.lightRGB && Math.abs(tiger.lightRGB[0] - 0.8) < 1e-9, JSON.stringify(tiger));
  await pump(page, 40);
  const afterTile = await page.evaluate(({ wx, wy }) => {
    const S = window.__bj245;
    if (!S.LR) return { ok: false };
    const tx = Math.floor(wx / 16) - S.RX, ty = Math.floor(wy / 16) - S.RY;
    let sum = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = S.LR[(ty + dy) * S.RW + (tx + dx)];
      if (v !== undefined) { sum += v; n++; }
    }
    return { ok: n > 0, mean: sum / Math.max(1, n) };
  }, { wx: tigerSpot.x, wy: tigerSpot.y });
  const tigerDelta = (afterTile.mean ?? 0) - (baseTile.mean ?? 0);
  L.chk('虎体发光Δ光>15（0.8 白光入数组）', tigerDelta > 15, JSON.stringify({ baseTile, afterTile, delta: +tigerDelta.toFixed(2) }));
  await saveCanvasShot(page, resolveShotPath('bj245-tiger-glow-night'));

  // ============ B 判镰 811 k 衰减（双弹错龄,暗盒内逐记录地板对照） ============
  // 弹放密封暗腔（地表下 12-16 格,clearArea 挖空;夜空月光环境光 100+ 会盖过地板=
  // 原版"光照≥地板零改动"同相,首跑已证;地表内嵌=撞块即杀亦不可）——暗腔 base≈0
  // → after=round(255×k(age)×(255−α)/255) 可逐记录断言。
  const pocket = await page.evaluate(() => {
    const g = window.__swGame;
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    const st = g.world.store;
    for (let y = pty + 12; y <= pty + 16; y++) {
      for (let x = ptx - 5; x <= ptx + 5; x++) {
        const i = st.idx(x, y);
        st.setTile(x, y, 0, 0, 0);
        st.liquid[i] = 0; st.wire[i] = 0; st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0;
      }
    }
    return { ptx, pty };
  });
  await pump(page, 8);
  const spawnDart = (name, x, y) => page.evaluate(async ({ name, x, y }) => {
    const g = window.__swGame;
    const { Dart, whiteK811 } = await import('/src/entities/Dart.ts');
    const d = new Dart(x - 5, y - 5, 0, 0, 30, 811);
    d.__px = x - 5; d.__py = y - 5;
    g.entities.add(d, 'projectiles');
    window.__bj245.pinned.push(d);
    window['__bj245' + name] = d;
    return { ok: true, age: d.age, k1: whiteK811(1), k15: whiteK811(15), k30: whiteK811(30) };
  }, { name, x, y });
  const dartA = await spawnDart('A', (pocket.ptx - 3) * 16 + 8, (pocket.pty + 14) * 16 + 8);
  L.chk('811-A 已生成（whiteK811 页值 1/0.3/0.3）', dartA.ok && Math.abs(dartA.k1 - (1 - 0.7 / 15)) < 1e-9 && Math.abs(dartA.k15 - 0.3) < 1e-9, JSON.stringify(dartA));
  await pump(page, 18);                                    // A age≈18 → k=0.3 钳尾
  const dartB = await spawnDart('B', (pocket.ptx + 3) * 16 + 8, (pocket.pty + 14) * 16 + 8);
  await pump(page, 12);                                    // B age≈12 → k≈0.44、α≈15
  const kOf = (age) => (age <= 0 ? 1 : age >= 15 ? 0.3 : 1 - 0.7 * (age / 15));
  const frOf = (r) => Math.round(255 * kOf(r.age) * (255 - Math.max(0, Math.min(255, r.alpha))) / 255);
  let dartSeq = [], darkRecs = [], floorMatches = [], spread = -1;
  for (let tries = 0; tries < 4 && !(darkRecs.length >= 6 && spread > 15); tries++) {
    if (tries > 0) {   // 补fresh弹:保证样本跨 k 衰减边界（age<15 高档 / ≥15 钳尾）
      await spawnDart('X' + tries, (pocket.ptx + (tries % 2 === 0 ? 1 : -1)) * 16 + 8, (pocket.pty + 14) * 16 + 8);
      await pump(page, 8);
    }
    dartSeq = await page.evaluate(() => window.__bj245.log);
    darkRecs = dartSeq.filter((r) => r.id === 811 && r.before < 40);
    floorMatches = darkRecs.filter((r) => Math.abs(r.after - Math.max(r.before, frOf(r))) <= 2);
    const frs = darkRecs.map(frOf);
    spread = frs.length ? Math.max(...frs) - Math.min(...frs) : -1;
  }
  const oldRecs = darkRecs.filter((r) => r.age >= 15);
  const oldFloor = oldRecs.length ? Math.min(...oldRecs.map((r) => r.after)) : -1;
  const youngFloor = Math.max(...darkRecs.map((r) => r.after));
  L.chk('811 逐记录地板=round(255·k(age)·(255−α)/255)（匹配率≥90%,≥6 条）',
    darkRecs.length >= 6 && floorMatches.length / darkRecs.length >= 0.9,
    JSON.stringify({ dark: darkRecs.length, match: floorMatches.length,
      sample: darkRecs.slice(0, 3).concat(darkRecs.slice(-3)) }));
  L.chk('811 衰减方向（样本跨龄地板差>15）', spread > 15,
    JSON.stringify({ oldFloor, youngFloor, spread }));
  await saveCanvasShot(page, resolveShotPath('bj245-dart811-decay'));

  // ============ C 邪教徒仪式召唤环 ============
  // 环色=GetAlpha(npcColor) 光照色（非自发光,原版相）——子夜拍会全黑;解冻→正午冻结再拍。
  await unfreezeClock(page);
  await freezeClock(page, { tod: 0.5 });
  await pump(page, 10);
  const cult = await page.evaluate(async ({ x, y }) => {
    const g = window.__swGame;
    const flow = window.__swFlow;
    const meta = await flow.spawnVanillaEnemy(439, x, y);
    if (!meta) return { ok: false, why: 'spawn-failed' };
    const e = (g.entities.enemies ?? []).find((n) => n.id === meta.id);
    if (!e) return { ok: false, why: 'no-ref' };
    e.ai0 = 5; e.ai1 = 15; e.spawnAlpha = 0; e.iframes = 2; e.vx = 0; e.vy = 0;
    if (!window.__bj245CultPin) {
      window.__bj245CultPin = true;
      const loop = () => {
        const c = window.__bj245Cult;
        if (c) { c.ai0 = 5; c.ai1 = window.__bj245CultPhase ?? 15; c.spawnAlpha = 0; c.iframes = 2; }
        const cam = window.__swGame?.camera;
        if (cam && window.__bj245CamPin) { cam.x = window.__bj245CamPin.x; cam.y = window.__bj245CamPin.y; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    window.__bj245Cult = e;
    window.__bj245CultPhase = 15;
    window.__bj245CamPin = { x: e.cx, y: e.cy };
    g.camera.zoom = 3; g.camera.zoomTarget = 3;
    return { ok: true, id: meta.id, vid: e.vanillaId, x: e.cx, y: e.cy, w: e.w, h: e.h };
  }, { x: spot.px + 150, y: spot.py - 24 });
  L.chk('439 已生成并钉入仪式态', cult.ok === true, JSON.stringify(cult));
  await pump(page, 30);                                   // Extra_30 贴图懒加载窗+相机稳定
  await saveCanvasShot(page, resolveShotPath('bj245-cultist-ring-ai1-15'));
  await page.evaluate(() => { window.__bj245CultPhase = 20; });
  await pump(page, 10);
  await saveCanvasShot(page, resolveShotPath('bj245-cultist-ring-ai1-08'));
  const ringState = await page.evaluate(() => {
    const c = window.__bj245Cult;
    return c ? { ai0: c.ai0, ai1: c.ai1, spawnAlpha: c.spawnAlpha, cx: c.cx, cy: c.cy, dead: c.dead } : { gone: true };
  });
  L.chk('仪式态保持（ai0=5,ai1 钉窗）', ringState.ai0 === 5 && ringState.ai1 >= 0 && ringState.ai1 < 30, JSON.stringify(ringState));

  const errs = errors;
  L.chk('零 pageerror', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  saveJson(`${process.env.SW_PROBE_OUT ?? '/tmp/probe-out'}/bj245-summary.json`, {
    tigerDelta, baseTile, afterTile, dart: { oldFloor, youngFloor },
    ringState, tiger, dartA, cult, dartLogCount: dartSeq.length,
  });
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
