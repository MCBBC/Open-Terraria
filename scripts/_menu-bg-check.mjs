// 一次性:主菜单背景调度验证——四时态截图 + 调度状态读出。
// __swMenuBg 调试句柄直写 vTime/dayTime,验证昼/黄昏/夜/深夜四态 + 变体重掷。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));   // 菜单挂载 + 贴图懒加载

// 直写内部态的四态采样(昼正午/黄昏/入夜后/深夜)
const states = [
  { name: 'noon', vTime: 27000, day: true },
  { name: 'dusk', vTime: 53000, day: true },
  { name: 'night-early', vTime: 3000, day: false },
  { name: 'midnight', vTime: 16200, day: false },
];
for (const s of states) {
  await page.evaluate((st) => {
    const mb = window.__swMenuBg;
    mb.vTime = st.vTime;
    mb.dayTime = st.day;
  }, s);
  await new Promise((r) => setTimeout(r, 900));   // 等 tint 重烘 + 坠星/调度走几帧
  await page.screenshot({ path: `/tmp/menu-${s.name}.png` });
}
// 调度状态读出:重掷是否发生过(样式变化)/月相/时间速度
const out = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  const s1 = mb.style;
  const t1 = mb.vTime;
  return new Promise((res) => setTimeout(() => {
    res({
      style: s1, styleAfter2s: mb.style,
      vTimePer2s: +(mb.vTime - t1).toFixed(0),
      dayTime: mb.dayTime, moonPhase: mb.moonPhase, moonType: mb.moonType,
      camX: Math.round(mb.camX),
      changedDay: mb.menuBGChangedDay, changedNight: mb.menuBGChangedNight,
    });
  }, 2000));
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
