// 智能光标（Smart Cursor）E2E 探针：
//   ① Toggle：Ctrl 按一次开 / 再按关
//   ② 持镐站洞穴走廊、鼠标指墙后 → showing 且目标 = 射线沿途首个实心非平台块
//   ③ 镐不选平台：平台列被射线穿透，目标落在其后的石墙
//   ④ 持斧指向树冠 → 目标归位树根格
//   ⑤ 持火把空房 → 目标 = 离鼠标最近的合法锚位；附近已有火把 → 17×17 去重跳开
// 运行：node scripts/_smart-cursor-probe.mjs（需 dev server :5199）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

/** 持有并选中某物品（window.__swItems = ITEM_BY_KEY 桥） */
async function hold(itemKey) {
  return page.evaluate((k) => {
    const g = window.__swGame;
    const id = window.__swItems[k];
    if (id == null) return null;
    g.player.inv.add(id, 1);
    const slots = g.player.inv.slots;
    const i = slots.findIndex((it) => it && it.id === id);
    if (i > 0) { const t = slots[0]; slots[0] = slots[i]; slots[i] = t; }
    g.player.inv.selected = 0;
    return id;
  }, itemKey);
}

/** 直接驱动一帧智能光标 lookup（等价 Game.updateSmartCursor 的 env 构造，鼠标给世界坐标） */
async function lookupAt(wx, wy, tool) {
  return page.evaluate(([x, y, tl]) => {
    const g = window.__swGame;
    const sc = g.smartCursor;
    sc.wanted = true;
    sc.lookup({
      st: g.world.store,
      mouse: { x, y },
      actor: { x: g.player.x, y: g.player.y, w: g.player.w, h: g.player.h, cx: g.player.cx, cy: g.player.cy, facing: g.player.facing },
      held: { def: tl && tl.kind === 'torch' ? { key: 'torch', tile: 'torch' } : null, tool: tl && tl.kind !== 'torch' ? { type: tl.kind, power: tl.power } : null },
      settings: {
        toggleMode: true, smartAxeAfterPickaxe: false,
        smartBlocksEnabled: true, holdCanReleaseMidUse: true,
      },
      tileBoost: 0, wireToolMode: 0, occupants: [], controlUseItem: true,
    });
    return { showing: sc.showing, x: sc.x, y: sc.y };
  }, [wx, wy, tool]);
}

// ---- 场景：洞穴走廊。玩家站 px0，可达区 x∈[px0-5,px0+5]：
//      平台列 px0+4（射线穿透）+ 石墙 px0+5（镐目标）+ 树干列 px0+3 ----
const S = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const py0 = Math.floor(g.world.rockLevel) + 40;
  const px0 = Math.floor(g.player.cx / 16) + 6;
  for (let dy = -12; dy <= 2; dy++) {
    for (let dx = -6; dx <= 20; dx++) {
      st.setTile(px0 + dx, py0 + dy, dy === 2 ? 2 : 0);
      st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
    }
  }
  // 平台列 px0+4（tileSolidTop → 射线应穿透）+ 石墙 px0+5
  for (let dy = -3; dy <= 1; dy++) st.setTile(px0 + 4, py0 + dy, 11); // 11 = 平台
  for (let dy = -3; dy <= 1; dy++) st.setTile(px0 + 5, py0 + dy, 2);  // 2  = 石块
  g.player.x = px0 * 16; g.player.y = (py0 - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  return { px0, py0 };
});

// ---- ① Toggle：真实 Ctrl 键沿 ----
await hold('copper_pickaxe');
await page.keyboard.down('ControlLeft');
await new Promise((r) => setTimeout(r, 120));
await page.keyboard.up('ControlLeft');
await new Promise((r) => setTimeout(r, 250));
check('① Toggle 按下沿 → wanted=true', await page.evaluate(() => window.__swGame.smartCursor.wanted) === true);
await page.keyboard.down('ControlLeft');
await new Promise((r) => setTimeout(r, 120));
await page.keyboard.up('ControlLeft');
await new Promise((r) => setTimeout(r, 250));
check('① Toggle 再按 → wanted=false', await page.evaluate(() => window.__swGame.smartCursor.wanted) === false);

// ---- ② 持镐：鼠标指墙后 → 目标=石墙列（非鼠标格） ----
const t2 = await lookupAt((S.px0 + 10) * 16 + 8, (S.py0 - 1) * 16 + 8, { kind: 'pick', power: 35 });
check('② 持镐 showing=true', t2.showing === true, JSON.stringify(t2));
check('② 目标=石墙列（射线首个实心块）', t2.showing && t2.x === S.px0 + 5, `want x=${S.px0 + 5} got (${t2.x},${t2.y})`);
check('② 目标不是鼠标格', t2.x !== S.px0 + 10);

// ---- ③ 平台列被穿透（目标不在 px0+4） ----
check('③ 镐不选平台（px0+4 平台列被穿透）', t2.showing && t2.x !== S.px0 + 4, `got x=${t2.x}`);

// ---- ④ 持斧指向树冠 → 树根格（树干列 px0+3，根在 py0-4 贴 py0-3 地面） ----
await page.evaluate((s) => {
  const st = window.__swGame.world.store;
  for (let dy = -9; dy <= -4; dy++) st.setTile(s.px0 + 3, s.py0 + dy, 8); // 8 = 树干
  st.setTile(s.px0 + 3, s.py0 - 3, 2); // 树根下的地面
}, S);
const t4 = await lookupAt((S.px0 + 3) * 16 + 8, (S.py0 - 9) * 16 + 8, { kind: 'axe', power: 7 });
check('④ 持斧指向树冠 → 目标=树根格', t4.showing && t4.x === S.px0 + 3 && t4.y === S.py0 - 4,
  `want (${S.px0 + 3},${S.py0 - 4}) got (${t4.x},${t4.y})`);

// ---- ⑤ 持火把：最近合法锚位 + 17×17 去重 ----
const torchTool = { kind: 'torch' };
const t5a = await lookupAt((S.px0 + 4) * 16 + 8, (S.py0 + 1) * 16 + 8, torchTool);
check('⑤ 持火把 → 最近合法锚位（地板上方）', t5a.showing && t5a.y === S.py0 + 1, JSON.stringify(t5a));
// 放一根火把，鼠标移到火把左侧 2 格（避开让位集：悬停火把格本身会让位）
await page.evaluate(([x, y]) => { window.__swGame.world.store.setTile(x, y, 12); }, [t5a.x, t5a.y]);
const torchStill = await page.evaluate(([x, y]) => window.__swGame.world.store.get(x, y), [t5a.x, t5a.y]);
check('⑤ 场景：火把已放置（tile=12）', torchStill === 12, `tile=${torchStill}`);
const t5b = await lookupAt((S.px0 + 2) * 16 + 8, (S.py0 + 1) * 16 + 8, torchTool);
check('⑤ 已有火把 → 17×17 去重跳开（目标距火把 ≥9 格）',
  t5b.showing && Math.abs(t5b.x - t5a.x) >= 9, `torch@(${t5a.x},${t5a.y}) second=(${t5b.x},${t5b.y})`);

console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
