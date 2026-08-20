// 史莱姆染色 1:1 验证：
// 1) 蓝史莱姆(1) 中心像素明显偏蓝（color=(0,80,255,100) 二次绘制生效）
// 2) 轮廓合成：染色 pass 严格限制在精灵形状内（采样点在精灵包围盒角落=背景色，非色块）
// 3) 凝胶掉落继承怪物色：打死史莱姆后 gel 掉落带 color
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  // 地表观测台：px0 列真实地表（从顶向下找首个实心格），台子搭在地表上方开阔天空
  let surf = 8;
  while (surf < st.h - 20 && !st.isSolid(px0, surf)) surf++;
  const py0 = surf - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -40; dx <= 40; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -40; dx <= 40; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  g.player.x = (px0 + 10) * 16; g.player.y = (py0 - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy; // 相机直接贴主角，不等缓动
  g.world.clock.timeOfDay = 0.5; // 正午亮背景
  window.__swSetPool?.([1]);
  for (let i = 0; i < 3000; i++) { g.fixedUpdate(1 / 60); if (g.player.hp < 60) g.player.hp = g.player.maxHp; }
  const slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead);
  if (!slime) return { slime: 0 };
  // NPC_1.png 懒加载等待:下方 60 次同步 fixedUpdate 阻塞事件循环,onload 无机会
  // 触发——不等待则 vnpc 恒 null,史莱姆整帧不画,染色采样全取到天空色(2026-08-20)
  for (let i = 0; i < 100 && !g.renderer.atlas.vimages.has('vanilla/NPC_1.png'); i++) {
    g.renderer.atlas.vnpc(1, 0);
    await new Promise((r) => setTimeout(r, 100));
  }
  slime.x = g.player.cx - 60; slime.y = (py0 - 4) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.ai0 = -1120; // 钳住 hop
  for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const sample = (wx, wy, n = 7) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const im = ctx.getImageData(Math.round(sx) - (n >> 1), Math.round(sy) - (n >> 1), n, n).data;
    let r = 0, gg = 0, b = 0;
    for (let j = 0; j < im.length; j += 4) { r += im[j]; gg += im[j + 1]; b += im[j + 2]; }
    const c = im.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c)];
  };
  const at = () => sample(slime.cx, slime.cy, 9);
  // 自参照：同步强制渲染后采样（不依赖 RAF）
  slime.colorRGBA = [0, 80, 255, 100]; slime.spawnAlpha = 175;
  g.render();
  const blue = at();
  const corner = sample(slime.x - 10, slime.y - 10, 7);
  slime.colorRGBA = null; slime.spawnAlpha = 0;
  g.render();
  const plain = at();
  // 杀怪验凝胶染色
  g.player.x = slime.cx + 400; g.player.y = slime.y;
  slime.iframes = 0;
  slime.colorRGBA = [0, 80, 255, 100];
  slime.hurt(9999, 0, 0, g);
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  const allDrops = g.entities.drops.map((d) => d.itemId);
  const colored = g.entities.drops.filter((d) => Array.isArray(d.color));
  return { slime: 1, blue, plain, corner, dead: slime.dead, allDrops, gelColors: colored.map((d) => d.color) };
});
console.log(JSON.stringify(out));
if (!out.slime) {
  check('生成出蓝史莱姆', false);
} else {
  // 开启染色比关闭更蓝（b-r 差值更大）且更暗（半透明凝胶叠色）→ color pass 生效
  const dBlue = out.blue[2] - out.blue[0], dPlain = out.plain[2] - out.plain[0];
  check('染色 pass 生效（开/关蓝色差显著）', dBlue - dPlain > 15, `blue=rgb(${out.blue}) dBlue=${dBlue} plain=rgb(${out.plain}) dPlain=${dPlain}`);
  // 轮廓：盒角=背景（染色没溢出成方形色块）
  const dCorner = out.corner[2] - out.corner[0];
  check('轮廓合成（盒角保持背景色，非方形色块）', dCorner < dBlue - 10, `corner=rgb(${out.corner}) dCorner=${dCorner}`);
  check('凝胶掉落继承怪物色', out.gelColors.length > 0 && out.gelColors.every((c) => Array.isArray(c) && c.length === 4), `gels=${JSON.stringify(out.gelColors)} drops=${out.allDrops}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await page.screenshot({ path: './shots/slime-tint.png' });
await browser.close();
process.exit(fail ? 1 : 0);
