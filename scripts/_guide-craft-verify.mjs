// 向导「制作」反查 v3-f 终版（物理槽全手感：左键整组/右键单枚/SwapItem 对换/
// 材料放置门/关板自动归仓；无选材网格；右上停靠不压背包）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
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
  const vidOf = (iid) => {
    const def = (window.__swITEMS || [])[iid];
    const m = def && /^vi_(\d+)_/.exec(def.key);
    return m ? Number(m[1]) : -1;
  };
  const woodInBag = () => g.player.inv.slots.find((s) => s && vidOf(s.id) === 9)?.stack ?? 0;
  try {
    // ---- 前置 ----
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    g.player.x = guide.cx - 30; g.player.y = guide.cy - 8; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp; g.player.dead = false;
    for (let i = 0; i < g.player.inv.slots.length; i++) g.player.inv.slots[i] = null;
    const woodId = window.__swFlow.itemByVid(9);
    g.player.inv.slots[0] = { id: woodId, stack: 40 };
    g.openNpcDialog.call(g, guide);

    // ---- PHASE-A 面板初态（无材料）----
    g.npcDialogButton('craft');
    await new Promise((r) => setTimeout(r, 120));
    const overlay = document.querySelector('.sw-guide-overlay');
    ok('A1 关对话+浮层现', g.dialogNpc === null && !!overlay);
    ok('A2 无选材搜索网格（原版无此物）',
      ![...(overlay.querySelectorAll('input'))].some((i) =>
        /材料名称|key \/ 原版 id/.test(i.placeholder || '')),
      [...overlay.querySelectorAll('input')].map((i) => i.placeholder).join('/'));
    const slotEl = document.querySelector('.sw-guide-slot');
    ok('A3 实体槽虚线空态', !!slotEl && getComputedStyle(slotEl).borderStyle === 'dashed');
    ok('A4 空槽 caption=inter[24]', (overlay.querySelector('.sw-guide-slot + div')?.textContent ?? '').includes('在此放置材料'), `raw=[${(overlay.querySelector('.sw-guide-slot + div')?.textContent ?? '')}]`);
    ok('A5 空槽配方=0', overlay.querySelectorAll('.sw-recipe').length === 0);
    const pr = overlay.firstElementChild.getBoundingClientRect();
    ok('A6 右停靠不压背包', pr.right <= innerWidth - 8 && pr.left >= innerWidth * 0.5);
    ok('A7 容器穿透（背包侧可点）',
      document.elementFromPoint(60, 300)?.closest('.sw-guide-overlay') == null);

    // ---- PHASE-B 放置木材（拟真抓取：包内同步扣减）----
    window.__swUI['heldStack'] = { id: woodId, stack: 10 };
    g.player.inv.slots[0].stack -= 10;              // 40 → 30
    slotEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    const rowsB = overlay.querySelectorAll('.sw-recipe');
    ok('B1 caption=使用 木材×10 且列表驱动',
      /木材 ×10/.test(overlay.textContent) && rowsB.length > 0,
      `rows=${rowsB.length}`);
    // ★反查列表全亮锚（CollectGuideRecipes Recipe.cs:441 不做环境/材料过滤——
    //   用户截图实锤偏差：曾错套常规列表“缺料变灰”，满包木材站徒手仍全灰）
    const noCount = [...rowsB].filter((r) => r.classList.contains('no')).length;
    ok('P2b 反查列表全亮（零 .no 行）', noCount === 0, `noRows=${noCount}/${rowsB.length}`);
    // ---- 筛选（Modern 式按名筛列）----
    const filterInput = overlay.querySelector('input');
    filterInput.value = '工作台';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const vis = [...rowsB].filter((r2) => r2.style.display !== 'none');
    ok('B2 按名筛列全部命中', vis.length > 0 && vis.every((r2) => /工作台/.test(r2.textContent || '')),
      `visible=${vis.length}/${rowsB.length}`);
    filterInput.value = ''; filterInput.dispatchEvent(new Event('input', { bubbles: true }));

    // ---- PHASE-C 合成扣料产出（包内 30 木）----
    const woodBeforeCraft = woodInBag();
    const benchRow = [...rowsB].find((r2) => (r2.textContent || '').trim().startsWith('工作台')
      && !(r2.textContent || '').includes('+'));
    const preClick = {
      placed: JSON.stringify(window.__swUI['guidePlaced']),
      held: JSON.stringify(window.__swUI['heldStack']),
      bagWood: woodInBag(),
      rowClass: benchRow.className,
      isSameNode: [...rowsB].indexOf(benchRow) >= 0,
    };
    benchRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const postClick = {
      placed: JSON.stringify(window.__swUI['guidePlaced']),
      held: JSON.stringify(window.__swUI['heldStack']),
      bagWood: woodInBag(),
      benchAnywhere: (() => { const hits=[]; g.player.inv.slots.forEach((s,i)=>{ if(s && s.id===558) hits.push(i+':'+s.stack); }); return hits.join(',') || 'none'; })(),
      defKey558: (window.__swITEMS||[])[558]?.key,
      invId558Count: g.player.inv.slots.filter((s)=>s&&s.id===558).length,
    };
    ok('C1 扣 10 木+入包工作台', postClick.bagWood === postClick.bagWood && false || false);
    out.steps.push(`[diag] pre=${JSON.stringify(preClick)} post=${JSON.stringify(postClick)}`);

    // ---- PHASE-D 取回到手 → 收拢入包 ----
    slotEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 80));
    const heldTaken = window.__swUI['heldStack'];
    ok('D1 左键空手取整组到手', window.__swUI['guidePlaced'] === null
      && heldTaken?.id === woodId && heldTaken?.stack === 10,
      JSON.stringify(heldTaken));
    ok('D2 取回后配方清空', overlay.querySelectorAll('.sw-recipe').length === 0);
    const bagAfterStash = (() => {
      const cur = window.__swUI['heldStack'];
      if (!cur) return woodInBag();
      const slotHit = g.player.inv.slots.find((s) => s && vidOf(s.id) === vidOf(cur.id));
      if (slotHit) slotHit.stack += cur.stack; else g.player.inv.slots[0] = { ...cur };
      window.__swUI['heldStack'] = null;
      return woodInBag();
    })();
    ok('D3 收拢入包', bagAfterStash === 30, `bag=${bagAfterStash}`);

    // ---- PHASE-E 右键单枚机 + 材料门 + SwapItem 对换 ----
    {
      const fire = (btn) => slotEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: btn }));
      const recsMod = await import('/src/data/vanillaRecipes.ts');
      const tipMod = await import('/src/ui/itemTooltip.ts');
      void recsMod;
      const materialSet = tipMod.materialIids();
      const matHas = (v) => materialSet.has(v);
      // E1 门：动态取一个“非材料”样本（materialIids 为配方原料反查近似——
      //   曾假设 Joja 可乐非材料，实测某些面把它卷进原料集导致断言翻转）
      const badDef = (window.__swITEMS || []).findIndex((d) => {
        if (!d || !d.key || !d.key.startsWith('vi_')) return false;
        const m = /^vi_(\d+)_/.exec(d.key);
        return m ? !materialSet.has(Number(m[1])) : false;
      });
      if (badDef >= 0) {
        window.__swUI['heldStack'] = { id: badDef, stack: 1 };
        fire(0); await new Promise((r) => setTimeout(r, 60));
        ok('E1 非材料被门拒绝', !window.__swUI['guidePlaced'] && !!window.__swUI['heldStack'],
          `def=${badDef} key=${(window.__swITEMS[badDef]||{}).key}`);
        window.__swUI['heldStack'] = null;
      } else ok('E1 跳过', true);
      // E2 右键单枚：抓 10 放置 → 右键取1 → 右键放1
      window.__swUI['heldStack'] = { id: woodId, stack: 10 };
      g.player.inv.slots.find((s) => s && vidOf(s.id) === 9).stack -= 10;   // 30→20
      fire(0); await new Promise((r) => setTimeout(r, 60));
      ok('E2 前置 放置×10', !!window.__swUI['guidePlaced']);
      fire(2); await new Promise((r) => setTimeout(r, 60));
      ok('E2 右键取 1 到手', window.__swUI['heldStack']?.stack === 1
        && window.__swUI['guidePlaced']?.stack === 9);
      fire(2); await new Promise((r) => setTimeout(r, 60));
      ok('E2 右键放 1 回槽', window.__swUI['heldStack'] === null
        && window.__swUI['guidePlaced']?.stack === 10);
      // E3 SwapItem 对换（火把 8 ⇄ 木材 9，双方皆材料）
      window.__swUI['heldStack'] = { id: window.__swFlow.itemByVid(8), stack: 3 };
      fire(0); await new Promise((r) => setTimeout(r, 60));
      const plS = window.__swUI['guidePlaced'];
      ok('E3 异型双材料对换', !!plS && vidOf(plS.id) === 8
        && window.__swUI['heldStack']?.id === woodId && window.__swUI['heldStack']?.stack === 10,
        `slot=${plS ? `${vidOf(plS.id)}x${plS.stack}` : 'null'} hand=${JSON.stringify(window.__swUI['heldStack'])}`);
      // E4 行图标双保险口径（src 或占位方块）——行存在于放置态，抽验首行
      let icOk = false;
      const tIc = Date.now();
      while (true) {
        const im = document.querySelector('.sw-guide-overlay .sw-recipe>img.prod');
        if (!im) break;
        if ((im.getAttribute('src') || '').length > 0 || im.classList.contains('g-noicon')) { icOk = true; break; }
        if (Date.now() - tIc >= 3000) break;
        await new Promise((r) => setTimeout(r, 120));
      }
      ok('E4 行图标无空白（src/占位）', icOk,
        `cls=${document.querySelector('.sw-guide-overlay .sw-recipe>img.prod')?.className}`);

      // 清场：直还两组进背包（槽内火把3 / 手持木材10），并回到 PHASE-F 基线
      const toBag = [{ id: 8, stack: 3 }, ...(window.__swUI['heldStack'] ? [window.__swUI['heldStack']] : [])];
      window.__swUI['heldStack'] = null;
      for (const it of toBag) {
        const k2 = ((window.__swITEMS || [])[it.id] || {}).key ?? '';
        const hit = g.player.inv.slots.find((s2) => s2 && vidOf(s2.id) === it.id);
        if (hit) hit.stack += it.stack;
        else {
          const free = g.player.inv.slots.findIndex((s2) => !s2);
          g.player.inv.slots[free >= 0 ? free : 0] = { id: (() => {
            const idx = (window.__swITEMS || []).findIndex((d) => d && d.key === ('vi_' + it.id + '_'));
            return idx >= 0 ? idx : g.player.inv.slots[0].id;
          })(), stack: it.stack };
        }
      }
    }

    // ---- PHASE-F Esc 关闭自动归还（独立小段守恒）----
    const fStart = woodInBag();
    window.__swUI['heldStack'] = { id: woodId, stack: 8 };
    g.player.inv.slots.find((s) => s && vidOf(s.id) === 9)?.stack;
    g.player.inv.slots.find((s) => s && vidOf(s.id) === 9).stack -= 8;
    slotEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 80));
    ok('F1 归还前放置成立', !!window.__swUI['guidePlaced']);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 100));
    ok('F2 Esc 关闭+自动归还守恒',
      !document.querySelector('.sw-guide-overlay') && woodInBag() === fStart,
      `start=${fStart} now=${woodInBag()}`);

    // ---- G 幽灵跟随 + 行图标（置于放置语境末段，避免空列表态断言假红）----
    {
      // G-1 重开浮层（F 已关闭；直调公开方法，避免依赖对话按钮）
      window.__swUI['closeGuideSearch']?.();
      window.__swUI['openGuideSearch']();
      await new Promise((r) => setTimeout(r, 100));
      const liveSlot = document.querySelector('.sw-guide-slot');
      // 手持材料注入（不放置！幽灵=模拟“正拿在手里”的视觉跟随）
      window.__swUI['heldStack'] = { id: woodId, stack: 5 };
      const overlayG = document.querySelector('.sw-guide-overlay');
      // G1 手持进入面板：ghost 显形且贴着鼠标
      const pr0 = overlayG.firstElementChild.getBoundingClientRect();
      const cx = Math.round(pr0.left + 80), cy = Math.round(pr0.top + 30);
      overlayG.firstElementChild.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
      await new Promise((r) => setTimeout(r, 60));
      const ghost = document.getElementById('sw-held-ghost');
      const diag = {
        elExists: !!document.getElementById('sw-held-ghost'),
        mvBound: !!window.__swUI['guideGhostMove'],
        rect: JSON.stringify(overlayG.firstElementChild.getBoundingClientRect()).slice(0, 80),
        tgtTag: (() => { let e2 = overlayG.firstElementChild; return e2 ? e2.tagName + '.' + e2.className : 'x'; })(),
      };
      window.__swUI['guideGhostMove']?.({ clientX: cx + 10, clientY: cy + 5 });
      await new Promise((r) => setTimeout(r, 30));
      const evtLog = [];
      const capSpy = (e3) => { if (e3.clientX === cx) evtLog.push(`cap ${e3.clientX},${e3.clientY}`); };
      window.addEventListener('mousemove', capSpy, { capture: true });
      ok('G1 面板内幽灵显形', !!ghost && ghost.style.display === 'block'
        && Math.abs(parseInt(ghost.style.left) - (cx + 20)) <= 2,
        `left=${ghost ? ghost.style.left : 'null'} expect=${cx + 20} log=${JSON.stringify(evtLog)}`);
      window.removeEventListener('mousemove', capSpy, { capture: true });
      // G2 尾随
      overlayG.firstElementChild.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: cx + 60, clientY: cy + 18 }));
      await new Promise((r) => setTimeout(r, 40));
      ok('G2 幽灵尾随(+10 偏移)', Math.abs(parseInt(ghost.style.left) - (cx + 70)) <= 2,
        `left=${ghost.style.left} expect=${cx + 70}`);
      // （v3f：区域门已去除——手持期间全屏跟随，与 canvas 手持绘制层级一致；离开面板不再隐去）

    }

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
