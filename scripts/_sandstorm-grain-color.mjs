// 沙尘暴 grain 复合色探针（2026-08-31「沙尘暴飞树叶」定谳回归）:
// dust 268 真帧 = Dust.png (680, 60+10×rand3) 8×8 灰十字;曾误裁 (680,20)=dust 168
// 蓝十字 → ×沙色乘 = 暗绿"树叶"。本探针直接驱动 WeatherRenderer.drawPrecipDust
// 生产路径(fake hooks),采样复合像素 + 帧区分性 + 黑光死亡门。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 900, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });

const out = await page.evaluate(async () => {
  const wr = await import('/src/render/WeatherRenderer.ts');
  const blob = await fetch('/sprites/vanilla/Dust.png').then((r) => r.blob());
  const tex = await createImageBitmap(blob);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(50);

  const mkInst = (light) => {
    const inst = new wr.WeatherRenderer();
    inst.attach(
      { sandstorm: { happening: true, severity: 0.8, timeLeft: 100, intendedSeverity: 0.8 }, cloudAlpha: 0, windSpeedCurrent: 1, raining: false },
      {
        lightAt: () => light, atmo: 1, snowRatio: 0, snowTileCount: 0, bossDanger: false,
        waterStyle: 0,
        emitSand() {}, splashDust() {}, sandstormVisuals: true, desertSandTiles: 500,
        sandColors: () => [{ color: '#C8A014', weight: 10 }],
      },
    );
    return inst;
  };
  const grain = (frame, x, y) => ({ x, y, vx: 0, vy: 0, scale: 1, fadeIn: 0, cr: 200, cg: 160, cb: 20, frame, active: true });

  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 64;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'rgb(222,205,158)'; // 亮沙地背景(近原版正午沙漠)
  ctx.fillRect(0, 0, 160, 64);

  // 三帧沙尘 grain 并排(生产 drawPrecipDust 路径,x=16/64/112)
  // getDustTex() 懒加载:反复 draw 直到纹理就绪(getDustTex 内部回填)
  const inst = mkInst([255, 255, 255]);
  inst.sand.push(grain(0, 16, 32), grain(1, 64, 32), grain(2, 112, 32));
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = 'rgb(222,205,158)';
    ctx.fillRect(0, 0, 160, 64);
    inst.drawPrecipDust({ ctx }, null);
    const probe = Array.from(ctx.getImageData(15, 31, 1, 1).data.slice(0, 3));
    if (!(probe[0] === 222 && probe[1] === 205 && probe[2] === 158)) break;
    await sleep(100);
  }

  const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
  const cores = [px(15, 31), px(63, 31), px(111, 31)]; // dest=(x−4) 起 8×8,帧核 (3,3) → (x−1,y−1)

  // 黑光死亡门(DrawDust :39730 newColor==Black → active=false);同样循环等纹理
  const dark = mkInst([0, 0, 0]);
  const g0 = grain(0, 32, 32);
  dark.sand.push(g0);
  for (let i = 0; i < 600 && g0.active; i++) {
    dark.drawPrecipDust({ ctx: cv.getContext('2d') }, null);
    await sleep(100);
  }
  dark.drawPrecipDust({ ctx: cv.getContext('2d') }, null);

  // 缓存帧区分性(三帧必须 pairwise 不同)
  const urls = [0, 1, 2].map((f) => wr.tintedDust268(tex, 200, 160, 20, f)?.toDataURL());
  const distinct = new Set(urls).size === 3;

  // 雪花三帧(760,10×f)同验
  const furls = [0, 1, 2].map((f) => wr.tintedFlake(tex, 255, f)?.toDataURL());
  const fDistinct = new Set(furls).size === 3;

  // dustWaterFor 映射(Dust.cs:405-421)
  const dw = [[0, 33], [1, 33], [2, 98], [3, 99], [9, 105], [10, 123], [11, 33], [12, 288], [13, 33]]
    .every(([ws, want]) => wr.dustWaterFor(ws) === want);

  return {
    cores,
    sandDeadInBlack: !g0.active,
    framesDistinct: distinct,
    snowFramesDistinct: fDistinct,
    dustWaterOk: dw,
  };
});

console.log(JSON.stringify(out, null, 1));

// 判定:亮沙下复合核应为暖沙色(R>G>B),暗绿病态即 R<G
const [r, g, b] = out.cores[0];
const sandy = r > g && g > b && r > 140;
const all = out.cores.every(([cr, cg, cb]) => cr > cg && cg > cb);
console.log(`frame0 core rgb(${r},${g},${b}) sandy=${sandy}`);
console.log(`all frames sandy ordering: ${all}`);
console.log(`black-light death: ${out.sandDeadInBlack}`);
console.log(`dust268 3 frames distinct: ${out.framesDistinct}`);
console.log(`dust76 3 frames distinct: ${out.snowFramesDistinct}`);
console.log(`dustWaterFor mapping: ${out.dustWaterOk}`);
const ok = sandy && all && out.sandDeadInBlack && out.framesDistinct && out.snowFramesDistinct && out.dustWaterOk;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
