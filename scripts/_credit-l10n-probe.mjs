// 探针：右下署名两行多语化（Mods.SandboxWorld.Credits.Line1/Line2）端到端验证。
// 断言：
//  1. [data-credit] 存在且在右下角（右缘距屏右 < 60px、底缘距屏底 < 40px）
//  2. zh-Hans：Line1 含「GLM-5.3」「GLM-5.3-Flash」且为 <b> 包裹（加粗+margin 内联样式），
//     Line2 = 「仅用于AI学习研究…」；无裸露 {0}/{1} 占位符残留
//  3. 切 en-US：Line1 = Co-created by …、Line2 = For AI learning…（Lang.setLanguage →
//     onChange → renderTexts 重取）
//  4. b 元素 computed text-shadow 含 1px 0 0 #fff（像素字体复制法加粗）且
//     margin-left/right ≥ 4px（用户要求的左右 margin）
//  5. 购买按钮文案随语言切换（购买原版 ↔ Buy the Original）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const grab = () => page.evaluate(() => {
  const credit = document.querySelector('[data-credit]');
  if (!credit) return { hasCredit: false };
  const cr = credit.getBoundingClientRect();
  const bs = [...credit.querySelectorAll('b')].map((b) => {
    const cs = getComputedStyle(b);
    return { text: b.textContent, shadow: cs.textShadow, ml: cs.marginLeft, mr: cs.marginRight, weight: cs.fontWeight };
  });
  const buy = document.querySelector('[data-act=buy]');
  return {
    hasCredit: true,
    html: credit.innerHTML,
    text: credit.innerText,
    rect: { right: Math.round(window.innerWidth - cr.right), bottom: Math.round(window.innerHeight - cr.bottom), w: Math.round(cr.width) },
    bs,
    buy: buy ? buy.textContent : null,
  };
});

// 语言切换走真实链路：IDB 播种 sandboxworld.options {lang} → 整页重载
// （options.load → Lang.init(lang) → TitleMenu 模板/renderTexts 按该语言取词）
const seedLang = async (lang) => {
  await page.evaluate((lang2) => new Promise((resolve, reject) => {
    // 不带版本号打开（DB 版本随迁移演进，钉 2 会在高版本库上 VersionError）；
    // langExplicit=true 必带——options.load 对未显式选择的语言会按 navigator 重探
    const req = indexedDB.open('sandboxworld');
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(JSON.stringify({ lang: lang2, langExplicit: true }), 'sandboxworld.options');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), lang);
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
};

const out = {};
out.zh = await grab(); // 默认 zh-Hans

await seedLang('en-US');
out.en = await grab();

console.log(JSON.stringify(out, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
for (const [loc, o] of [['zh', out.zh], ['en', out.en]]) {
  A(o.hasCredit, `${loc}: data-credit 缺失`);
  if (!o.hasCredit) continue;
  A(o.rect.right < 60 && o.rect.bottom < 40, `${loc}: 不在右下角 ${JSON.stringify(o.rect)}`);
  A(!/\{\d\}/.test(o.text), `${loc}: 占位符 {0}/{1} 未替换`);
  A(o.bs.length === 2, `${loc}: b 元素数量 ${o.bs.length} ≠ 2`);
  const names = o.bs.map((b) => b.text);
  A(names.includes('GLM-5.3') && names.includes('GLM-5.3-Flash'), `${loc}: 加粗名不符 ${names}`);
  for (const b of o.bs) {
    A(b.shadow.includes('rgb(255, 255, 255)'), // Chrome 规范化 #fff → rgb(255,255,255)（色值前置）
      `${loc}: b 缺白色复制法加粗 shadow: ${b.shadow}`);
    A(parseFloat(b.ml) >= 4 && parseFloat(b.mr) >= 4, `${loc}: b 左右 margin 不足 ${b.ml}/${b.mr}`);
  }
}
A(out.zh.text.includes('共同协作复刻'), `zh Line1 文案不符: ${out.zh.text}`);
A(out.zh.text.includes('仅用于AI学习研究'), `zh Line2 文案不符: ${out.zh.text}`);
A(out.zh.buy === '购买原版', `zh 购买按钮文案: ${out.zh.buy}`);
A(/Co-created by/.test(out.en.text), `en Line1 文案不符: ${out.en.text}`);
A(/For AI learning and research only/.test(out.en.text), `en Line2 文案不符: ${out.en.text}`);
A(out.en.buy === 'Buy the Original', `en 购买按钮文案: ${out.en.buy}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
