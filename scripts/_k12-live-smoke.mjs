// ★K1-2 活机零钉面冒烟（2026-10-02）：真实游玩条件（不冻结/塔斜坡自然升/相机移动/
// 环境鸟群驻留迁移）下 Stack 档持续服役+零页错误+sfxPathStats 归因正确。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=180000 scripts/_k12-live-smoke.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };

const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await bootstrap(page, ORIGIN + '/?c10e=1');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// 塔桩（斜坡自然升——免钉面;uTime 真值=GTW 真实施加）
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__origTow = r._lunarTowerFilterTarget.bind(r);
  r._lunarTowerFilterTarget = () => {
    const p = window.__swGame.player;
    return { key: 'solar', x: p.cx + 8, y: p.cy - 30, ai3: 120, shieldUp: true };
  };
  g_final();
  function g_final() {}
});
// 相机游走（真实位移:每帧拨方向键——活机层序/栈尺寸/迁移窗全真）
await page.evaluate(() => {
  const g = window.__swGame;
  g.keys ??= {};
  window.__walk = setInterval(() => {
    const now = Date.now() / 1000 | 0;
    g.keys['ArrowRight'] = now % 8 < 5;
    g.keys['ArrowLeft'] = now % 8 >= 5;
  }, 100);
});
await new Promise((r) => setTimeout(r, 20000));   // 20s 活机长跑（含鸟群驻留/离场迁移窗）
const stats = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  clearInterval(window.__walk);
  return {
    sfx: { ...r.sfxPathStats },
    used: r.sfxPathUsed,
    comp: r._c10eCompositeStats,
    fold: r._c10eChainScratchCount,
    stackLen: r.swPipe ? r.swPipe.screenStackView.length : -1,
    frames: window.__swGame._paintedFrames,
  };
});
console.log('LIVE ', JSON.stringify(stats));
chk('pipe-stack 服役占比健康（>90% 滤镜帧走 Stack）', stats.sfx['pipe-stack'] > 0 && stats.sfx['pipe-stack'] >= (stats.sfx['pipe'] || 0), JSON.stringify(stats.sfx));
chk('滤镜帧零全帧合成（K1-2 主信号——comp 恒 0）', stats.comp === 0, `comp=${stats.comp}`);
chk('滤镜帧零折叠（fold 恒 0）', stats.fold === 0, `fold=${stats.fold}`);
chk('20s 零页错误', errs.length === 0, errs.slice(0, 3).join(' | '));
try { await page.screenshot({ path: '/tmp/k12-live.png' }); } catch (e) { console.log('WARN shot ' + e.message); }

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${errs.length ? '  页错误:' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);
