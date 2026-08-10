// 白天驱散 E2E：僵尸(3)/恶魔眼(2)/噬魂怪(6) 在白天地表的行为对照原版：
// 僵尸:停止追击+游荡,屏内不死,离屏 ~10t 消失(EncourageDespawn(10))
// 恶魔眼:EncourageDespawn(10)+保持水平方向上飞,离屏消失
// 噬魂怪:原版无白天处理 → 屏内照常,离屏 750t 消
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 800, height: 600 });
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const px = g.player.cx, py = g.player.cy;
  const mk = (id, dx, dy) => {
    const e = Enemy.fromVanilla(id, px + dx, py + dy);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    return e;
  };
  // 僵尸 40px 外(屏内),眼 60px 外上方,噬魂怪 80px 外
  const z = mk(3, 40, 0);
  const eye = mk(2, -60, -60);
  const eater = mk(6, 80, -40);

  // 先夜晚观察 60t：僵尸应朝玩家走(追击)
  g.world.clock.timeOfDay = 0.5; // 白天? 0.5=正午。先设夜晚 0.9
  g.world.clock.timeOfDay = 0.9;
  const z0 = z.cx;
  await sleep(1000);
  const nightChase = Math.abs(z.cx - z0) > 4 && Math.abs(z.cx - px) < Math.abs(z0 - px);

  // 切白天
  g.world.clock.timeOfDay = 0.5;
  await sleep(100); // 6t
  const dayState = {
    zEncouraged: z.despawnEncouraged,
    zTimer: z.despawnTimer,
    eyeEncouraged: eye.despawnEncouraged,
    eyeVy: +eye.vy.toFixed(2),
    eaterEncouraged: eater.despawnEncouraged,
  };
  // 屏内存活 3s(180t):timeLeft 应被重置、不消失
  await sleep(3000);
  const onScreenSurvive = {
    zAlive: !z.dead, zTimer: z.despawnTimer, zVx: +z.vx.toFixed(2),
    eyeAlive: !eye.dead,
    eaterAlive: !eater.dead,
  };
  // 僵僵白天应不再贴近玩家(游荡不追):记录与玩家距离变化
  const zDistDay = Math.abs(z.cx - px);
  // 离屏:瞬移玩家到远处(屏矩形 62x35 格外)
  g.player.x = px + TILE0() * 200; g.player.y = py;
  function TILE0() { return 16; }
  await sleep(100); // ~6t
  const offScreenSoon = { zAlive: !z.dead, zTimer: z.despawnTimer, eyeAlive: !eye.dead };
  await sleep(1000); // 60t
  const offScreenGone = { zAlive: !z.dead, eyeAlive: !eye.dead, eaterAlive: !eater.dead };
  return { nightChase, dayState, onScreenSurvive, zDistDay, offScreenSoon, offScreenGone };
});
console.log(JSON.stringify(out));
await b.close();
