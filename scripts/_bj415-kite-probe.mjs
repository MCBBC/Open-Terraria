// ★BJ415 2026-09-30「猪龙风筝天上飞三只猪龙」实机探针（私有端口,SW_ORIGIN 注入）。
// 定谳 = 风筝族本体帧横切网格缺表（Main.DrawKite Main.cs:37972 Frame(projFrames,1,frame)
// 横参=列数）——projFrameImg 旧竖切把 826 三变体横排表（粉/紫/红 112×80×3）切成
// 336×27 全宽横带=三只"猪龙"同屏。本探针：
//   S1 页内模块面 projFrameImg(826,0) → 112×80（修复钉;旧病灶=336×27）
//   S2 装填猪龙风筝 4613 → 风天放飞 → KiteProj 826 在场
//   S3 截图留档（正确形态=单只粉猪龙风筝 112×80）
// 用法(game/): SW_ORIGIN=http://localhost:5510 node tools/run-diag.mjs scripts/_bj415-kite-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = 'docs/evidence/bj415';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5510';
const log = (...a) => console.log('[bj415]', ...a);
const A = [];
const ok = (n, pass, x) => { A.push({ name: n, pass: !!pass, ...(x ?? {}) }); log(pass ? 'PASS' : 'FAIL', n, x ? JSON.stringify(x) : ''); };

const forceWind = (page, v) => page.evaluate((wind) => {
  const g = window.__swGame;
  g.world.weather.windSpeedCurrent = wind;
  g.world.weather.windSpeedTarget = wind;
  return g.world.weather.windSpeedCurrent;
}, v);

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);

    // ---- S1: 页内模块面——projFrameImg(826,0) 横切钉值（vite dev 动态 import）----
    const s1 = await page.evaluate(async () => {
      const m = await import('/src/entities/Arrow.ts');
      // projSprite 首调异步装载——轮询至 img 就绪（≤3s）
      let img = null;
      for (let i = 0; i < 30 && !img; i++) {
        img = m.projFrameImg(826, 0);
        if (!img) await new Promise((r) => setTimeout(r, 100));
      }
      if (!img) return { ok: false, why: 'projFrameImg null（3s 未装载）' };
      // 非空像素均值（frame0=粉猪龙:R 高 G 低）
      const cx = img.getContext('2d');
      const d = cx.getImageData(0, 0, img.width, img.height).data;
      let n = 0, r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 32) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      }
      return {
        ok: true, w: img.width, h: img.height,
        frames: m.projFrameCount(826),
        avg: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null, px: n,
      };
    });
    ok('S1 projFrameImg(826,0)=112×80（旧病灶 336×27）', s1.ok && s1.w === 112 && s1.h === 80, s1);
    ok('S1 projFrameCount(826)=3', s1.frames === 3, { frames: s1.frames });
    ok('S1 帧0 主色偏粉（R>G,B;猪龙粉变体）', s1.avg && s1.avg[0] > s1.avg[1], s1.avg);

    // ---- S2: 装填猪龙风筝 4613 → 风天放飞 ----
    await page.evaluate(() => {
      const g = window.__swGame;
      const sx = g.world.spawnX * 16;
      const sy = (g.world.spawnY - 6) * 16;
      g.player.x = sx; g.player.y = sy; g.player.vx = 0; g.player.vy = 0;
    });
    await forceWind(page, 0.5);
    const equip = await page.evaluate(() => {
      const g = window.__swGame;
      const key = Object.keys(window.__swItems).find((k) => /^vi_4613_/.test(k));
      const id = window.__swItems[key];
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id, stack: 1 };
      g.cb.onInventoryChanged?.();
      const held = g.player.inv.heldItem();
      return { id, heldId: held?.id };
    });
    ok('S2 热栏装填 4613 猪龙风筝', equip.id !== undefined && equip.heldId === equip.id, equip);
    await pump(page, 10);

    await page.evaluate(() => {
      const g = window.__swGame;
      g.input.mouseX = 900; g.input.mouseY = 200;
      g.input.mouseDown = true; g.input.mouseHeld = false; g.input.rightDown = false;
    });
    await pump(page, 6);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });

    // 滞空 150t（保风场）
    for (let i = 0; i < 5; i++) { await forceWind(page, 0.5); await pump(page, 30); }
    const s2 = await page.evaluate(() => {
      const g = window.__swGame;
      const k = g.entities.projectiles.find((e) => e.constructor.name === 'KiteProj' && e.projId === 826);
      if (!k) return { found: false };
      return {
        found: true, projId: k.projId, frame: k.frame, ai0: k.ai0, alive: !k.dead,
        x: Math.round(k.cx), y: Math.round(k.cy), droop: +k.projectileLocalAI1.toFixed(3),
        wind: g.world.weather.windSpeedCurrent,
        kiteCount: g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj').length,
      };
    });
    ok('S2 KiteProj 826 在场滞空', s2.found && s2.alive, s2);
    ok('S2 单只在场（三只之谜=单 draw 横带,非连放）', s2.kiteCount === 1, { kiteCount: s2.kiteCount });
    ok('S2 frame 恒 0（=ai[1] 无写入,粉变体 P.cs:49544）', s2.frame === 0, { frame: s2.frame });

    await page.screenshot({ path: join(OUT, 's3-pigron-kite-flying.png') });

    // ---- S3: 绘制面直接取证——页内画布重放 drawFlyingKite 消费的帧源 ----
    const s3 = await page.evaluate(async () => {
      const m = await import('/src/entities/Arrow.ts');
      const r0 = m.projFrameSrcRect ? m.projFrameSrcRect(826, 0) : null;
      return { srcRect: r0 };
    });
    ok('S3 帧源矩形 {0,0,112,80}（染料 pass 同源）',
      s3.srcRect && s3.srcRect.sw === 112 && s3.srcRect.sh === 80 && s3.srcRect.sx === 0, s3.srcRect);

    writeFileSync(join(OUT, 'bj415-probe-results.json'), JSON.stringify({
      when: new Date().toISOString(), origin: ORIGIN, results: A,
    }, null, 2));
    log('results →', join(OUT, 'bj415-probe-results.json'));
  } finally {
    await closeAllBrowsers();
  }
  const fails = A.filter((r) => !r.pass);
  console.log(`[bj415] ${A.length - fails.length}/${A.length} PASS`);
  if (fails.length) process.exit(1);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
