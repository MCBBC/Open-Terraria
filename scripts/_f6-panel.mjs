// F6 召唤面板 + F2 无敌 调试工具冒烟（_ 一次性探针，tools/run-diag.mjs 运行）：
//   F6 键真实开面板 → DOM 存在/行数 >0 → 面板内点名生成(世吞链/Boss 槽/城镇NPC) →
//   清怪 → Esc 收面板；F2 键真实切无敌 → damage 免伤 + 血蓝回满。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- F6 真实按键开面板 ----
await page.keyboard.press('F6');
await new Promise((r) => setTimeout(r, 300));
let out = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    open: !!g.summonPanel?.open,
    dom: !!document.querySelector('[data-role=list]'),
    rows: document.querySelectorAll('[data-role=list] > div').length,
    blocking: g.input.uiBlocking,
  };
});
check('F6 开面板（键位链路 main.ts → Game）', out.open && out.dom);
check('列表渲染 >100 行', out.rows > 100, `rows=${out.rows}`);
check('面板打开时 uiBlocking', out.blocking);

// 搜索过滤（输入框）
out = await page.evaluate(() => {
  const q = document.querySelector('[data-role=q]');
  q.value = '262';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  return document.querySelectorAll('[data-role=list] > div').length;
});
check('搜索 262 过滤出少量行', out > 0 && out < 50, `rows=${out}`);

// ---- 点名生成：面板动作（等价行点击回调） ----
out = await page.evaluate(() => {
  const g = window.__swGame;
  const err = g.debugSpawnNpc(13, 1, false);          // 世吞头 13
  const head = g.entities.enemies.find((e) => e.vanillaId === 13 && !e.dead);
  const segs = g.entities.enemies.filter((e) => (e.vanillaId === 14 || e.vanillaId === 15) && !e.dead).length;
  const err2 = g.debugSpawnNpc(262, 1, false);         // 世纪之花
  const plantera = g.entities.enemies.find((e) => e.vanillaId === 262 && !e.dead);
  const err3 = g.debugSpawnNpc(22, 1, false);          // 向导（城镇 NPC）
  const npc = g.entities.npcs?.find((n) => n.vanillaId === 22);
  g.fixedUpdate(1 / 60);                               // 一帧 AI：钩蔓入场
  const hooks = g.entities.enemies.filter((e) => e.vanillaId === 263 && !e.dead).length;
  return { err, err2, err3, head: !!head, segs, bossSlot: g.boss === plantera, npc: !!npc, hooks };
});
check('世吞召唤（头+体节链 15-30）', out.head && out.segs >= 15, `segs=${out.segs}`);
check('世纪之花召唤 + Boss 槽接管', !!out.bossSlot && out.err2 === null);
check('入场三钩蔓', out.hooks === 3, `hooks=${out.hooks}`);
check('城镇 NPC 走 TownNPC 桶', out.npc, `err3=${out.err3}`);
{
  const r = await page.evaluate(() => {
    // 动态找表外 id（473 等已在 2026-08-11 补齐,勿写死）——首个报错者即样本
    for (let id = 620; id < 700; id++) {
      const probe = window.__swGame.debugSpawnNpc(id, 1, false);
      if (probe !== null) return { id, probe };
    }
    return { id: -1, probe: null };
  });
  check('无数据 id 报错文案', r.probe !== null, `id=${r.id} err=${r.probe}`);
}

// 清怪
out = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.debugClearEnemies();
  const left = g.entities.enemies.filter((e) => !e.dead).length;
  return { n, left, boss: g.boss };
});
check('清除敌怪 + Boss 槽清空', out.n > 0 && out.left === 0 && out.boss === null, `cleared=${out.n}`);

// Esc 收面板
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 200));
out = await page.evaluate(() => ({ open: !!window.__swGame.summonPanel?.open, blocking: window.__swGame.input.uiBlocking }));
check('Esc 收面板 + 解除 uiBlocking', !out.open && !out.blocking);

// ---- F2 真实按键无敌 ----
out = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.hp = 10; g.player.mana = 0;
  return {};
});
await page.keyboard.press('F2');
out = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const dmgRet = p.damage(500, p.cx - 40, p.y);
  g.fixedUpdate(1 / 60);                    // tick 头回满
  return { god: p.debugGod, dmgRet, hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana };
});
check('F2 开无敌：damage 早退', out.god && out.dmgRet === false);
check('F2 血蓝回满', out.hp === out.maxHp && out.mana === out.maxMana,
  `hp=${out.hp}/${out.maxHp} mana=${out.mana}/${out.maxMana}`);

await page.keyboard.press('F2');   // 关闭无敌
out = await page.evaluate(() => window.__swGame.player.debugGod);
check('F2 再按关闭', !out);

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
