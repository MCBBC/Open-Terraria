// 复现"多次随机外观后外观格全空"（用户实报）：连点随机 N 次后检查格子背景与 bake 状态
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await page.goto('http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const r = await page.evaluate(async () => {
  // evaluate 内等价路径：标题菜单 → 角色选择 → 新建
  [...document.querySelectorAll('.sw-title-menu [data-act]')].find((b) => b.dataset.act === 'sp')?.click();
  await new Promise((r2) => setTimeout(r2, 800));
  document.querySelector('.sw-vsel [data-act=new]')?.click();
  await new Promise((r2) => setTimeout(r2, 800));
  // 切到外观页签（第 2 个）
  const tabs = [...document.querySelectorAll('.sw-cc-tab')];
  tabs[1]?.click();   // 外观页（样式格）
  await new Promise((r2) => setTimeout(r2, 400));
  // 解析格子背景 dataURL 的非透明像素占比（空白烘焙检测）
  const thumbBg = () => {
    const t = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
    if (!t) return '(no thumb)';
    const m = /url\("data:image\/png;base64,([^"]+)"\)/.exec(t.style.backgroundImage || '');
    if (!m) return '(no bg)';
    const img = new Image();
    img.src = 'data:image/png;base64,' + m[1];
    const cv = document.createElement('canvas');
    cv.width = 44; cv.height = 80;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, 44, 80).data;
    let opaque = 0, total = 44 * 80;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 10) opaque++;
    return `opaque=${(opaque / total * 100).toFixed(0)}%`;
  };
  const seq = [];
  // 连点随机 8 次（外观页内的 Randomize 小钮，title=Mods.SandboxWorld.CharCreate.Random）
  for (let k = 0; k < 8; k++) {
    document.querySelector('[title*="CharCreate.Random"]')?.click();
    await new Promise((r2) => setTimeout(r2, 100));
    seq.push(thumbBg());
  }
  await new Promise((r2) => setTimeout(r2, 500));
  return { tabs: tabs.length, seq, final: thumbBg() };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/randlook.png' });
await browser.close();
