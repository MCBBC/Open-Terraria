// SW-FX16 冒烟探针（_ 一次性探针，tools/run-diag.mjs 运行）：
//   boot 无 pageerror（main.ts 模块装配面:SHIFT_DEBUG_RESERVED/相机门/资源包音乐
//   接线）→ 进世界 → 快捷栏数字键缺省 Digit1 选槽0 → 改绑 Hotbar1=KeyZ 后
//   KeyZ 选槽0/Digit1 失效（hotbarSlotOfCode 活绑表实机面）→ 资源包页构建 +
//   音乐覆盖表 round-trip（Audio/Sfx 模块装配面）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0' });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

check('boot 无 pageerror（main.ts 模块装配面）', errors.length === 0, errors.slice(0, 3).join(' | '));

// ---- 进世界（_f6-panel 同款标题流：选存档→开始）----
let inWorld = false;
try {
  await page.evaluate(() => {
    const _s = document.querySelector('select');
    if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); }
  });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  inWorld = true;
} catch { /* 无存档/标题流变化:世界相关项跳过 */ }
check('进入世界（__swGame.world 就绪）', inWorld);

if (inWorld) {
  // ---- 缺省：Digit1 选槽 0（hotbarSlotOfCode 缺省表面）----
  await page.evaluate(() => { window.__swGame.player.inv.selected = 3; });
  await page.keyboard.press('Digit1');
  await new Promise((r) => setTimeout(r, 200));
  let sel = await page.evaluate(() => window.__swGame.player.inv.selected);
  check('缺省 Digit1 → 槽0（活绑表缺省面）', sel === 0, `selected=${sel}`);

  // ---- 改绑 round-trip：Hotbar1 → KeyZ；Digit1 失效、KeyZ 选槽0 ----
  await page.evaluate(async () => {
    const K = await import('/src/core/Keybinds.ts');
    const O = await import('/src/core/Options.ts');
    O.options.set('keybinds', K.assignBinding(O.options.data.keybinds, 'Hotbar1', 'KeyZ'));
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { window.__swGame.player.inv.selected = 3; });
  await page.keyboard.press('Digit1');
  await new Promise((r) => setTimeout(r, 200));
  sel = await page.evaluate(() => window.__swGame.player.inv.selected);
  check('改绑后 Digit1 失效（仍槽3）', sel === 3, `selected=${sel}`);
  await page.keyboard.press('KeyZ');
  await new Promise((r) => setTimeout(r, 200));
  sel = await page.evaluate(() => window.__swGame.player.inv.selected);
  check('改绑后 KeyZ → 槽0（重绑即时跟随）', sel === 0, `selected=${sel}`);
  // 还原（防污染会话存档）
  await page.evaluate(async () => {
    const O = await import('/src/core/Options.ts');
    await O.options.set('keybinds', {});
  });
}

// ---- 资源包页构建（箭头字形/双列 DOM,零包态）----
{
  const rp = await page.evaluate(async () => {
    const M = await import('/src/ui/ResourcePackPage.ts');
    const el = M.buildResourcePackPage();
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return {
      wrap: !!el.querySelector('.sw-rp-wrap'),
      cols: el.querySelectorAll('.sw-rp-col').length,
      text: el.textContent?.slice(0, 80),
    };
  });
  check('资源包页构建（双列+行）', rp.wrap && rp.cols === 2, JSON.stringify(rp.text ?? ''));
}

// ---- 音乐覆盖装配面（Sfx 表 + Audio 监听装配不抛错即上面 boot 覆盖）----
{
  const music = await page.evaluate(async () => {
    const S = await import('/src/core/Sfx.ts');
    const affected = S.applyMusicPackOverrides(new Map([['Music_6', new Uint8Array([1, 2, 3])]]));
    const hit = S.musicPackOverride('Music_6')?.[1];
    S.applyMusicPackOverrides(new Map());
    return { affected, hit, keysAfter: S.musicPackOverrideKeys().length };
  });
  check('音乐覆盖表 round-trip（apply/取键/清空）',
    music.affected.includes('Music_6') && music.hit === 2 && music.keysAfter === 0,
    JSON.stringify(music));
}

check('全程无 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`RESULT: pass=${pass} fail=${fail}`);
await browser.close();
if (fail > 0) process.exit(1);
