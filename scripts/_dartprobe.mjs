// 敌怪弹幕视觉探针:强制哈比射羽(38)/恶魔飞镰(44),捕获 drawImage 贴图名+旋转调用
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto('http://localhost:5377/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    r = await page.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.__swGame?.player && window.__swGame.entities) {
          clearInterval(iv);
          const g = window.__swGame;
          const out = {};
          const p = g.player;
          const ents = g.entities;
          // 借 spawnEnemy 造一个壳拿 Enemy 类
          const shell = g.spawnEnemy('slime_green', -9999, -9999);
          const EnemyCls = shell?.constructor;
          shell.dead = true;
          // 直接构造 Dart 检验样式(隔离 AI):右飞羽毛/上飞羽毛/恶魔镰
          const DartCls = null;
          // 从 enemies 桶里现有敌怪无 Dart;直接 new 不行——用 entities.add 收集器抓
          const made = [];
          const origAdd = ents.add.bind(ents);
          ents.add = (e, b) => { if (b === 'projectiles') made.push(e); return origAdd(e, b); };
          // 造哈比并放在玩家左侧,强制开枪循环(useTime>0 保 idle 门)
          const harpy = EnemyCls ? EnemyCls.fromVanilla(48, p.cx - 240, p.cy) : null;
          if (harpy) { harpy.vanillaId = 48; ents.add(harpy, 'enemies'); out.harpy = harpy.vanillaId; }
          const demon = EnemyCls ? EnemyCls.fromVanilla(62, p.cx - 320, p.cy - 40) : null;
          if (demon) { demon.vanillaId = 62; ents.add(demon, 'enemies'); out.demon = demon.vanillaId; }
          // hook rotate/drawImage 记录投射物绘制
          const ctx = g.renderer.canvas.getContext('2d');
          const rotCalls = [];
          const orot = ctx.rotate.bind(ctx);
          ctx.rotate = (a) => { rotCalls.push(Math.round(a * 100) / 100); return orot(a); };
          const draws = [];
          const odi = ctx.drawImage.bind(ctx);
          ctx.drawImage = (...a) => {
            if (a[0] instanceof HTMLCanvasElement || (a[0] instanceof HTMLImageElement && String(a[0].src).includes('Projectile_'))) {
              const src = a[0].src ? String(a[0].src).split('/').pop() : 'canvas';
              const w = a[3] ?? a[0].width, h = a[4] ?? a[0].height;
              draws.push(`${src} ${Math.round(w)}x${Math.round(h)}`);
            }
            return odi(...a);
          };
          setTimeout(() => {
            ctx.rotate = orot; ctx.drawImage = odi;
            ents.add = origAdd;
            const projs = made.filter((e) => e.constructor?.name === 'Dart').slice(0, 6)
              .map((e) => ({ projId: e.projId, vx: +e.vx.toFixed(1), vy: +e.vy.toFixed(1), life: e.life }));
            out.darts = projs;
            out.projDraws = [...new Set(draws)].slice(0, 16);
            out.rotSamples = rotCalls.slice(-40);
            res(JSON.stringify(out));
          }, 4000);
        } else if (Date.now() - t0 > 60000) { clearInterval(iv); res('timeout'); }
      }, 300);
    }));
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log(r);
await browser.close();
