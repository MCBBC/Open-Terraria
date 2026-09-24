// ★BJ325 探针②：GetAlpha d370 蓝通道增亮（NPC.cs:94684-94691,BJ312 债）逐像素验证。
// 场景：d370 ai0=2（门内）spawnAlpha=150（半隐上限,AI_069 :49498-49516 钳域），
//   天空白底悬停，世界暂停（AI/物理/相机全停）+freezeClock → 帧级确定。
//   本体走直接路径（一阶段无相位染色、无 color）= 预乘对支。
// 判据（修后 tag=after vs 修前 tag=before——修前=临时变异 num9→num,因子恒等
//   =预乘对仍走但 mB=mR,等价旧 source-over 面）：
//   ① R/G 通道跨构建逐像素恒等（±2,GL 合成量化域）——手术不越界的哨兵；
//   ② B 通道修后 > 修前（体部抽样,中位比值 ≈ num9/num=1.357,容差带 1.15-1.60）;
//   ③ 门负控 ai0=12（GetAlpha 门外）：两构建逐像素恒等（含 B）。
// 跑法：
//   SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj325-duke370-alpha.mjs -- --tag=after
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, teleport } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const OUT = '/tmp/bj325-out';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=after').slice(6);
const AI0 = Number((process.argv.find((a) => a.startsWith('--ai0=')) || '--ai0=2').slice(6));
const ALPHA = Number((process.argv.find((a) => a.startsWith('--alpha=')) || '--alpha=150').slice(8));
const log = (...a) => console.log('[bj325-duke]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, { errors: [] });
try {
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  await godMode(page, true);
  await freezeClock(page, { tod: 0.5 });

  // ---- 相机钉位（地表上空开敞天域）----
  await teleport(page, 400 * 16, 46 * 16);
  await sleep(300);

  // ---- 注入 Duke（暂停前落位;暂停后 AI 不跑,spawnAlpha/ai0 保持注入值）----
  const sp = await page.evaluate(async ({ ai0, alpha }) => {
    const g = window.__swGame;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const wx = 400 * 16 + 8, wy = 46 * 16;
    const e = Enemy.fromVanilla(370, wx, wy);
    if (!e) return { ok: false, why: 'spawn-null' };
    e.id = g.entities.nextId++;
    e.ai0 = ai0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.spawnAlpha = alpha; e.alphaFade = false;
    e.vx = 0; e.vy = 0; e.spin = 0; e.visAngle = 0;
    e.hp = e.maxHp;
    g.entities.add(e, 'enemies');
    g.paused = true;
    // 玩家移出采样窗（相机已钉,移动不跟拍）
    g.player.x = wx - 500; g.player.y = wy + 60; g.player.vx = 0; g.player.vy = 0;
    return { ok: true, box: { x: e.x, y: e.y, w: e.w, h: e.h }, vanillaScale: e.vanillaScale };
  }, { ai0: AI0, alpha: ALPHA });
  if (!sp.ok) throw new Error('spawn: ' + sp.why);
  log('duke spawned', JSON.stringify(sp.box), 'scale', sp.vanillaScale);
  await sleep(200);

  // ---- 泵帧（光照收敛）+ worldLayer 预乘层读回（无光照乘=跨构建字节确定;
  //   合成面曾读回全黑=高空光照衰减,worldLayer 比值面免疫光照）----
  for (let k = 0; k < 12; k++) { await sleep(100); }
  const sample = await page.evaluate(({ ai0, alpha, box }) => {
    const g = window.__swGame;
    const wc = g.renderer.worldCanvas;
    return {
      wl: wc.toDataURL('image/png'),
      wlSize: [wc.width, wc.height],
      cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom },
      box,
    };
  }, { ai0: AI0, alpha: ALPHA, box: sp.box });

  writeFileSync(join(OUT, `duke-${TAG}-ai${AI0}-a${ALPHA}.json`),
    JSON.stringify({ tag: TAG, ai0: AI0, alpha: ALPHA, ...sample }, null, 1));
  log('OK tag=' + TAG, 'ai0=' + AI0, 'alpha=' + ALPHA);
} catch (err) {
  console.error('[bj325-duke] FAIL', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await closeAllBrowsers().catch(() => {});
}
