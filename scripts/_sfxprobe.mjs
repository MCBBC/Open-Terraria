// 进世界音效爆发诊断 + 断言（2026-08-13 修复批）：
//  patch Sfx 原型记录全部 playWavFile/play 调用（文件、音量、坐标、tick、suppress 态、
//  调用栈），跑完四断言，任一失败 exit 1（可进 CI/回归）。SW_ORIGIN 指 dev server。
//  断言口径只数 !suppressed 条目（suppressed 留痕仅供诊断——证明载入窗被静音门盖住）。
//  1. 载入窗（tick===0，fixedUpdate 未跑）非抑制播放数 === 0（主诉：进世界音效爆发）
//  2. 全部 chop（play 逻辑名 + playWavFile 文件名 Grass）必须带坐标
//  3. npcLiquid 入水 splash 带坐标（页内合成：全新 TileStore 干→湿两 tick + 录音
//     playSfx，并断言去抖不重播）；运行期日志中所有 splash 亦带坐标
//  4. 液体合并音（liquids_*/Splash_4 逻辑名）任一 tick 合计 ≤ 2
import puppeteer from 'puppeteer-core';

const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const check = (ok, label) => { if (!ok) fails.push(label); };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(origin, { waitUntil: 'networkidle0', timeout: 120000 });

// ---- 先装探针（世界创建前）----
await page.evaluate(() => {
  const { Sfx } = await import('/src/core/Sfx.ts');
  const { Game } = await import('/src/core/Game.ts');
  window.__tileLog = [];
  const origBT = Game.prototype.breakTile;
  Game.prototype.breakTile = function (x, y) {
    if (window.__tileLog.length < 25) window.__tileLog.push({ x, y, t: performance.now() | 0, stack: new Error().stack?.split('\n').slice(1, 4).map((s) => s.trim()).join(' <- ') });
    return origBT.call(this, x, y);
  };
  window.__sfxLog = [];
  // 记录在 orig 之前：被 suppress 短路的调用也留痕（suppressed=true），断言只数 !suppressed
  const rec = (e) => { e.tick = window.__swGame?.tickCount ?? 0; window.__sfxLog.push(e); };
  const origWav = Sfx.prototype.playWavFile;
  Sfx.prototype.playWavFile = function (file, vol, x, y) {
    rec({ t: performance.now() | 0, file, vol, x, y, suppressed: !!this.suppress, stack: new Error().stack?.split('\n')[2]?.trim().slice(0, 90) });
    return origWav.call(this, file, vol, x, y);   // 坐标必须透传（旧版丢坐标在破坏衰减）
  };
  const origPlay = Sfx.prototype.play;
  Sfx.prototype.play = function (name, vol, x, y) {
    rec({ t: performance.now() | 0, name, vol, x, y, suppressed: !!this.suppress, stack: new Error().stack?.split('\n')[2]?.trim().slice(0, 90) });
    return origPlay.call(this, name, vol, x, y);
  };
});

// ---- 进世界 ----
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 4000));

// ---- 断言 3 前置：页内合成触发 npcLiquid 入水 splash（全新 TileStore，不碰真实世界） ----
const npcAssert = await page.evaluate(async () => {
  const { TileStore } = await import('/src/world/TileStore.ts');
  const { TILE } = await import('/src/core/constants.ts');
  const npcLiquid = await import('/src/entities/npcLiquid.ts');
  const st = new TileStore(60, 256);
  st.setLiquid(20, 21, 255, 1);            // host 盒底跨入的一格满水（行 21）
  const host = { x: 20 * TILE, y: 20 * TILE, w: 18, h: 40, vx: 0, vy: 0,
    cx: 20 * TILE + 9, cy: 20 * TILE + 20, vanillaId: 3, vanilla: { aiStyle: 3 }, ai0: 0,
    wet: false, wetCount: 0, honeyWet: false, shimmerWet: false, lavaWet: false,
    lavaCd: 0, onFireT: 0, onFire3T: 0, inWater: false, liqFactor: 1,
    def: { boss: false }, hurt: () => {} };
  const rec = [];
  const fakeGame = { player: { cx: 0, cy: 0, dead: false },
    playSfx: (n, v, x, y) => rec.push({ n, v, x, y }), spawnParticles: () => {} };
  npcLiquid.updateNpcLiquid(host, fakeGame, st);   // tick1：干→湿 → splash 一声
  npcLiquid.updateNpcLiquid(host, fakeGame, st);   // tick2：已湿 → 去抖不重播
  return { rec, wet: host.wet, cx: host.cx, cy: host.cy };
});

// ---- 运行期日志聚合 ----
const out = await page.evaluate(() => {
  const log = window.__sfxLog;
  const t0 = log.length ? log[0].t : 0;
  const live = log.filter((l) => !l.suppressed);
  const noCoord = (l) => l.x == null || l.y == null;
  const LIQ = ['liquidWaterLava', 'liquidHoneyWater', 'liquidHoneyLava', 'shimmerSplash'];
  // 液体合并音只数 play 逻辑名层（playWavFile 条目是同一次播放的 wav 层留痕，会双计）
  const perTick = new Map();
  for (const l of live) {
    if (LIQ.includes(l.name)) perTick.set(l.tick, (perTick.get(l.tick) ?? 0) + 1);
  }
  const worst = [...perTick.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  return {
    total: log.length, live: live.length, suppressed: log.length - live.length,
    loadPlays: live.filter((l) => l.tick === 0).length,                       // 断言 1
    chopNoCoord: live.filter((l) => (l.name === 'chop' || l.file === 'Grass') && noCoord(l)),  // 断言 2
    splashNoCoord: live.filter((l) => (l.name === 'splash' || /^Splash_[0-3]$/.test(l.file ?? '')) && noCoord(l)), // 断言 3b
    worstTick: worst[0], worstLiq: worst[1],                                  // 断言 4
    sfx: log.slice(0, 20).map((l) => ({ dt: l.t - t0, file: l.file ?? l.name, vol: l.vol, x: l.x, y: l.y, tick: l.tick, sup: l.suppressed, from: l.stack })),
    tiles: window.__tileLog.slice(0, 8),
  };
});
await browser.close();

// ---- 四断言（主诉在前） ----
check(out.loadPlays === 0, `断言1 载入窗(tick0)非抑制播放=${out.loadPlays}（应为 0）`);
check(out.chopNoCoord.length === 0, `断言2 无坐标 chop=${out.chopNoCoord.length} 条（全 chop 须带格坐标）`);
check(npcAssert.wet === true, '断言3 host 未入水（wet=false，合成触发失败）');
check(npcAssert.rec.length === 1 && npcAssert.rec[0].n === 'splash'
  && npcAssert.rec[0].x === npcAssert.cx && npcAssert.rec[0].y === npcAssert.cy,
  `断言3 npcLiquid splash 坐标：期望 1 条 splash@(${npcAssert.cx},${npcAssert.cy})，实际 ${JSON.stringify(npcAssert.rec)}（两 tick 仅一声 = 去抖）`);
check(out.splashNoCoord.length === 0, `断言3 运行期 splash 无坐标=${out.splashNoCoord.length} 条`);
check(out.worstLiq <= 2, `断言4 液体合并音最忙 tick=${out.worstTick} 共 ${out.worstLiq} 声（应 ≤2）`);

console.log(JSON.stringify({ ...out, npcLiquid: npcAssert }, null, 1));
if (fails.length) { console.error('SFXPROBE FAIL:', fails.join(' | ')); process.exit(1); }
console.log('SFXPROBE PASS: 4 断言全过');
