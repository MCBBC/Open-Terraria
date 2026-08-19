// 偏移表消费端探针:MinionProj(aiStyle 26 随从族)绘制锚点对齐原版公式
// (Main.cs:34040:贴图左上=(盒左+num144, 盒上−num143);AI_026 spriteDirection≡−1)。
// 型号取 875(静态表 [16,−16])与 191(动态表 [26,−22])双代表。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const mod = await import('/src/entities/WeaponProj.ts');
  const out = {};
  // 拦截 drawImage:9 源参形态(frame 切片)记录 dest 原点(局部系)
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  try {
    for (const [id, expOff] of [[191, [26, -22]]]) {
      g.entities.projectiles.length = 0;
      const m = new MinionProj(p.x + 60, p.y - 40, id, 10, 2, false, 0, false, () => p);
      m.w = 16; m.h = 16;   // 显式盒
      g.entities.add(m, 'projectiles');
      // 帧图尺寸(Projectile_191 帧 50×48;懒加载 → 先等本体绘制出现)
      const rec = [];
      proto.drawImage = function (img) {
        // ★本体绘制是 5 参形态 drawImage(img, dx, dy, dw, dh);9 参是帧切片制作
        if (arguments.length === 5 && arguments[3] === 50 && arguments[4] === 48) rec.push([arguments[1], arguments[2]]);
        return orig.apply(this, arguments);
      };
      await new Promise((r) => setTimeout(r, 2000));
      m.dead = true;
      proto.drawImage = orig;
      // 原版公式(Main.cs:34040):dest 原点 = (−num145, −(盒高/2+num143))
      // num145 = (帧宽+盒宽)/2 = (50+16)/2 = 33;num143 = 26(动态表 [26,−22])
      out[id] = {
        calls: rec.slice(-3).map((c) => [+c[0].toFixed(1), +c[1].toFixed(1)]),
        exp: [-(50 + 16) / 2, -(16 / 2 + expOff[0])],
        n: rec.length,
        hasTable: mod.projDrawOffsetFor(id, -1, 16) !== null,
        off: mod.projDrawOffsetFor(id, -1, 16),
      };
    }
  } finally {
    proto.drawImage = orig;
  }
  return out;
});

for (const [id, info] of Object.entries(res)) {
  const i = info;
  check(`${id} 在偏移表内(消费端可达)`, i.hasTable, JSON.stringify(i.off));
  const last = i.calls[i.calls.length - 1];
  check(`${id} 绘制原点 = (−num145, −(盒高/2+num143))(原版公式,${i.n} 帧采样)`,
    last && Math.abs(last[0] - i.exp[0]) < 0.51 && Math.abs(last[1] - i.exp[1]) < 0.51,
    `got ${last ? JSON.stringify(last) : 'none'} want ${JSON.stringify(i.exp)}`);
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
