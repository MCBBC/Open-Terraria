// ★IIIII223 探针①（F-1/F-4 生成屏背景动效清偿验收）：
//   F-1 remix 背景漂移嵌套修正（Main.cs:20013-20018 `-20` 嵌套在 if(drunkWorldGen) 内）——
//       纯 remix(dontdigup 旗标注入)/纯 drunk → camX 净 +4/帧（不漂移）；
//       天顶(drunk∧remix 旗标注入) → 净 -16/帧（漂移）。218 批曾对任何 remix 生成漂移。
//   F-4 云型 onlyShimmerOceanWorlds=29 首支（Cloud.cs:352-388 + Main.cs:2758-2769）——
//       drunk+tenth∧!remix∧!zenith∧!ntb → 29；+ntb → 28；天顶全旗 → 25/26（getGood 支）；
//       tenth 单旗（无 drunk）→ 无强制（自然云,无 29）。
// 旗标注入走 MenuBackground.setGenFlags（公开口,mainFlow 同款），零世界生成零掷流耦合。
// 运行：SW_ORIGIN=http://localhost:5279 node tools/run-diag.mjs --timeout=600000 scripts/_iii223-menubg.mjs
// 产物：/tmp/iii223-out/menubg-report.json
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5279';
const OUT = '/tmp/iii223-out';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!globalThis.__swMenuBg?.genAnimDebug, { timeout: 180000 });
try { await page.bringToFront(); } catch { /* noop */ }

/** GenScreenSeedFlags 全量形（undefined 字段=语义 false,但显式给全防读侧发散） */
const F = (o) => ({
  drunkWorldGenText: false, zenithWorld: false, getGoodWorldGen: false, notTheBees: false,
  noTrapsWorldGen: false, tenthAnniversaryWorldGen: false, vampireSeed: false,
  drunkWorldGen: false, remixWorldGen: false, dontStarveWorldGen: false, ...o,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = [];
const chk = (name, ok, extra = '') => { R.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };

// ── F-4 云型支 ──
const sampleClouds = async (flags, settleMs = 1600) => {
  await page.evaluate((f) => { globalThis.__swMenuBg.setPaused(false); globalThis.__swMenuBg.setGenFlags(f); }, flags);
  await sleep(settleMs);
  const d = await page.evaluate(() => {
    const dbg = globalThis.__swMenuBg.genAnimDebug();
    return { cloudTypes: dbg.cloudTypes, cloudTarget: dbg.cloudTarget };
  });
  await page.evaluate(() => globalThis.__swMenuBg.setGenFlags(null));
  await sleep(120);
  return d;
};

{
  const d = await sampleClouds(F({ drunkWorldGen: true, drunkWorldGenText: true, tenthAnniversaryWorldGen: true }));
  const uniq = [...new Set(d.cloudTypes)];
  chk('F4a drunk+tenth∧!remix∧!zenith∧!ntb → 云型 29（onlyShimmerOceanWorlds 首支）',
    uniq.length === 1 && uniq[0] === 29, `types=${JSON.stringify(uniq)} target=${d.cloudTarget}`);
}
{
  const d = await sampleClouds(F({ drunkWorldGen: true, drunkWorldGenText: true, tenthAnniversaryWorldGen: true, notTheBees: true }));
  const uniq = [...new Set(d.cloudTypes)];
  chk('F4b 同组合+notTheBees → 28（getter 内 !notTheBeesWorldWorld 臂）',
    uniq.length === 1 && uniq[0] === 28, `types=${JSON.stringify(uniq)}`);
}
{
  const d = await sampleClouds(F({
    drunkWorldGen: true, drunkWorldGenText: true, tenthAnniversaryWorldGen: true, notTheBees: true,
    noTrapsWorldGen: true, zenithWorld: true, remixWorldGen: true, getGoodWorldGen: true, dontStarveWorldGen: true, vampireSeed: true,
  }));
  const uniq = [...new Set(d.cloudTypes)];
  // 天顶七依赖含 DontStarve（iii219 饥饿链测试头注同款定谳）→ dontStarve 支(37-40)
  // 先于 getGood——vanilla 序 shimmer29→dontStarve→getGood→28 的正确落点,断言=非 29
  chk('F4c 天顶全旗 → dontStarve 支 37-40（remix/zenith 排除 29 首;含 theConstant）',
    uniq.length >= 1 && uniq.every((t) => t === 37 || t === 38 || t === 39 || t === 40),
    `types=${JSON.stringify(uniq)}`);
}
{
  const d = await sampleClouds(F({ tenthAnniversaryWorldGen: true }));
  chk('F4d tenth 单旗（drunk=false）→ 无强制、无 29（getter 首条件 drunkWorld 不满足）',
    d.cloudTarget === null && !d.cloudTypes.includes(29),
    `types=${JSON.stringify([...new Set(d.cloudTypes)])} target=${d.cloudTarget}`);
}

// ── F-1 漂移双态 ──
const sampleDrift = async (flags, windowMs = 3000) => {
  await page.evaluate((f) => { globalThis.__swMenuBg.setPaused(false); globalThis.__swMenuBg.setGenFlags(f); }, flags);
  await sleep(400);
  const x0 = await page.evaluate(() => globalThis.__swMenuBg.genAnimDebug().camX);
  await sleep(windowMs);
  const x1 = await page.evaluate(() => globalThis.__swMenuBg.genAnimDebug().camX);
  await page.evaluate(() => globalThis.__swMenuBg.setGenFlags(null));
  await sleep(120);
  return { delta: x1 - x0, windowMs };
};
const FRAMES = (ms) => ms / 16.6667;

{
  const d = await sampleDrift(F({ remixWorldGen: true }));
  const expect = 4 * FRAMES(d.windowMs);           // 纯 +4/帧 MenuXMovement
  chk('F1a 纯 remix(dontdigup 旗) → 不漂移（camX 净 +4/帧;218 批旧态 -16/帧）',
    d.delta > 0 && Math.abs(d.delta - expect) < expect * 0.45,
    `delta=${d.delta}px expect≈${expect.toFixed(0)}px win=${d.windowMs}ms`);
}
{
  const d = await sampleDrift(F({ drunkWorldGen: true, drunkWorldGenText: true }));
  const expect = 4 * FRAMES(d.windowMs);
  chk('F1b 纯 drunk(05162020 旗) → 不漂移（drunk 单旗不在 -20 嵌套内）',
    d.delta > 0 && Math.abs(d.delta - expect) < expect * 0.45,
    `delta=${d.delta}px expect≈${expect.toFixed(0)}px`);
}
{
  const d = await sampleDrift(F({
    drunkWorldGen: true, drunkWorldGenText: true, tenthAnniversaryWorldGen: true, notTheBees: true,
    noTrapsWorldGen: true, zenithWorld: true, remixWorldGen: true, getGoodWorldGen: true, dontStarveWorldGen: true, vampireSeed: true,
  }), 3000);
  const expect = -16 * FRAMES(d.windowMs);         // 天顶：-20+4 净 -16/帧
  chk('F1c 天顶(drunk∧remix 全旗) → 净 -16/帧 漂移（vanilla Main.cs:20013-20018 嵌套）',
    d.delta < 0 && Math.abs(d.delta - expect) < Math.abs(expect) * 0.45,
    `delta=${d.delta}px expect≈${expect.toFixed(0)}px`);
}

writeFileSync(`${OUT}/menubg-report.json`, JSON.stringify({ R, errs }, null, 2));
const fails = R.filter((r) => !r.ok);
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 10).join('\n'));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
