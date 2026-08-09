// 噬魂怪 AI 内部诊断：可控环境下包装 swarmerAI，逐 tick 记录 内部目标速度/实际速度/碰撞状态
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 90000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  window.__swSetPool?.([6]);
  const st = g.world.store;
  const ty = Math.floor(g.world.rockLevel) + 30;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 4;
  for (let dy = -14; dy <= 2; dy++) for (let dx = -40; dx <= 40; dx++) {
    st.setTile(px0 + dx, py0 + dy, dy === 2 ? 2 : 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  // 玩家右侧 12 格、离地 6 格；怪左侧 8 格、离地 6 格（纯空中对飞）
  g.player.x = (px0 + 12) * 16; g.player.y = (py0 - 6) * 16;
  for (let i = 0; i < 2000; i++) g.fixedUpdate(1 / 60);
  let e = g.entities.enemies.find((x) => x.vanilla?.aiStyle === 5 && !x.dead);
  if (!e) return { spawned: 0 };
  e.x = (px0 - 8) * 16; e.y = (py0 - 6) * 16; e.vx = 0; e.vy = 0; e.ai0 = 0;

  // 包装 swarmerAI 记录内部量
  const proto = Object.getPrototypeOf(e);
  const orig = proto.swarmerAI;
  const log = [];
  proto.swarmerAI = function (game, player) {
    const before = { vx: this.vx, vy: this.vy };
    orig.call(this, game, player);
    const p = player ?? { cx: this.cx + this.facing * 100, cy: this.cy - 100 };
    const tx = player ? player.cx : this.cx + this.facing * 100;
    const ty2 = player ? player.cy : this.cy - 100;
    const dx = Math.floor(tx / 8) * 8 - Math.floor(this.cx / 8) * 8;
    const dy = Math.floor(ty2 / 8) * 8 - Math.floor(this.cy / 8) * 8;
    const dist = Math.hypot(dx, dy) || 1;
    const sx = +(dx / dist * 4).toFixed(2), sy = +(dy / dist * 4).toFixed(2);
    if (log.length < 200 && (log.length % 10 === 0 || this.onGround || this.hitWall || this.hitHead)) {
      log.push({ t: log.length, sx, sy, vx: +this.vx.toFixed(2), vy: +this.vy.toFixed(2), g: this.onGround, wall: this.hitWall, head: this.hitHead, ai0: this.ai0 });
    }
  };
  for (let i = 0; i < 300; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
  }
  proto.swarmerAI = orig;
  return { spawned: 1, log, end: { x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), onGround: e.onGround } };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
