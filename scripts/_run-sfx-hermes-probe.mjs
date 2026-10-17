// ★Run 翻案修刀验证探针(2026-10-17):hermesStepSound 三件套接线——
//   断言①触发门反证:裸装(accRun==maxRun 互斥带空)按 d 全速跑 1.5s → 零 Run 事件;
//   断言②穿赫尔墨斯靴(vid 54,armor[3] 配饰槽)按 d 冲刺 → sfx 环 k='wav' d.f='Run'
//          事件流出现(且 vx 采样确实越过 (accRun+maxRun)/2 阈);
//   断言③冷却:相邻 Run 事件 tick 差 ≥6(IntendedCooldown=9,递减后可复播);
//   断言④Djinn's Curse(vid 3770,armor[2] 腿甲槽,legs==140)→ 冲刺出 Item_24
//          事件+Run 归零(SoundType 2 Style 24 覆写,冷却 6)。
// 录音面:Sfx.onEvent('wav',{f,...}) → __swAudioRec.sfx 环(无窗 snapshotTail 有效,
//   结局码 o 任意——sup/mut/ok 均为触发面实证)。
// 运行:SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs --timeout=600000 scripts/_run-sfx-hermes-probe.mjs
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5212';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));

await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
chk('?play=small 入场', inGame);
if (!inGame) { console.log(JSON.stringify({ fatal: 'entry timeout', errs: pageErrors.slice(0, 5) })); await browser.close(); process.exit(1); }
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 1500));

// ---- 页内测试体:装备/跑动/录音环采样 ----
const run = async () => {
  const g = window.__swGame;
  const p = g.player;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemsMod = await import('/src/data/items.ts');
  const ITEM_DEFS = itemsMod.ITEM_DEFS;
  const byVid = (v) => { for (let i = 0; i < ITEM_DEFS.length; i++) if (ITEM_DEFS[i]?.vid === v) return i; return -1; };
  const hermes = byVid(54), djinn = byVid(3770);
  if (hermes < 0 || djinn < 0) return { fatal: 'vid 查找失败', hermes, djinn };

  // 清装备(裸装基线)+ 封敌怪
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  g.enemySpawnEnabled = false;
  try { for (const e of g.entities.enemies) e.dead = true; } catch { /* 域差异 */ }
  await wait(400);

  const tail = (n) => window.__swAudioRec?.sfx?.snapshotTail?.(n) ?? [];
  const wavEvents = () => tail(800).filter((e) => e.k === 'wav').map((e) => ({ t: e.t, f: e.d?.f, o: e.d?.o }));
  const runEvents = () => wavEvents().filter((e) => e.f === 'Run' || e.f === 'Item_24' || e.f === 'Item_17');

  const holdKey = async (key, ms) => {
    const el = document.activeElement || document.body;
    el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
    g.input.keys.add(key);
    await wait(ms);
    g.input.keys.delete(key);
    el.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }));
  };
  const KEY_RIGHT = 'KeyD';
  const sampleVx = () => ({ vx: +p.vx.toFixed(2), ground: p.onGround, rs: p.equipStats?.runSpeed ?? -1, acc: p.equipStats?.accRunSpeed ?? -1 });

  // ---- ① 裸装反证:全速跑 1.5s → 零 Run ----
  const bare0 = runEvents().length;
  await holdKey(KEY_RIGHT, 1500);
  const vxSamples = [sampleVx(), sampleVx()];
  await wait(300);
  const bare1 = runEvents().length;
  const bareRun = bare1 - bare0;

  // ---- ② 赫尔墨斯靴:armor[3] 配饰槽 → 冲刺 2.6s → Run 流 ----
  p.inv.armor[3] = { id: hermes, stack: 1 };
  await wait(500);
  const hermes0 = runEvents().length;
  await holdKey(KEY_RIGHT, 2600);
  await wait(300);
  const hermesEv = runEvents().slice(hermes0);
  const hermesRun = hermesEv.filter((e) => e.f === 'Run');
  const hermesBad17 = hermesEv.filter((e) => e.f === 'Item_17');
  const vxHermes = sampleVx();

  // ---- ③ 冷却:相邻 Run tick 差 ----
  const gaps = [];
  for (let i = 1; i < hermesRun.length; i++) gaps.push(hermesRun[i].t - hermesRun[i - 1].t);

  // ---- ④ Djinn's Curse:armor[2] 腿甲槽 → 冲刺 → Item_24 + Run 归零 ----
  p.inv.armor[2] = { id: djinn, stack: 1 };
  await wait(500);
  const djinn0 = runEvents().length;
  await holdKey(KEY_RIGHT, 2600);
  await wait(300);
  const djinnEv = runEvents().slice(djinn0);
  const djinn24 = djinnEv.filter((e) => e.f === 'Item_24');
  const djinnRun = djinnEv.filter((e) => e.f === 'Run');
  const djinnGaps = [];
  for (let i = 1; i < djinn24.length; i++) djinnGaps.push(djinn24[i].t - djinn24[i - 1].t);

  return {
    bareRun, vxSamples, vxHermes,
    hermesCount: hermesRun.length, hermesBad17: hermesBad17.length,
    hermesTicks: hermesRun.map((e) => e.t).slice(0, 12), hermesOutcomes: [...new Set(hermesRun.map((e) => e.o))],
    gapsMin: gaps.length ? Math.min(...gaps) : null,
    djinn24Count: djinn24.length, djinnRunDuring: djinnRun.length,
    djinnTicks: djinn24.map((e) => e.t).slice(0, 10), djinnGapsMin: djinnGaps.length ? Math.min(...djinnGaps) : null,
  };
};
const out = await page.evaluate(run);
console.log(JSON.stringify(out, null, 1));

if (out.fatal) { console.log('FATAL: ' + out.fatal); await browser.close(); process.exit(1); }

chk('① 裸装全速跑零 Run(互斥带空反证)', out.bareRun === 0, `bareRun=${out.bareRun} vx=${out.vxSamples.map((s) => s.vx).join('/')}`);
chk('② 赫尔墨斯靴冲刺出 Run 事件', out.hermesCount > 0, `count=${out.hermesCount} outcomes=${out.hermesOutcomes.join(',')} vx=${out.vxHermes.vx} rs=${out.vxHermes.rs} acc=${out.vxHermes.acc}`);
chk('②-b 零 Item_17 误键残留', out.hermesBad17 === 0, `bad17=${out.hermesBad17}`);
chk('③ Run 冷却 ≥6t', out.gapsMin != null && out.gapsMin >= 6, `minGap=${out.gapsMin} ticks=${out.hermesTicks.join(',')}`);
chk('④ Djinn 换 Item_24', out.djinn24Count > 0, `count24=${out.djinn24Count} ticks=${out.djinnTicks.join(',')}`);
chk('④-b Djinn 期零 Run 覆写生效', out.djinnRunDuring === 0, `runDuring=${out.djinnRunDuring}`);
chk('④-c Item_24 冷却 ≥6t', out.djinnGapsMin == null || out.djinnGapsMin >= 6, `minGap=${out.djinnGapsMin}`);
chk('零页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

console.log('\n==== run-sfx-hermes 判语 ====');
console.log(JSON.stringify({ pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r).length, pageErrors: pageErrors.length }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) && pageErrors.length === 0 ? 0 : 1);
