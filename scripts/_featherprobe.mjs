// 羽毛弹幕探针:生成哈比 48 强制射击,截图 + dump 弹体绘制状态
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    r = await page.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.__swGame?.player && window.__swGame.entities) {
          clearInterval(iv);
          const g = window.__swGame;
          const out = {};
          // 生成哈比并摆在玩家右侧 200px 同高度（借桶内任一敌人的 constructor 调 fromVanilla）
          const p = g.player;
          const EnemyCls = g.entities.enemies[0]?.constructor;
          out.enemyCount = g.entities.enemies.length;
          if (!EnemyCls) { out.err = 'no enemy to borrow class'; }
          else {
            const h = EnemyCls.fromVanilla(48, p.cx + 200, p.cy);
            h.vanillaId = 48;
            g.entities.add(h, 'enemies');
            out.harpy = [h.vanillaId, Math.round(h.x), Math.round(h.y), h.def?.name];
          }
          let shots = [];
          // 直接遍历 projectiles 桶看实体类型与绘制方式
          const bucket = g.entities.projectiles ?? g.entities.buckets?.projectiles ?? [];
          out.bucketKeys = g.entities.buckets ? Object.keys(g.entities.buckets) : typeof bucket;
          out.bucket0 = bucket && bucket[0] ? {
            cls: bucket[0].constructor?.name,
            w: bucket[0].w, h: bucket[0].h,
            vx: bucket[0].vx, vy: bucket[0].vy,
          } : 'empty';
          // hook ctx.drawImage 捕捉 feather 尺寸帧
          const calls = [];
          const cv = g.renderer.canvas;
          const ctx = cv.getContext('2d');
          const od = ctx.drawImage.bind(ctx);
          ctx.drawImage = (...a) => { if (a[0] instanceof HTMLImageElement) calls.push({ src: a[0].src?.split('/').pop(), dw: a[4] ?? a[1]?.width, dh: a[5] ?? a[1]?.height }); return od(...a); };
          out.ctxRestoreCount = 0;
          setTimeout(() => {
            ctx.drawImage = od;
            out.imgDraws = calls.slice(-30);
            out.shotSample = JSON.stringify(shots.slice(0, 3));
            cv.toBlob((b) => {
              const fr = new FileReader();
              fr.onload = () => { out.shot = String(fr.result).slice(0, 50); res(JSON.stringify(out)); };
              fr.readAsDataURL(b);
            });
          }, 2500);
          // 每 200ms 记录 projectiles 桶
          const siv = setInterval(() => {
            const b = g.entities.projectiles ?? [];
            for (const e of b) shots.push([e.constructor?.name, Math.round(e.x), Math.round(e.y), e.vx?.toFixed?.(1), e.vy?.toFixed?.(1), e.w, e.h]);
            if (shots.length > 400) clearInterval(siv);
          }, 200);
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
