// Dart.draw 像素级验证:页面内 import 模块,离屏画布绘制后数非透明像素+方向
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
      const iv = setInterval(async () => {
        if (window.__swGame?.player) {
          clearInterval(iv);
          try {
            const arrow = await import('/src/entities/Arrow.ts');
            const dartMod = await import('/src/entities/Dart.ts');
            // 预热懒加载(首次请求才开始 fetch)
            for (const pid of [38, 44, 55, 81, 180, 909, 299, 836]) arrow.projFrameImg(pid, 0);
            await new Promise((r2) => setTimeout(r2, 1500));
            const out = { frames: {} };
            for (const pid of [38, 44, 55, 81, 180, 909, 299]) {
              const f = arrow.projFrameImg(pid, 0);
              out.frames[pid] = f ? `${f.width}x${f.height}` : 'null';
            }
            // 离屏绘制:右飞羽毛 rot 应 = π/2 → 羽毛尖朝右(贴图像素重心偏移验证)
            const cv = document.createElement('canvas');
            cv.width = 120; cv.height = 120;
            const d = new dartMod.Dart(60, 60, 6, 0, 15, 38);
            const fakeR = { canvas: cv };
            // 跑 2 tick 建立旋转
            const g = window.__swGame;
            d.fixedUpdate(1 / 60, g);
            d.fixedUpdate(1 / 60, g);
            d.draw(fakeR, null);
            const ctx = cv.getContext('2d');
            const data = ctx.getImageData(0, 0, 120, 120).data;
            let n = 0, sx = 0, sy = 0;
            for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
              if (data[(y * 120 + x) * 4 + 3] > 30) { n++; sx += x; sy += y; }
            }
            out.featherPixels = n;
            out.featherCentroid = n ? [Math.round(sx / n), Math.round(sy / n)] : null; // 期望 ≈(60+?,60) 偏右=尖朝右
            // 恶魔镰:spin 旋转非零
            const s = new dartMod.Dart(60, 60, 3, 0, 21, 44);
            s.fixedUpdate(1 / 60, g);
            out.sickleRot = +s.rot.toFixed?.(2) ?? 'n/a';
            // 299 暗影焰:纯尘埃,离屏绘制应为 0 像素
            const cv2 = document.createElement('canvas'); cv2.width = 80; cv2.height = 80;
            const f = new dartMod.Dart(40, 40, 6, 0, 25, 299);
            f.fixedUpdate(1 / 60, g); f.fixedUpdate(1 / 60, g);
            f.draw({ canvas: cv2 }, null);
            const d2 = cv2.getContext('2d').getImageData(0, 0, 80, 80).data;
            let n2 = 0; for (let i = 3; i < d2.length; i += 4) if (d2[i] > 30) n2++;
            out.shadowflamePixels = n2;   // 期望 0
            // 836 蒲公英籽:横向 4 列帧,绘制应有完整 14×20 帧像素
            const cv3 = document.createElement('canvas'); cv3.width = 80; cv3.height = 80;
            const w1 = new dartMod.Dart(40, 40, 1, 0, 7, 836);
            w1.fixedUpdate(1 / 60, g); w1.fixedUpdate(1 / 60, g);
            w1.draw({ canvas: cv3 }, null);
            const d3 = cv3.getContext('2d').getImageData(0, 0, 80, 80).data;
            let n3 = 0, x3 = [], y3 = [];
            for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (d3[(y * 80 + x) * 4 + 3] > 30) { n3++; x3.push(x); y3.push(y); }
            out.seedPixels = n3;  // 期望 ~100+(14×20 的一帧)
            out.seedExtent = n3 ? [Math.min(...x3), Math.max(...x3), Math.min(...y3), Math.max(...y3)] : null;  // 期望约 26..53 × 30..49(14×20)
            res(JSON.stringify(out));
          } catch (e) { res('ERR ' + String(e).slice(0, 200)); }
        } else if (Date.now() - t0 > 60000) { clearInterval(iv); res('timeout'); }
      }, 400);
    }));
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log(r);
await browser.close();
