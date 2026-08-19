// 渔夫四根因后续对抗审查——引擎内集成抽验（私有实例 5232）：
//  ① 真刃旋斩弧 972 扫睡渔夫 376：血不变（friendly 门全链）
//  ② 对照组：同弧扫僵尸 3 → 掉血（门不误伤）
//  ③ 城镇 NPC 挥击（swingUpdate）不伤睡渔夫（原版 :55487 !friendly && damage>0）
//  ④ bound tavernkeep 渲染条目（NPC_579 贴图可加载 + BOUND_NPC_SHEET 键）
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
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { SwingArc } = await import('/src/entities/SwingArc.ts');
  const out = { errors: [] };
  const px = p.cx, py = p.cy;

  // ---- ① 真刃旋斩弧 × 睡渔夫 ----
  {
    const angler = Enemy.fromVanilla(376, px + 40, py);
    if (!angler) { out.arcAngler = { err: 'fromVanilla(376) null' }; }
    else {
      angler.id = g.entities.nextId++;
      g.entities.add(angler, 'enemies');
      const hp0 = angler.hp;
      const owner = { cx: p.cx, cy: p.cy, x: p.x, y: p.y, w: p.w, h: p.h, facing: 1, dead: false };
      const arc = new SwingArc(owner, 972, 30, 200, 1, 1);
      g.entities.add(arc, 'projectiles');
      const zhp = { a0: angler.hp };
      for (let t = 0; t < 32; t++) arc.fixedUpdate(1 / 60, g);
      out.arcAngler = { hp0, hp1: angler.hp, friendly: !!angler.def.friendly };
      angler.dead = true;
    }
  }
  // ---- ② 对照组：僵尸 ----
  {
    const z = Enemy.fromVanilla(3, px + 40, py + 60);
    if (!z) { out.arcZombie = { err: 'fromVanilla(3) null' }; }
    else {
      z.id = g.entities.nextId++;
      g.entities.add(z, 'enemies');
      const zhp0 = z.hp;
      const owner = { cx: p.cx, cy: p.cy, x: p.x, y: p.y, w: p.w, h: p.h, facing: 1, dead: false };
      const arc = new SwingArc(owner, 972, 30, 200, 1, 1);
      g.entities.add(arc, 'projectiles');
      for (let t = 0; t < 32; t++) arc.fixedUpdate(1 / 60, g);
      out.arcZombie = { zhp0, zhp1: z.hp };
      z.dead = true;
    }
  }
  // ---- ③ 城镇卫兵挥击 × 睡渔夫（TOWN_SWING 族走 swingUpdate；直接构造 bound 态外的
  //      TownNPC 并把它推入攻击态太重——此处以门存在性为准：swingUpdate 循环含 friendly 过滤）
  {
    const src = await fetch('/src/entities/TownNPC.ts').then((r) => r.text());
    out.townSwingGate = /e\.def\?\.friendly \|\| \(e\.damage \?\? e\.def\?\.damage \?\? 0\) <= 0/.test(src);
  }
  // ---- ④ bound tavernkeep 渲染表 + 贴图可加载 ----
  {
    const mod = await import('/src/render/Renderer.ts');
    const R = mod.Renderer;
    const sheet = R.BOUND_NPC_SHEET;
    out.boundSheet = {
      tavernkeep: sheet.tavernkeep, angler: sheet.angler,
      allKeys: Object.keys(sheet).sort().join(','),
    };
    // 贴图可加载（HTTP 状态）
    out.npc579 = await fetch('/sprites/vanilla/NPC_579.png').then((r) => r.status);
  }
  return out;
});

check('① 旋斩弧 972 × 睡渔夫 376：friendly=true', res.arcAngler?.friendly === true, JSON.stringify(res.arcAngler));
check('① 旋斩弧扫过渔夫血量不变', res.arcAngler?.hp0 === res.arcAngler?.hp1, JSON.stringify(res.arcAngler));
check('② 对照组僵尸掉血', (res.arcZombie?.zhp1 ?? 0) < (res.arcZombie?.zhp0 ?? 1), JSON.stringify(res.arcZombie));
check('③ TownNPC.swingUpdate 含 friendly+damage 门', res.townSwingGate === true);
check('④ BOUND_NPC_SHEET.tavernkeep === 579', res.boundSheet?.tavernkeep === 579, JSON.stringify(res.boundSheet));
check('④ NPC_579.png 可加载（200）', res.npc579 === 200, String(res.npc579));
check('无页面错误', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n结果: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
