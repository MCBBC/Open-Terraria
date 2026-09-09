import puppeteer from 'puppeteer-core';
// frameCache 逐条淘汰验证(强压版):预载弹幕贴图→冷灌 >2048 个 (id,frame) 键→
// 热键重访应零 createElement(旧策略 size>2048→整表clear=雪崩重分配)。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let ok = null;
for (let att = 0; att < 8 && !ok; att++) {
  try { await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 }); ok = 'yes'; }
  catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }
await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) { await new Promise(r => setTimeout(r, 500)); }
});
const out = await page.evaluate(async () => {
  const { projSprite, projFrameImg } = await import('/src/entities/Arrow.ts');
  // 相位0:触发全部贴图懒加载并等待落地
  for (let id = 1; id <= 2000; id++) projSprite(id);
  await new Promise(r => setTimeout(r, 4000));
  let sprites = 0;
  for (let id = 1; id <= 2000; id++) if (projSprite(id)) sprites++;
  let creates = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') creates++;
    return orig(tag, ...rest);
  };
  // 冷灌:id 1..2000 × frame 0..19(钳制保证键合法),记录成功键序
  let coldKeys = 0;
  const b1 = creates;
  const keySeq = [];
  for (let id = 1; id <= 2000; id++) for (let f = 0; f < 20; f++) if (projFrameImg(id, f)) { coldKeys++; keySeq.push([id, f]); }
  const coldCreates = creates - b1;
  // 热键重访:冷灌期【最后成功】的 2048 个键 = FIFO 容量内必驻;应零分配
  // (旧策略:过容量后整表 clear 只留末段 <2048 键,重访必撞 ~千级重分配)
  const hot = keySeq.slice(-2048);
  const b3 = creates;
  let hotHits = 0;
  for (const [id, f] of hot) if (projFrameImg(id, f)) hotHits++;
  const hotCreates = creates - b3;
  document.createElement = orig;
  return { sprites, distinctKeys: coldCreates, keyReturns: coldKeys, hotHits, hotCreates,
           capCrossed: coldCreates > 2048 };
});
console.log(JSON.stringify(out, null, 1));
const pass = out.capCrossed && out.hotCreates === 0;
console.log(pass ? 'EVICT POLICY PASS: 过容量后热键零重分配(雪崩消失)' : `EVICT POLICY ${out.capCrossed ? 'FAIL: hotCreates=' + out.hotCreates : 'WEAK: 未过容量 distinct=' + out.distinctKeys}`);
await browser.close();
process.exit(pass ? 0 : 2);
