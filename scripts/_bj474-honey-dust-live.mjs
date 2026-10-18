// ★BJ474 蜂蜜中跑动绿叶尘·第三轮真机探针（2026-10-03）：
//  注入用户世界存档(map-天真的钴最高点 (3).json=sandboxworld.save)→?quickload 载入
//  →传送至行为日志定位的蜜洼现场(tile 3113-3115,y=307,liquid 85/255 type3 坐草坑)
//  →KeyA/KeyD 往复跑动复现用户操作→双口统计尘(vanillaDust.spawn 池底+spawnParticles
//  层)+录尘 type/fx,fy/scale/alpha/color/坐标/玩家湿态/wetCount。
//  臂 A=素跑;臂 B=OnFire 状态(用户首截图着火)。
// 运行:SW_ORIGIN=http://localhost:5203 SAVE='~/Downloads/map-天真的钴最高点 (3).json' \
//   node tools/run-diag.mjs scripts/_bj474-honey-dust-live.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const SAVE_PATH = process.env.SAVE || needInput(join(DOWNLOADS, 'map-天真的钴最高点 (3).json'));
const saveJson = readFileSync(SAVE_PATH, 'utf8');
console.log('save json bytes:', saveJson.length);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PE: ' + e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text().slice(0, 200)); });

// ---- 注入存档（kv 快速存档槽）----
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
// 预种欢迎覆层 ack（未 ack=覆层堆叠,可能挡键入/暂停）
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
const how = await page.evaluate(async (text) => {
  const m = await import('/src/save/KvStore.ts');
  await m.kvDelete('sandboxworld.worlds.index');
  for (let i = 1; i <= 8; i++) await m.kvDelete(`sandboxworld.world.${i}`);
  return m.kvSet('sandboxworld.quicksave', text);
}, saveJson);
console.log('kvSet →', how);

const qs = 'quickload=1&t=' + Date.now();
await page.goto(ORIGIN + '/?' + qs, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
// 等 __swFlow 就绪（boot 序列早段建 flow;音频门/资产暖机不阻塞 flow 对象存在）
let flowReady = false;
for (let i = 0; i < 60; i++) {
  flowReady = await page.evaluate(() => !!window.__swFlow).catch(() => false);
  if (flowReady) break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log('flowReady:', flowReady);
// 直接手动 quickLoad（boot 旁路被音频门挡时仍可用）;120s 竞速防挂死
const manual = await page.evaluate(() => new Promise((resolve) => {
  const w = window;
  if (w.__swGame?.world?.store) return resolve({ skip: true });
  const flow = w.__swFlow;
  if (!flow || typeof flow.quickLoad !== 'function') return resolve({ noFlow: true });
  const to = setTimeout(() => resolve({ timeout: true }), 120000);
  Promise.resolve(flow.quickLoad()).then(
    () => { clearTimeout(to); resolve({ ok: true }); },
    (e) => { clearTimeout(to); resolve({ err: String(e?.stack || e).slice(0, 600) }); },
  );
}));
console.log('manual quickLoad:', JSON.stringify(manual));
const t0 = Date.now(); let ok = false; let lastState = '';
while (Date.now() - t0 < 300000) {
  const st = await page.evaluate(() => ({
    game: !!window.__swGame, world: !!window.__swGame?.world,
    store: !!window.__swGame?.world?.store,
  })).catch(() => ({ err: 'eval' }));
  lastState = JSON.stringify(st);
  ok = st.game && st.world && st.store;
  if (ok) break;
  if (Date.now() - t0 < 25000 || Date.now() - t0 > 250000) console.log('wait', lastState, errs.slice(-2).join('|'));
  await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.log('stuck:', lastState, page.url()); throw new Error('quickload-timeout'); }
const clearOverlays = () => page.evaluate(() => {
  const re = /我知道了|我已知晓|确定|知道了/;
  for (const b of document.querySelectorAll('button')) if (re.test(b.textContent || '')) b.click();
});
await clearOverlays();
console.log('game loaded');

// ---- 场景核实+双口钩子 ----
const scene = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const W = st.w;
  const cell = (x, y) => { const i = st.idx(x, y); return [st.type[i], st.liquid[i], st.liquidType[i]]; };
  // 蜜洼 tile 3113-3115,307
  const pud = [];
  for (let x = 3110; x <= 3118; x++) pud.push([x, cell(x, 307)]);
  const below = [];
  for (let x = 3110; x <= 3118; x++) below.push([x, cell(x, 308)]);
  return { playerTile: [Math.floor(g.player.x / 16), Math.floor(g.player.y / 16)], pud, below,
    tick: g.tickCount, hasVd: !!(g.renderer && g.renderer.vanillaDust) };
});
console.log('scene:', JSON.stringify(scene));

const hookRes = await page.evaluate(() => {
  const g = window.__swGame;
  const rec = [];
  window.__bj474 = { rec, g };
  // ① vanillaDust 池底
  const vd = g.renderer.vanillaDust;
  if (!vd) return { vd: false };
  const origSpawn = vd.spawn.bind(vd);
  vd.__bjOrig = origSpawn;
  vd.spawn = function (...a) {
    const d = origSpawn(...a);
    if (d) {
      rec.push({
        t: g.tickCount, ch: 'vd', type: a[4], bx: Math.round(a[0]), by: Math.round(a[1]), bw: a[2], bh: a[3],
        x: Math.round(d.x), y: Math.round(d.y), vx: +d.vx.toFixed(2), vy: +d.vy.toFixed(2),
        scale: +(+d.scale).toFixed(2), alpha: d.alpha, noG: !!d.noGravity, fx: d.fx, fy: d.fy,
        color: d.color ? { r: d.color.r, g: d.color.g, b: d.color.b, a: d.color.a } : null,
        pl: { x: Math.round(g.player.x), y: Math.round(g.player.y), vx: +g.player.vx.toFixed(2), vy: +g.player.vy.toFixed(2),
          wet: !!g.player.wetSticky, wc: g.player.wetCount, inW: !!g.player.inWater, inH: !!g.player.inHoney, onG: !!g.player.onGround },
      });
    }
    return d;
  };
  // ② spawnParticles 层
  const origSP = g.spawnParticles.bind(g);
  g.spawnParticles = function (x, y, color, n, speed, opts) {
    rec.push({ t: g.tickCount, ch: 'sp', x: Math.round(x), y: Math.round(y), color, n, speed,
      opts: opts ? JSON.parse(JSON.stringify(opts)) : null,
      pl: { x: Math.round(g.player.x), y: Math.round(g.player.y), vx: +g.player.vx.toFixed(2) } });
    return origSP(x, y, color, n, speed, opts);
  };
  // ③ spawnDust 门面（Game 级,供归因;池底①会重复记录,按 type+tick 关联）
  const origSD = g.spawnDust.bind(g);
  g.spawnDust = function (...a) {
    rec.push({ t: g.tickCount, ch: 'sd', type: a[4], bx: Math.round(a[0]), by: Math.round(a[1]) });
    return origSD(...a);
  };
  return { vd: true, poolCap: vd.pool ? vd.pool.length : -1 };
});
console.log('hooks:', JSON.stringify(hookRes));

// ---- 传送+跑动复现 ----
const runArm = async (label, useFire) => {
  await clearOverlays();
  await page.evaluate((useFire) => {
    const { g, rec } = window.__bj474;
    rec.push({ t: g.tickCount, mark: 'arm-start', fire: useFire });
    // 传送：洼坑左侧草台（tile 3111 顶,y=307 行 4912→player.y = 4912-42 = 4870）
    const p = g.player;
    p.x = 3111 * 16 + 8 - p.w / 2;
    p.y = 307 * 16 - p.h;
    p.vx = 0; p.vy = 0;
    if (useFire) p.buffs.apply(24, 30);   // OnFire 30s
  }, useFire);
  // 往复跑动 22s：右 0.75s → 左 0.75s（穿过 3 格蜜洼来回）
  const kev = (type, code) => page.evaluate(({ type, code }) => {
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, keyCode: code === 'KeyA' ? 65 : 68, which: code === 'KeyA' ? 65 : 68 }));
  }, { type, code });
  for (let i = 0; i < 15; i++) {
    await kev('keydown', 'KeyD'); await new Promise((r) => setTimeout(r, 760)); await kev('keyup', 'KeyD');
    await new Promise((r) => setTimeout(r, 40));
    await kev('keydown', 'KeyA'); await new Promise((r) => setTimeout(r, 760)); await kev('keyup', 'KeyA');
    await new Promise((r) => setTimeout(r, 40));
  }
  const summary = await page.evaluate((label) => {
    const { rec, g } = window.__bj474;
    void label;
    const byKind = {};
    for (const e of rec) {
      if (e.mark) continue;
      const k = e.ch === 'vd' ? `vd:${e.type}` : e.ch === 'sp' ? `sp:${e.color}` : 'sd';
      byKind[k] = (byKind[k] || 0) + 1;
    }
    // 玩家轨迹抽样（每 arm 尾）
    const p = g.player;
    return { label, n: rec.length, byKind, playerEnd: { x: Math.round(p.x), y: Math.round(p.y), wet: p.wetSticky, wc: p.wetCount, inH: p.inHoney, fire: p.buffs?.has?.(24) ?? false } };
  }, label);
  console.log('arm', label, JSON.stringify(summary));
  return summary;
};

const a = await runArm('A-plain', false);
const b = await runArm('B-onfire', true);

// ---- 导出全量记录 ----
const dump = await page.evaluate(() => window.__bj474.rec);
writeFileSync('/tmp/bj474-live-dust.json', JSON.dump ? null : JSON.stringify(dump, null, 1));
console.log('dumped', dump.length, 'records → /tmp/bj474-live-dust.json');
console.log('page errors:', errs.slice(-6).join(' | ') || 'none');
await page.screenshot({ path: '/tmp/bj474-live-scene.png' });
await browser.close();
