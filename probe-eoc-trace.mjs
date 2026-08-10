// EoC 首冲异常诊断：逐 tick 追踪 state/aiT/chargesLeft（monkey-patch fixedUpdate）
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
console.log('game ready');

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.9; // 夜
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const boss = Enemy.fromVanilla(4, g.player.cx + 300, g.player.cy - 200);
  boss.id = g.entities.nextId++;
  g.entities.add(boss, 'enemies');
  g.boss = boss;

  // 逐 tick 追踪：只在状态变化或每 25 tick 打点
  const trace = [];
  const orig = Enemy.prototype.fixedUpdate;
  let tick = 0;
  boss.fixedUpdate = function (...args) {
    const prevS = this.state, prevA = this.aiT, prevC = this.chargesLeft;
    const r = orig.apply(this, args);
    tick++;
    if (this.state !== prevS || this.chargesLeft !== prevC || tick % 25 === 0) {
      trace.push({ t: tick, s: this.state, aiT: this.aiT, c: this.chargesLeft, ph: this.phase });
    }
    return r;
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 等 3 连冲结束（state 回 0 且 chargesLeft 清零后；总时长上限 30s 防挂）
  const t0 = Date.now();
  let seenDash = false;
  while (Date.now() - t0 < 30000) {
    await sleep(100);
    if (boss.state === 2) seenDash = true;
    if (seenDash && boss.state === 0) break;
  }
  boss.fixedUpdate = orig;
  return { trace, finalPhase: boss.phase };
});
console.log(JSON.stringify(out));
await b.close();
