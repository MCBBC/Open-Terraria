// ★BJ299 龙卷贴图视觉探针：小塔 384 / 大塔 386 注入到玩家旁地表,生长完成后
// 截图 + 活像素哨兵 + 贴图缓存健康。判据：真贴图旋涡带(162×264 帧切片)上屏,
// 不再是双色占位柱。用法(game/ 下):
//   SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj299-sharknado-visual.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { savePageShot, litStats } from '../tools/probe/lib/shot.mjs';

const OUT = '/tmp/bj299-probe-out';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj299]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);

    // 注入：小塔(384)于玩家左侧 5 格地表,大塔(386)右侧 8 格;基座贴地。
    const inj = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const px = g.player.cx, py = g.player.cy;
      const groundY = (wx) => {
        let ty = Math.max(4, Math.floor(py / 16) - 30);
        while (ty < st.h - 6 && !st.isSolid(Math.floor(wx / 16), ty)) ty++;
        return ty;
      };
      const { DukeSharknadoTornado } = await import('/src/entities/bossAI_duke_moonlord.ts');
      // 假 src(出鲨段 spawnPart 读 src.cx/cy——真实链=弹 385 携带公爵引用)
      const fakeSrc = { cx: px, cy: py, id: 1, dead: false, targetRef: () => g.player };
      const mk = (dxTiles, big) => {
        const wx = px + dxTiles * 16;
        const gy = groundY(wx);
        const t = new DukeSharknadoTornado(wx, gy * 16 - 10, big, fakeSrc);
        g.entities.add(t, 'projectiles');
        // headless rAF 节流(实测 5s 仅 ~20 拍)——手动推进 260 拍:小塔长满(141 拍)
        // +大塔近满(222 拍),之后 rAF 渲染循环照常消费该状态
        for (let i = 0; i < 260; i++) t.fixedUpdate(1 / 60, g);
        return { x: wx, y: gy * 16 - 10, big, segs: t.segs, ai0: t.ai0 };
      };
      return { small: mk(-9, false), big: mk(-20, true), px, py };
    });
    log('injected', JSON.stringify(inj));

    // 手动推进已长满;短等数帧即拍(防 540 拍寿命到期+摇摆漂移出框)
    await sleep(900);

    // 贴图缓存健康 + 实体存活确认
    const health = await page.evaluate(async () => {
      const g = window.__swGame;
      const { projSpriteHealth } = await import('/src/entities/Arrow.ts');
      const tornados = g.entities.projectiles.filter(
        (e) => e.constructor.name === 'DukeSharknadoTornado');
      return {
        sprites: projSpriteHealth([384, 386]),
        alive: tornados.map((t) => ({
          big: !!t.big, segs: t.segs, alpha: t.alpha,
          cx: Math.round(t.cx), cy: Math.round(t.cy), w: t.w,
        })),
      };
    });
    log('health', JSON.stringify(health));
    writeFileSync(join(OUT, 'health.json'), JSON.stringify({ inj, health }, null, 2));

    // 活像素哨兵(两塔列身中段窗) + 整页截图
    for (const [tag, pos] of [['small', inj.small], ['big', inj.big]]) {
      const st = await litStats(page, { wx: pos.x, wy: pos.y - 120, w: 220, h: 260 });
      log(`litStats[${tag}]`, JSON.stringify(st));
    }
    await savePageShot(page, join(OUT, 'tornado-visual.png'));
    log('shot saved', join(OUT, 'tornado-visual.png'));
  } finally {
    await closeAllBrowsers();
  }
  console.log('[bj299] DONE');
}

await main().catch((e) => { console.error('[bj299] FAIL', e); process.exit(1); });
