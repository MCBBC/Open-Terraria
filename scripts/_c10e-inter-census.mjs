// C10e F-inter 收刀普查(2026-10-01):①opresentInterlayerPending 各触发支分账
// ②真实内容帧 vs 空转帧(谓词真但零落笔)占比=刀①可收面 ③各家族实体量=刀②桥化对象
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const SAMPLES = Number(process.env.CENSUS_N || 240);   // 240×500ms=120s
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, ORIGIN + '/?c10e=1&');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });

// 挂装:家族绘制法计数器(每采样读后清零)+谓词分账
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__census = { draws: { ambience: 0, lanternsNear: 0, balloons: 0, credits: 0 }, frames: 0 };
  const wrap = (obj, name, key) => {
    if (!obj || !obj[name] || obj[name].__w) return;
    const orig = obj[name].bind(obj);
    obj[name] = (...a) => { window.__census.draws[key]++; window.__census.frames++; return orig(...a); };
    obj[name].__w = 1;
  };
  window.__censusArm = () => {
    const r2 = window.__swGame.renderer;
    wrap(r2.sky, 'drawAmbience', 'ambience');
    wrap(r2.sky, 'drawLanternsNear', 'lanternsNear');
    wrap(r2.sky, 'drawPartyBalloonsNear', 'balloons');
  };
  window.__sample = () => {
    const r2 = window.__swGame.renderer;
    const sky = r2.sky;
    const dramaOn = sky.dramaCore !== null || sky.dramaPieces.length > 0 || sky.dramaExplosions.length > 0;
    const pend = {
      lantern: sky.lanternOpacity > 0.001,
      party: !!(sky.fx && sky.fx.party && sky.fx.surfaceY > 0),
      slime: sky.slimeSky.isActive, martin: sky.martianSky.isActive,
      drama: dramaOn,
      ambResident: sky.ambEntities.length > 0,
      ambPendSpawn: sky.pendingAmbientSpawns.length > 0,
      ambTimer: !sky.ambientRemoteDriven && sky.ambNextAttempt <= 2,
    };
    const interNow = r2._c10eWorldToHud;
    const pureNow = r2._c10eFrame;
    const content = sky.ambEntities.length + sky.pendingAmbientSpawns.length +
      (dramaOn ? 1 : 0) + (pend.lantern ? 1 : 0) + (pend.party ? 1 : 0) + (pend.slime ? 1 : 0) + (pend.martin ? 1 : 0);
    const d = window.__census.draws;
    const out = {
      interNow, pureNow, content,
      amb: sky.ambEntities.length, pendSpawn: sky.pendingAmbientSpawns.length,
      draws: { amb: d.ambience, lan: d.lanternsNear, bal: d.balloons },
    };
    window.__census.draws = { ambience: 0, lanternsNear: 0, balloons: 0, credits: 0 };
    window.__census.frames = 0;
    return { pend, out };
  };
  window.__censusArm();
});

const rows = [];
for (let i = 0; i < SAMPLES; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const s = await page.evaluate(() => { window.__censusArm(); return window.__sample(); });
  rows.push(s);
}
// 分账
const agg = {
  total: rows.length,
  inter: rows.filter((r) => r.out.interNow).length,
  pure: rows.filter((r) => r.out.pureNow).length,
  interWithContent: rows.filter((r) => r.out.interNow && r.out.content > 0).length,
  interIdle: rows.filter((r) => r.out.interNow && r.out.content === 0).length,
  byTrigger: {},
  ambResidentFrames: rows.filter((r) => r.pend.ambResident).length,
  ambLenMax: Math.max(...rows.map((r) => r.out.amb)),
  pendSpawnFrames: rows.filter((r) => r.pend.ambPendSpawn).length,
  timerOnlyFrames: rows.filter((r) => r.out.interNow && r.pend.ambTimer && r.out.content === 0 && !r.pend.ambResident && !r.pend.ambPendSpawn && !r.pend.drama && !r.pend.lantern && !r.pend.party && !r.pend.slime && !r.pend.martin).length,
  drawsSum: { amb: 0, lan: 0, bal: 0 },
};
for (const r of rows) for (const k of ['lantern', 'party', 'slime', 'martin', 'drama', 'ambResident', 'ambPendSpawn', 'ambTimer']) if (r.pend[k]) agg.byTrigger[k] = (agg.byTrigger[k] || 0) + 1;
for (const r of rows) { agg.drawsSum.amb += r.out.draws.amb; agg.drawsSum.lan += r.out.draws.lan; agg.drawsSum.bal += r.out.draws.bal; }
console.log(JSON.stringify(agg, null, 1));
console.log('errs:', errs.slice(0, 4));
process.exit(0);
