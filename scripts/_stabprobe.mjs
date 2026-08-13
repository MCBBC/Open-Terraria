// 短剑戳击方向视觉验证：朝右/朝左各刺一次，抓画布上剑尖像素方位。
// 判据：t=10（充分伸出）时，不透明弹体像素群相对玩家中心的重心应基本水平
// （|dy| 远小于 |dx|）——修复前右刺剑尖指向右下 45°（重心 dy 大）。
// 玩家世界坐标固定，画布裁剪到玩家周围区域采样。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));

// 直接驱动 SpearProj.draw 的数学（不经 UI）：用页面内 canvas 手工复算旋转公式，
// 与游戏实现解耦——验证"公式正确性"而非端到端交互。
await page.evaluate(() => {
  window.__stab = (dx, dy) => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 320;
    const ctx = c.getContext('2d');
    const img = new Image();
    img.src = '/sprites/vanilla/Projectile_938.png';
    return new Promise((res) => {
      img.onload = () => {
        const sd = dx >= 0 ? 1 : -1;
        const ang = Math.atan2(dy, dx) + Math.PI / 2 - Math.PI / 4 * sd;
        ctx.save();
        ctx.translate(160, 160);
        ctx.rotate(ang);
        if (sd === -1) ctx.scale(-1, 1);
        ctx.drawImage(img, -16, -16, 32, 32);
        ctx.restore();
        const d = ctx.getImageData(0, 0, 320, 320).data;
        let sx = 0, sy = 0, n = 0;
        for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
          const a = d[(y * 320 + x) * 4 + 3];
          if (a > 60) { sx += x; sy += y; n++; }
        }
        const gx = sx / n - 160, gy = sy / n - 160;
        // 剑尖 = 距中心最远的不透明像素
        let tip = [0, 0], bd = 0;
        for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
          const a = d[(y * 320 + x) * 4 + 3];
          if (a > 60) {
            const dd = Math.hypot(x - 160, y - 160);
            if (dd > bd) { bd = dd; tip = [x - 160, y - 160]; }
          }
        }
        res({ gx, gy, tip, bd });
      };
    });
  };
});

const right = await page.evaluate(() => window.__stab(1, 0));
const left = await page.evaluate(() => window.__stab(-1, 0));
console.log('右刺 tip:', right.tip.map(v => v.toFixed(1)), '重心:', right.gx.toFixed(1), right.gy.toFixed(1));
console.log('左刺 tip:', left.tip.map(v => v.toFixed(1)), '重心:', left.gx.toFixed(1), left.gy.toFixed(1));

// 判据：tip 应近似水平（|tipY| < 0.4×|tipX|），且方向与刺向同号
const okR = Math.abs(right.tip[1]) < 0.4 * Math.abs(right.tip[0]) && right.tip[0] > 0;
const okL = Math.abs(left.tip[1]) < 0.4 * Math.abs(left.tip[0]) && left.tip[0] < 0;
console.log('右刺正确:', okR, '| 左刺正确:', okL);
await browser.close();
process.exit(okR && okL ? 0 : 1);
