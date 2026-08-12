// 阳炎之怒(vi_220_sunfury, flail)使用链路探针:
// 复现"按住鼠标掷出后链球立刻消失":
//   - 真实浏览器语义:按住 = 只发一次 mousedown 事件,无后续事件
//   - useCombatWeapon case 'flail' 掷出后置 input.mouseDown=false(消费 click)
//   - YoyoProj.channel 回调依赖 input.mouseDown → 恒 false → 回收分支 1 帧即死
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -20; dx <= 20; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -20; dx <= 20; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  // 装备阳炎之怒
  const sunfuryId = window.__swItems['vi_220_sunfury'];
  g.player.inv.add(sunfuryId, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === sunfuryId);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  // 确保在第 0 格被选中
  const held = g.player.inv.heldItem();
  const heldKey = held && held.id === sunfuryId ? 'vi_220_sunfury' : `heldId=${held?.id}`;
  g.player.useTime = 0;

  const res = { heldKey, spawn: null, aliveAfter: {}, posSeries: [] };
  // 模拟真实按住:只置一次 mouseDown(真实世界无重复 mousedown 事件),之后不再置
  g.input.mouseX = 640 + 300; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 60; i++) {
    g.fixedUpdate(1 / 60);
    const flails = g.entities.projectiles.filter((p) => p.projId === 35);
    if (flails.length && !res.spawn) res.spawn = { frame: i, x: +flails[0].x.toFixed(1), dead: flails[0].dead };
    if (res.spawn && i >= res.spawn.frame) {
      res.aliveAfter[i - res.spawn.frame] = { dead: flails[0]?.dead ?? true, count: flails.length };
      if (i - res.spawn.frame <= 6 && flails[0]) res.posSeries.push({ f: i - res.spawn.frame, x: +flails[0].x.toFixed(1), y: +flails[0].y.toFixed(1), vx: +flails[0].vx.toFixed(2), vy: +flails[0].vy.toFixed(2) });
    }
  }
  const fin = g.entities.projectiles.filter((p) => p.projId === 35);
  res.finalCount = fin.length;
  res.finalDead = fin[0]?.dead ?? true;
  res.inputMouseDown = g.input.mouseDown;
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('装备物品为 vi_220_sunfury', out.heldKey === 'vi_220_sunfury', `got=${out.heldKey}`);
check('掷出链球(projid 35 生成)', !!out.spawn, out.spawn ? `frame=${out.spawn.frame}` : '');
const survived = Object.entries(out.aliveAfter).filter(([, v]) => !v.dead).length;
check('按住期间链球存活 >30 帧(channel 生效)', survived > 30, `存活帧=${survived}/60 finalDead=${out.finalDead}`);
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
