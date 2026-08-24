// 探针：标题曲自动播放拦截 → 首次点击解锁（端到端）。
// 新鲜无痕 profile 下 AudioContext 无用户激活必挂起 = 真实拦截场景：
//  1. 载入标题屏 → 音乐上下文存在且 state=suspended（被拦截）
//  2. CDP 可信点击（任意位置）→ 解锁监听 resume → state=running
//  3. 点击后仍有新 resume 调用记录（解锁路径真跑了，不是 audio() 旧调用）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();

// 页面脚本运行前钩住 AudioContext：记 resume 调用时间线 + 实例表
await page.evaluateOnNewDocument(() => {
  const instances = [];
  const log = [];
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a);
      instances.push(this);
    }
    resume(...a) {
      log.push({ t: performance.now(), stateBefore: this.state });
      return super.resume(...a);
    }
  };
  window.__acProbe = { instances, log };
});

await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000)); // 等标题屏 + play('title')

const before = await page.evaluate(() => ({
  n: window.__acProbe.instances.length,
  states: window.__acProbe.instances.map((c) => c.state),
  resumes: window.__acProbe.log.length,
  hasTitle: !!document.querySelector('.sw-title-menu'),
}));

// 可信手势：任意位置点击（解锁监听挂 window capture）
await page.mouse.click(640, 400);
await new Promise((r) => setTimeout(r, 1200));

const after = await page.evaluate(() => ({
  states: window.__acProbe.instances.map((c) => c.state),
  resumes: window.__acProbe.log.length,
}));

console.log(JSON.stringify({ before, after }, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(before.hasTitle, '标题屏未出现');
A(before.n >= 1, 'AudioContext 未创建（标题曲未起播）');
A(before.states[0] === 'suspended', `无手势时上下文应挂起（拦截场景未复现）: ${before.states[0]}`);
A(after.states[0] === 'running', `点击后上下文应恢复 running: ${after.states[0]}`);
A(after.resumes > before.resumes, '点击后无新 resume 调用（解锁监听未触发）');
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
