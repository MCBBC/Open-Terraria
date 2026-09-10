/**
 * SW-BJ58 探针 Q：drawTownNPC / drawPlayer 单独停用 → 视觉裁决。
 * 扫除信号:停 drawTownNPC → row 盒 98→48;停 drawPlayer/Acc 层 → 68。
 * 本轮两臂各截图人眼判精灵是否消失(NPC 臂去 NPC 干扰;Player 臂去玩家贴图干扰)。
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 60, { clearEnemies: true });
  const iid5126 = await itemByVid(page, 5126);
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await nextFrame(page);
  await saveCanvasShot(page, `${OUT}/q-baseline.png`);

  // 臂1: 停 drawTownNPC
  await page.evaluate(() => {
    const g = window.__swGame;
    g.renderer.drawTownNPC = function () { return undefined; };
  });
  await pump(page, 4);
  for (let i = 0; i < 3; i++) await nextFrame(page);
  await saveCanvasShot(page, `${OUT}/q-noTownNPC.png`);
  await page.evaluate(() => { const g = window.__swGame; delete g.renderer.drawTownNPC; });
  await pump(page, 4);

  // 臂2: 停 drawPlayer
  await page.evaluate(() => {
    const g = window.__swGame;
    g.renderer.drawPlayer = function () { return undefined; };
  });
  await pump(page, 4);
  for (let i = 0; i < 3; i++) await nextFrame(page);
  await saveCanvasShot(page, `${OUT}/q-noPlayer.png`);
  await page.evaluate(() => { const g = window.__swGame; delete g.renderer.drawPlayer; });
  await pump(page, 4);

  // 臂3: 停 drawAccFrontLayers + drawAccBodyFrame
  await page.evaluate(() => {
    const g = window.__swGame;
    g.renderer.drawAccFrontLayers = function () { return undefined; };
    g.renderer.drawAccBodyFrame = function () { return undefined; };
  });
  await pump(page, 4);
  for (let i = 0; i < 3; i++) await nextFrame(page);
  await saveCanvasShot(page, `${OUT}/q-noAcc.png`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
