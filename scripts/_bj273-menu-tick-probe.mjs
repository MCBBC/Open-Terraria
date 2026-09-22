// BJ273 探针：右键连取 Menu_Tick 音频图逐实例参数记录（预修/修复两态各跑一次比对）。
// 法：document-start 钩 AudioContext.prototype.createGain / AudioBufferSourceNode
// start/stop，逐实例记 (起振时刻, gain 终值, playbackRate, 缓冲时长, 停止时刻)，
// 汇总并发剖面（任一时刻同时在响的实例数）——重叠度=主观响度叠加的直接证据。
// 页面侧直接 import /src/core/Sfx.ts 实例化（__swGame 进世界才有,菜单期不存在;
// 定谳面=playWavFile→slotAction→startBuffer 单点链,与 Game.sfx 同一实现）。
// 模拟两拍面：①加速梯后段节拍 stackDelay=2 拍≈33ms × 14 连发（长按右键连取稳态）；
// ②superFastStack 同帧批发 4 连发（零间隔）。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  protocolTimeout: 120000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => {
  window.__srcLog = [];
  window.__gainLog = [];
  const origStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__srcLog.push({
      ev: 'start', t: performance.now(),
      dur: this.buffer ? this.buffer.duration : null,
      rate: this.playbackRate.value,
    });
    return origStart.apply(this, a);
  };
  const origStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...a) {
    window.__srcLog.push({ ev: 'stop', t: performance.now() });
    return origStop.apply(this, a);
  };
  const origGain = AudioContext.prototype.createGain;
  AudioContext.prototype.createGain = function (...a) {
    const g = origGain.apply(this, a);
    // microtask 捕获终值：startBuffer 在同一同步块内建源→设 gain→start，
    // 微任务在该任务末尾触发，值即该实例最终音量（不受页面 BGM 淡入等
    // 异步 gain 写入干扰——那些发生在各自任务里）
    queueMicrotask(() => {
      window.__gainLog.push({ t: performance.now(), v: g.gain.value });
    });
    return g;
  };
});
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5218', {
  waitUntil: 'domcontentloaded', timeout: 60000,
});

const out = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mod = await import('/src/core/Sfx.ts');
  const sfx = new mod.Sfx();
  sfx.master = 1;
  // 预热：首播走补播通道，等解码完成排除噪声
  const first = sfx.playWavFile('Menu_Tick', 1);
  for (let i = 0; i < 40 && !(sfx['buffers']?.has('Menu_Tick')); i++) await wait(100);
  await wait(300);
  window.__srcLog.length = 0;
  window.__gainLog.length = 0;
  // ① 加速梯稳态节拍：33ms × 14
  for (let i = 0; i < 14; i++) { sfx.playWavFile('Menu_Tick', 1); await wait(33); }
  // ② superFastStack 同帧批发：零间隔 4 连发
  for (let i = 0; i < 4; i++) sfx.playWavFile('Menu_Tick', 1);
  await wait(500);
  const ctx = sfx['ctx'];
  return { first, ctxState: ctx ? ctx.state : 'none', src: window.__srcLog, gain: window.__gainLog };
});
await browser.close();

// ---- 汇总：逐实例表 + 并发剖面 ----
const { src, gain } = out;
const starts = src.filter((e) => e.ev === 'start');
const stops = src.filter((e) => e.ev === 'stop');
console.log(`ctx=${out.ctxState} firstOutcome=${out.first}`);
console.log(`gain sets: ${gain.length}, unique values: ${[...new Set(gain.map((g) => Math.round(g.v * 1000) / 1000))].join(', ')}`);
console.log(`instances: ${starts.length} start / ${stops.length} stop`);
console.log(`rates: ${[...new Set(starts.map((s) => s.rate))].join(', ')} | durations: ${[...new Set(starts.map((s) => s.dur))].join(', ')}`);
const base = starts[0] ? starts[0].t : 0;
console.log('--- per-instance table (tRel ms | dur | gain | stopAt) ---');
const stopTimes = stops.map((s) => s.t);
for (let i = 0; i < starts.length; i++) {
  const s = starts[i];
  const myStop = stopTimes.filter((t) => t >= s.t).sort((a, b) => a - b)[0];
  const g = gain.find((x) => x.t >= s.t - 1 && x.t <= s.t + 50);
  console.log(`#${String(i + 1).padStart(2)} t=+${Math.round(s.t - base)}ms dur=${s.dur != null ? (s.dur * 1000).toFixed(0) : '?'}ms gain=${g ? g.v : '?'} rate=${s.rate} stopAt=${myStop ? '+' + Math.round(myStop - base) + 'ms' : 'natural'}`);
}
// 并发剖面：逐实例存活区间 [start, stop|start+dur]，5ms 步进
const spans = starts.map((s) => {
  const myStop = stopTimes.filter((t) => t >= s.t).sort((a, b) => a - b)[0];
  return [s.t, myStop ?? s.t + (s.dur ?? 0.1) * 1000];
});
let peak = 0; let endOfBatch1 = 0; let batch1Peak = 0;
for (let t = base; t <= base + 1300; t += 5) {
  const c = spans.filter(([a, b]) => t >= a && t < b).length;
  peak = Math.max(peak, c);
  if (t <= base + 14 * 33 + 300) { batch1Peak = Math.max(batch1Peak, c); endOfBatch1 = c; }
}
console.log(`concurrent: batch1(33ms×14) peak=${batch1Peak} end=${endOfBatch1} | overall peak=${peak} (batch2 zero-gap tail)`);
