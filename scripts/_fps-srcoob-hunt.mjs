// srcoob 触发源抓捕探针 v6：patch rawDrawImage 记录调用栈+源参数分布。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-srcoob-hunt.mjs
// 操作：窗口弹出后手动导入并进入 Starter World（同 v5），进入后自动抓捕 8s。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1540,960'] });
const page = (await browser.pages())[0] ?? await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL + '/?v6=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('请在弹出的浏览器窗口手动进入 Starter World（导入→进入），进入后自动抓捕');

await page.waitForFunction(() => {
  const g = window.__swGame;
  return !!(g && g.player && g.world?.store?.w > 0);
}, { timeout: 600000, polling: 1000 });
console.log('=== 已进入世界 ===');
await sleep(3000);
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn, div')].find((e) => /我已知晓|已知/.test(e.textContent ?? '') && e.children.length === 0);
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }

// patch rawDrawImage 抓栈+参数
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__srcoobRec = new Map();
  window.__srcoobStacks = new Map();
  let patched = 0;
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v && v.constructor && v.constructor.degradeOps && typeof v.rawDrawImage === 'function') {
      const orig = v.rawDrawImage.bind(v);
      Object.defineProperty(v, 'rawDrawImage', {
        value: function (img, rest, why) {
          try {
            const iw = img?.width ?? '?', ih = img?.height ?? '?';
            const src = img?.src ? String(img.src).split('/').pop()?.slice(0, 40) : (img?.__swKey ?? '');
            const key = `${why}|${img?.constructor?.name}|${iw}x${ih}|${src}|rest=${JSON.stringify(rest?.slice(0, 8))}`;
            window.__srcoobRec.set(key, (window.__srcoobRec.get(key) ?? 0) + 1);
            if (!window.__srcoobStacks.has(key)) {
              window.__srcoobStacks.set(key, new Error().stack.split('\n').slice(2, 8).map((s) => s.trim().slice(0, 120)).join('\n'));
            }
          } catch { /* 记录失败不干扰 */ }
          return orig(img, rest, why);
        },
        writable: true, configurable: true,
      });
      patched++;
    }
  }
  return patched;
});

// 行走 8s 抓捕
await page.evaluate(`window.__swGame.input.keys.add('ArrowRight'); 'walking'`);
await sleep(8000);
await page.evaluate(`window.__swGame.input.keys.delete('ArrowRight'); 'stop'`);
const rec = await page.evaluate(() => {
  const out = [];
  for (const [k, v] of window.__srcoobRec) out.push({ k, v, stack: window.__srcoobStacks.get(k) });
  out.sort((a, b) => b.v - a.v);
  return out.slice(0, 12);
});
console.log('=== rawDrawImage 触发分布（8s 行走, top12） ===');
for (const { k, v, stack } of rec) {
  console.log(`[${v}次] ${k}`);
  console.log(stack?.split('\n').map((s) => '    ' + s).join('\n'));
}
console.log('\npageerrors:', errors.slice(0, 6));
await browser.close();
