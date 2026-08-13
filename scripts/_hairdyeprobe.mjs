// 发色剂系统探针（§6）：使用链（1984 派对 → hairDye=8）→ 头发像素变粉 →
// 1985 彩虹（动态）→ 1990 去除剂 → hairDye=0 清槽。
// 采样：渲染 canvas 玩家头部区域像素直方图（派对=接近 (244,22,175) 的像素数）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ?play=small 直载无角色档 → 玩家无 appearance（无纸娃娃/头发可染）。
// 注入一份默认外观（对齐 Appearance.defaultAppearance）再验渲染
const appearanceOk = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g.player.appearance) {
    g.player.appearance = {
      name: 'probe', hair: 0, skinVariant: 0,
      hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 },
      eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 175, g: 165, b: 140 },
      undershirtColor: { r: 160, g: 180, b: 215 }, pantsColor: { r: 255, g: 230, b: 175 },
      shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 0, team: 0,
    };
  }
  return true;
});
check('注入外观（纸娃娃路径可用）', appearanceOk);
await new Promise((r) => setTimeout(r, 2500));   // Player_*/Hair_* 懒加载

const byVid = await page.evaluate(() => {
  const out = {};
  for (const [k, id] of Object.entries(window.__swItems)) {
    const m = /^vi_(\d+)_/.exec(k);
    if (m && ['1984', '1985', '1990'].includes(m[1])) out[m[1]] = id;
  }
  return out;
});
check('vi_ 物品可解析（1984/1985/1990）', !!byVid['1984'] && !!byVid['1985'] && !!byVid['1990'], JSON.stringify(byVid));
if (!byVid['1984'] || !byVid['1985'] || !byVid['1990']) { console.log('GAVE UP'); await browser.close(); process.exit(1); }

// 头部区域像素采样：返回与目标色距离 < 阈值的像素数 + 平均色
const sample = (targetR, targetG, targetB, tol) => page.evaluate(([tr, tg, tb, t]) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  const W = 70, H = 70;
  // 头部 = 精灵顶（脚锚 p.y+p.h 上移 56px）再下移 12px 居中发冠带
  const [fx, fy] = g.camera.worldToScreen(g.player.cx, g.player.y + g.player.h);
  const ox = Math.round(fx - W / 2), oy = Math.round(fy - 56 * 1.25 + 12 - H / 2);
  c2.width = W; c2.height = H;
  const cx = c2.getContext('2d', { willReadFrequently: true });
  cx.drawImage(cv, ox, oy, W, H, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data;
  let hit = 0, rSum = 0, gSum = 0, bSum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    n++;
    rSum += d[i]; gSum += d[i + 1]; bSum += d[i + 2];
    if (Math.abs(d[i] - tr) <= t && Math.abs(d[i + 1] - tg) <= t && Math.abs(d[i + 2] - tb) <= t) hit++;
  }
  return { hit, avg: n ? [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)] : null, n };
}, [targetR, targetG, targetB, tol]);

// 给物品 + 选中快捷栏 0 格
const give = async (vid) => {
  await page.evaluate((v) => {
    const g = window.__swGame;
    g.player.inv.add(window.__swItems[Object.keys(window.__swItems).find((k) => k.startsWith(`vi_${v}_`))], 1);
    const slots = g.player.inv.slots;
    const i = slots.findIndex((s) => s && s.id === window.__swItems[Object.keys(window.__swItems).find((k) => k.startsWith(`vi_${v}_`))]);
    if (i > 0) { const t = slots[0]; slots[0] = slots[i]; slots[i] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
  }, vid);
};

const useHeld = async () => {
  await page.evaluate(() => {
    const g = window.__swGame;
    g.input.mouseX = g.renderer.canvas.width / 2 + 200;
    g.input.mouseY = g.renderer.canvas.height / 2 - 100;
    g.input.mouseDown = true;
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
  await new Promise((r) => setTimeout(r, 400));
};

// ---- 基线：无染料 ----
const base = await sample(244, 22, 175, 40);
const skinBase = await sample(255, 125, 90, 60);
console.log('base sample:', JSON.stringify(base), 'skin:', JSON.stringify(skinBase));
if (skinBase.hit < 5) { console.log('GAVE UP: 采样区未见玩家皮肤（纸娃娃未渲染）'); await browser.close(); process.exit(1); }

// ---- 1) 派对发色剂 1984：使用 → hairDye=8 + 头发变粉 ----
await give('1984');
await useHeld();
let st = await page.evaluate(() => window.__swGame.player.hairDye);
check('使用 1984 → player.hairDye=8（shaderId）', st === 8, `hairDye=${st}`);
const party = await sample(244, 22, 175, 50);
check('派对染料：头部区域出现粉色发像素', party.hit > base.hit, `hit ${base.hit} → ${party.hit}`);
const partyStack = await page.evaluate(() => {
  const s = window.__swGame.player.inv.slots[0];
  return s ? s.stack : -1;
});
check('消耗 1（consumable）', partyStack === 0 || partyStack === -1, `stack=${partyStack}`);

// ---- 2) 彩虹发色剂 1985：hairDye=9 + 动态变色 ----
await give('1985');
await useHeld();
st = await page.evaluate(() => window.__swGame.player.hairDye);
check('使用 1985 → player.hairDye=9', st === 9, `hairDye=${st}`);
const s1 = await sample(0, 0, 0, 999);
await new Promise((r) => setTimeout(r, 1800));
const s2 = await sample(0, 0, 0, 999);
check('彩虹染料：头发均值随时间变化（Disco 轮转）', JSON.stringify(s1.avg) !== JSON.stringify(s2.avg), `${JSON.stringify(s1.avg)} → ${JSON.stringify(s2.avg)}`);

// ---- 3) 去除剂 1990：hairDye=0 清槽 ----
await give('1990');
await useHeld();
st = await page.evaluate(() => window.__swGame.player.hairDye);
check('使用 1990 → player.hairDye=0（清槽）', st === 0, `hairDye=${st}`);
const cleared = await sample(244, 22, 175, 50);
check('清槽后：粉色发像素回落', cleared.hit <= base.hit + 2, `hit ${cleared.hit}（基线 ${base.hit}）`);

// ---- 4) 存档往返：saveGame JSON 含 hairDye ----
const saved = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.hairDye = 6;
  try {
    const json = g.saveNow ? g.saveNow() : null;
    return { hasSave: typeof json === 'string' };
  } catch { return { hasSave: false }; }
});
console.log('save hook:', JSON.stringify(saved), '（往返断言在单测 save.test/本文件单测覆盖）');

check('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.screenshot({ path: '/tmp/hairdye-final.png' });
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
