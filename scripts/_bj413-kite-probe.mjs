// ★BJ413 2026-09-30「放风筝无效」实机探针——风天放风筝全链（私有端口探针,SW_ORIGIN 注入）。
// 场景：
//   S1 风天(wind=0.5) 热栏装蓝风筝 4367 → 左键使用 → KiteProj 766 出膛+滞空+绘制截图
//   S2 放线/收线：左键电平 ai0↑（钳 500）/ 右键电平 ai0↓ → 收到 4 → Kill
//   S3 无风(wind=0)：下垂态（localAI1 爬升）仍飞行不消亡（timeLeft 不超时）
//   S4 buff 383 腾灵在风筝高于玩家顶时续期
// 用法(game/): SW_ORIGIN=http://localhost:5461 node tools/run-diag.mjs scripts/_bj413-kite-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = 'docs/evidence/bj413';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5461';
const log = (...a) => console.log('[bj413]', ...a);
const A = [];
const ok = (n, pass, x) => { A.push({ name: n, pass: !!pass, ...(x ?? {}) }); log(pass ? 'PASS' : 'FAIL', n, x ? JSON.stringify(x) : ''); };

const forceWind = (page, v) => page.evaluate((wind) => {
  const g = window.__swGame;
  g.world.weather.windSpeedCurrent = wind;
  g.world.weather.windSpeedTarget = wind;   // 双写防 updateWeather 向 target 漂移
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

    // ---- 数据面预检（页内 itemCombat/rare/value）----
    const dataFace = await page.evaluate(() => {
      const g = window.__swGame;
      const vid = 4367;
      const id = g.itemCombat ? null : null;
      void id;
      // 经模块面查：Game 构造后 ITEM_DEFS 可从 def.vid 反查
      const def = Object.values(g.constructor === Object ? {} : {}).length ? null : null;
      void def;
      const kiteKey = Object.keys(window.__swItems ?? {}).find((k) => /^vi_4367_/.test(k));
      return { kiteKey, hasItems: !!window.__swItems };
    });
    ok('页内 kite item 键注册', dataFace.kiteKey, dataFace);

    // ---- 装填：4367 蓝风筝 → 热栏 0 选中 ----
    const equip = await page.evaluate(() => {
      const g = window.__swGame;
      const key = Object.keys(window.__swItems).find((k) => /^vi_4367_/.test(k));
      const id = window.__swItems[key];
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id, stack: 1 };
      g.cb.onInventoryChanged?.();
      const held = g.player.inv.heldItem();
      return { id, heldId: held?.id, key };   // vid 判据=S1 出膛 projId 766（__swItems 索引面无 def 反查）
    });
    ok('热栏装填 4367', equip.id !== undefined && equip.heldId === equip.id, equip);

    // ---- 传送开阔地（出生点地表）+ 风天 ----
    await page.evaluate(() => {
      const g = window.__swGame;
      const sx = g.world.spawnX * 16;
      const sy = (g.world.spawnY - 6) * 16;
      g.player.x = sx; g.player.y = sy; g.player.vx = 0; g.player.vy = 0;
    });
    await forceWind(page, 0.5);
    await pump(page, 10);

    // ---- S1: 左键使用 → 出膛 ----
    await page.evaluate(() => {
      const g = window.__swGame;
      const p = g.player;
      g.input.mouseX = 900; g.input.mouseY = 200;   // 朝右上方
      g.input.mouseDown = true; g.input.mouseHeld = false; g.input.rightDown = false;
      void p;
    });
    await pump(page, 6);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });
    const s1 = await page.evaluate(() => {
      const g = window.__swGame;
      const ks = g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj');
      const k = ks[ks.length - 1];
      if (!k) return { found: false, total: g.entities.projectiles.length };
      return {
        found: true, projId: k.projId, ai0: k.ai0, x: Math.round(k.cx), y: Math.round(k.cy),
        playerY: Math.round(g.player.cy), wind: g.world.weather.windSpeedCurrent,
        localAI1: +k.projectileLocalAI1.toFixed(3), frame: k.frame, dead: k.dead,
        bucket: g.entities.projectiles.length,
      };
    });
    ok('S1 风筝出膛（KiteProj 766 在场）', s1.found && s1.projId === 766, s1);
    ok('S1 线长初值 250', s1.found && s1.ai0 === 250, { ai0: s1.ai0 });

    // 滞空 120t 观察（保持风场）
    for (let i = 0; i < 4; i++) { await forceWind(page, 0.5); await pump(page, 30); }
    const s1b = await page.evaluate(() => {
      const g = window.__swGame;
      const k = g.entities.projectiles.find((e) => e.constructor.name === 'KiteProj' && e.projId === 766);
      return k ? { alive: !k.dead, y: Math.round(k.cy), playerTop: Math.round(g.player.y),
        wind: g.world.weather.windSpeedCurrent, droop: +k.projectileLocalAI1.toFixed(3) } : { alive: false };
    });
    await page.screenshot({ path: join(OUT, 's1-windy-flying.png') });
    ok('S1 120t 滞空存活', s1b.alive, s1b);

    // buff 面读数（风筝升空后）
    const buffFace = await page.evaluate(() => {
      const g = window.__swGame;
      const p = g.player;
      const bt = p.buffs?.active ?? new Map();
      let kite = null;
      for (const [t, v] of bt) { if (Number(t) === 75) kite = v; }   // BuffType.KiteBuff=75
      return { kiteBuff: kite };
    });
    ok('S4 buff 383 腾灵续期中', buffFace.kiteBuff !== null && buffFace.kiteBuff > 0, buffFace);

    // ---- S2a: 放线（左键电平,itemAnimation=0）→ ai0 爬升钳 500 ----
    await page.evaluate(() => {
      const g = window.__swGame;
      g.input.mouseHeld = true; g.input.mouseDown = false; g.input.rightDown = false;
    });
    for (let i = 0; i < 12; i++) { await forceWind(page, 0.5); await pump(page, 25); }
    const s2a = await page.evaluate(() => {
      const g = window.__swGame;
      const k = g.entities.projectiles.find((e) => e.constructor.name === 'KiteProj' && e.projId === 766);
      g.input.mouseHeld = false;
      return k ? { ai0: k.ai0 } : { ai0: null };
    });
    ok('S2a 放线钳 500', s2a.ai0 === 500, s2a);
    await page.screenshot({ path: join(OUT, 's2a-full-string.png') });

    // ---- S2b: 收线（右键电平）→ ai0 递减至 4 → Kill ----
    await page.evaluate(() => {
      const g = window.__swGame;
      g.input.rightDown = true; g.input.mouseDown = false; g.input.mouseHeld = false;
    });
    let reeled = null;
    for (let i = 0; i < 20; i++) {
      await pump(page, 25);
      reeled = await page.evaluate(() => {
        const g = window.__swGame;
        const k = g.entities.projectiles.find((e) => e.constructor.name === 'KiteProj' && e.projId === 766);
        return { ai0: k ? k.ai0 : null, alive: !!k && !k.dead };
      });
      if (reeled.ai0 === null) break;
    }
    await page.evaluate(() => { const g = window.__swGame; g.input.rightDown = false; });
    ok('S2b 收线至 4 → Kill（风筝消亡）', reeled && reeled.ai0 === null, reeled);
    await page.screenshot({ path: join(OUT, 's2b-reeled-in.png') });

    // ---- S3: 无风下垂态不消亡 ----
    await forceWind(page, 0);
    await page.evaluate(() => {
      const g = window.__swGame;
      g.input.mouseDown = true; g.input.mouseHeld = false; g.input.rightDown = false;
      g.input.mouseX = 1000; g.input.mouseY = 400;
    });
    await pump(page, 6);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });
    for (let i = 0; i < 4; i++) { await forceWind(page, 0); await pump(page, 30); }
    const s3 = await page.evaluate(() => {
      const g = window.__swGame;
      const k = g.entities.projectiles.find((e) => e.constructor.name === 'KiteProj' && e.projId === 766);
      return k ? { alive: !k.dead, droop: +k.projectileLocalAI1.toFixed(3), y: Math.round(k.cy) } : { alive: false };
    });
    await page.screenshot({ path: join(OUT, 's3-calm-droop.png') });
    ok('S3 无风滞空不消亡', s3.alive, s3);
    ok('S3 下垂累积(localAI1>0)', s3.alive && s3.droop > 0, s3);

    // ---- 绘制像素面证据：风筝贴图非空白（画布采样判定由截图留档承载）----
    writeFileSync(join(OUT, 'bj413-probe-results.json'), JSON.stringify({
      when: new Date().toISOString(), origin: ORIGIN, results: A,
    }, null, 2));
    log('results →', join(OUT, 'bj413-probe-results.json'));
  } finally {
    await closeAllBrowsers();
  }
  const fails = A.filter((r) => !r.pass);
  console.log(`[bj413] ${A.length - fails.length}/${A.length} PASS`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
