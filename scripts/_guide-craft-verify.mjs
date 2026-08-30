// 向导「制作」反查功能端到端验证（2026-08-30 终审）：
// ①真实对话链（向导开框→点制作→关对话+浮层）②搜索定位材料 chip
// ③CollectGuideRecipes 列表语义=以该物为材料的全部配方（可用/不可用混列）
// ④点击可用行→vanillaCraft 真实扣料产出 ⑤不可用行点击静默（守门）
// ⑥Esc 关闭浮层（对称摘除）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (n, c, e2 = '') => { out.steps.push(`${c ? 'PASS' : 'FAIL'} ${n}${e2 ? ' | ' + e2 : ''}`); return c; };
  let dlg = null;
  g.cb.onNpcDialog = (...a) => { dlg = { chat: a[1], buttons: a[2] }; };
  try {
    // ---- 前置：向导贴身 + 满血 + 背包清空 + 给 30 木头 ----
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    g.player.x = guide.cx - 30; g.player.y = guide.cy - 8; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp; g.player.dead = false;
    g.openNpcDialog.call(g, guide);

    // 清背包
    for (let i = 0; i < g.player.inv.slots.length; i++) g.player.inv.slots[i] = null;
    // 木头（vid 9）
    const woodId = window.__swFlow.itemByVid(9);
    ok('前置 木头 id 解析', typeof woodId === 'number' && woodId > 0, `id=${woodId}`);
    g.player.inv.slots[0] = { id: woodId, stack: 30 };
    g.player.inv.selected = 0;

    // ---- K1 真实按钮链：craft → 对话关 + 浮层现 ----
    g.npcDialogButton('craft');
    await new Promise((r) => setTimeout(r, 120));
    ok('K1 对话已关', g.dialogNpc === null);
    const overlay = document.querySelector('.sw-guide-overlay');
    ok('K1 反查浮层出现', !!overlay);
    const input = overlay && overlay.querySelector('input');
    ok('K1 搜索框在位', !!input);
    if (!overlay || !input) return out;

    // ---- 隔离环境（无站台空旷天空）：列表照列全配方，可用性届时快照——
    //      ★必须晚于 craft 点击：页内 rAF 每帧距离关对话，先传送会让按钮链失效
    g.player.x = Math.floor(g.world.store.w / 2) * 16;
    g.player.y = (g.world.groundLevel - 40) * 16;
    await new Promise((r) => setTimeout(r, 300));

    // ---- K0 初态=空候选+inter[24] 引导语（原版空槽语义回归锚）----
    const initChips = overlay.querySelectorAll('div[title]').length;
    const hintText = overlay.querySelector('.sw-lbl')?.textContent ?? '';
    ok('K0 初态无候选列表', initChips === 0, `chips=${initChips}`);
    ok('K0 引导语=在此放置材料', hintText.includes('在此放置材料'), hintText);

    // ---- K2 搜索锁定木头 chip 并点击 ----
    input.value = 'vi_9_';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    const chips = [...overlay.querySelectorAll('.sw-lbl')].length; // chips 是自绘 div 无类名锚? 用行内子元素判定兜底
    const itemChips = [...overlay.querySelectorAll('div[title]')];
    ok('K2 chip 命中', itemChips.length >= 1, `chips=${itemChips.length} rows=${chips}`);
    // 点击 title 含木/Wood 的第一个 chip
    const target = itemChips.find((d) => /wood|木/i.test(d.getAttribute('title') || '')) || itemChips[0];
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const recipes = overlay.querySelectorAll('.sw-recipe');
    ok('K2 配方列表非空', recipes.length > 0, `rows=${recipes.length}`);

    // ---- K3 工作台行存在且可用（10 木手搓，与任何站台无关）；另必须有 .no 行（全列不裁剪证据）----
    // ★按【产品名】前缀锁定：/工作台/ 会误中“木箭 …（站点：工作台）”这类行——
    // 行文本结构=产品名(+×n)+空间隔信息段（station/材料）
    const benchRow = [...recipes].find((r) => (r.textContent || '').trim().startsWith('工作台')
      && !(r.textContent || '').includes('+'));
    ok('K3 工作台配方在列', !!benchRow, benchRow ? benchRow.textContent.slice(0, 42) : '');
    ok('K3 可用行不带 no 态', !!benchRow && !benchRow.classList.contains('no'));
    const noRows = [...recipes].filter((r) => r.classList.contains('no'));
    ok('K3 不可用行同样列出（CollectGuideRecipes 全列口径）', noRows.length > 0, `no=${noRows.length}/${recipes.length}`);
    ok('K3 可用行样式含 sw-recipe 正主类', !!benchRow && benchRow.classList.contains('sw-recipe'));

    // ---- K4 点击工作台行 → 扣 10 木 + 入包 1 工作台 ----
    const vidOf = (iid) => {
      const def = (window.__swITEMS || [])[iid];
      const m = def && /^vi_(\d+)_/.exec(def.key);
      return m ? Number(m[1]) : -1;
    };
    const woodBefore = g.player.inv.slots.find((s) => s && vidOf(s.id) === 9)?.stack ?? 0;
    benchRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const woodAfter = g.player.inv.slots.find((s) => s && vidOf(s.id) === 9)?.stack ?? 0;
    const gained = g.player.inv.slots.some((s) => s && s.stack > 0 && vidOf(s.id) === 36);
    ok('K4 合成后木材恰扣 10', woodAfter === woodBefore - 10, `before=${woodBefore} after=${woodAfter}`);
    ok('K4 工作台成品入包', gained);

    // ---- K5 不可用行点击守门（静默）----
    const noRow = noRows[0];
    if (noRow) {
      const snapBefore = JSON.stringify(g.player.inv.slots.map((s) => (s ? `${s.id}:${s.stack}` : '')));
      noRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      const snapAfter = JSON.stringify(g.player.inv.slots.map((s) => (s ? `${s.id}:${s.stack}` : '')));
      ok('K5 不可用行点击零变化', snapBefore === snapAfter);
    } else {
      ok('K5 无不可用行样本跳过守门断言', true);
    }

    // ---- K6 Esc 关闭浮层（本次批补的对等关闭路径）----
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 80));
    ok('K6 Esc 关闭浮层', !document.querySelector('.sw-guide-overlay'));
  } catch (err) {
    out.steps.push('ERR ' + String((err && err.stack) || err).slice(0, 400));
  }
  return out;
});

for (const s of res.steps) console.log(s.replace(/^(\w+) (.*)$/, (_, t, n) => `${t}: ${n}`));
check('页面零 JS 错误', errs.length === 0, errs.join(' | ').slice(0, 240));
const fails = res.steps.filter((s) => s.startsWith('FAIL') || s.startsWith('ERR'));
check('全部断言通过', fails.length === 0, `${fails.length} 个失败`);
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
