// 冒烟测试：启动 Chrome → 创建世界 → 移动/跳跃 → 截图 → 收集控制台错误
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5173';
const OUT = process.env.OUTDIR || './shots';

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1280,800', '--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}\n${err.stack?.slice(0, 500) ?? ''}`));

await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));

// 创建小世界
const seedInput = await page.$('input');
if (seedInput) await seedInput.type('smoketest');
await page.evaluate(() => {
  const sel = document.querySelector('select');
  if (sel) {
    sel.selectedIndex = 0; // 小世界
    sel.parentElement.querySelector('button').click(); // vui 菜单后垫片按钮在 select 父容器内
  }
});
await page.waitForFunction(() => !document.querySelector('.sw-progress'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/01-spawn.png` });

// 向右走 1 秒，期间逐帧检测主角是否可见（Maples 精灵多色 → 用非天空不透明像素计数）
await page.keyboard.down('KeyD');
let visibleFrames = 0, totalFrames = 0;
const frameDiag = [];
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 80));
  const vis = await page.evaluate(() => {
    const g = window.__swGame;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    // 以主角躯干为中心采样 44×60 区域
    const p = g.player;
    const [psx, psy] = g.camera.worldToScreen(p.cx, p.y + 10);
    const x0 = Math.max(0, Math.round(psx - 22)), y0 = Math.max(0, Math.round(psy - 20));
    const img = ctx.getImageData(x0, y0, 44, 60).data;
    let body = 0;
    for (let j = 0; j < img.length; j += 4) {
      const [r, gg, b] = [img[j], img[j+1], img[j+2]];
      const a = img[j+3];
      if (a < 200) continue;
      // 排除天空（高亮蓝）与纯黑（洞穴暗部）：主角精灵含肤色/棕发/多彩
      if (b > 200 && r < 120) continue;           // 天空
      if (r < 20 && gg < 20 && b < 20) continue;  // 黑
      body++;
    }
    return { body, vx: +p.vx.toFixed(2) };
  });
  totalFrames++;
  if (vis.body > 60) visibleFrames++;
  frameDiag.push(`${vis.body}px vx${vis.vx}`);
}
await page.keyboard.up('KeyD');
console.log(`PLAYER_VISIBLE: ${visibleFrames}/${totalFrames} frames (阈值60)`);
console.log('FRAME_DIAG:', frameDiag.join(' | '));
await page.screenshot({ path: `${OUT}/02-walk.png` });

// 再走 + 跳
await page.keyboard.down('KeyD');
await page.keyboard.down('Space');
await new Promise((r) => setTimeout(r, 600));
await page.keyboard.up('Space');
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.up('KeyD');
await page.screenshot({ path: `${OUT}/03-jump.png` });

// 等夜晚？改用调时间——直接等 8 秒观察天空变化与敌人
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${OUT}/04-later.png` });

// 状态 + 画布像素采样
const state = await page.evaluate(() => {
  const g = window.__swGame;
  // ---- 主角 sprite 像素级校验（防头部出帧等绘制 bug 回归）----
  const sheet = g.assets.playerSheet;
  const sctx = sheet.getContext('2d');
  const fw = g.assets.playerFrameW, fh = g.assets.playerFrameH;
  const frame = sctx.getImageData(0, 0, fw, fh).data;
  const px = (x, y) => {
    const i = (y * fw + x) * 4;
    return [frame[i], frame[i + 1], frame[i + 2]];
  };
  const near = (c, t, tol = 40) => Math.abs(c[0] - t[0]) < tol && Math.abs(c[1] - t[1]) < tol && Math.abs(c[2] - t[2]) < tol;
  const hair = [0x8A, 0x5A, 0x28], skin = [0xE8, 0xB8, 0x8A], shirt = [0x3E, 0x5C, 0xBE], pants = [0x4A, 0x38, 0x26];
  const hasColor = (y0, y1, t) => {
    for (let y = y0; y <= y1; y++) for (let x = 2; x < fw - 2; x++) if (near(px(x, y), t)) return true;
    return false;
  };
  g.__spriteCheck = {
    hairTop: hasColor(0, 5, hair),       // 发在帧顶
    face: hasColor(8, 16, skin),         // 脸在中上
    shirtMid: hasColor(19, 28, shirt),   // 上衣在中部
    pantsLow: hasColor(32, 40, pants),   // 裤在底部
  };
  const canvas = document.querySelector('canvas');
  let pixels = null;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    // 采样 5 个点的颜色
    const pts = [[w/2, h/2], [w/2, h*0.2], [w/2, h*0.8], [w*0.3, h*0.6], [w*0.7, h*0.6]];
    pixels = pts.map(([x, y]) => {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      return [img[i], img[i+1], img[i+2]];
    });
  }
  const diag = {
    menuVisible: !!document.querySelector('.sw-panel'),
    progressVisible: !!document.querySelector('.sw-progress'),
    buttons: document.querySelectorAll('button').length,
    toast: document.querySelector('.sw-toast')?.textContent ?? null,
    swKeys: Object.keys(window).filter((k) => k.toLowerCase().includes('sw') || k.includes('Game')),
    href: location.href,
  };
  if (!g) return { game: false, diag, pixels };
  return {
    game: true,
    diag,
    spriteCheck: g.__spriteCheck,
    playerPos: [Math.round(g.player.x), Math.round(g.player.y)],
    hp: g.player.hp,
    hpMax: g.player.maxHp,
    enemies: g.entities.enemies.length,
    drops: g.entities.drops.length,
    clock: g.world.clock.timeOfDay,
    pixels,
  };
});
console.log('STATE:', JSON.stringify(state));
if (state.game) {
  const sc = state.spriteCheck;
  const ok = sc.hairTop && sc.face && sc.shirtMid && sc.pantsLow;
  console.log(`SPRITE_CHECK: ${ok ? 'PASS' : 'FAIL ' + JSON.stringify(sc)}`);
  if (!ok) errors.push('sprite check failed: ' + JSON.stringify(sc));
}
console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.join('\n---\n') : 'NO ERRORS');
await browser.close();
process.exit(errors.length ? 1 : 0);
