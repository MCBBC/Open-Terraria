// 一次性探针:生命果（236）生长链真机端到端——
//  ① constructor 后置条件:真 Game+真演化域,脚本化蔓延流直呼 grassGrowth →
//     2×2 落地+帧语义（36*styleX/{+18}×0/{+18},底承双列丛林草）
//  ② 脚本化 spreadRng 定谳（BJ233 重制,原判据欠功效登记=红蓝-N1）:真实采样果支
//     λ≈0.75/轮（12000 tick 期望 <1 株,accelFruit>=4 ≈掷硬币）→ 改 patch
//     spreadRng.next 队列直呼 grassGrowth:落地面 5 掷 styleX 0/1/2 全档 + 距离门
//     负例 + hardMode 关负例,全确定性;另保留真实循环接线烟囱（3000 tick 内
//     grassGrowth 对试验场派发计数 ≥10,λ≈150 统计零翻车,真实果数只作信息面）
//  ③ 真实循环负例:关 hardMode → 6000 tick 零生命果（确定性:果支门含 hardMode）
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const SID = new Map();
  for (let id = 0; id < tiles.TILE_DEFS.length; id++) {
    const sh = tiles.TILE_DEFS[id]?.vanilla?.sheet;
    if (sh != null && !SID.has(sh)) SID.set(sh, id);
  }
  const S = (sh) => SID.get(sh) ?? 0;
  const sheetOf = (id) => tiles.TILE_DEFS[id]?.vanilla?.sheet ?? -1;
  const countIn = (x0, x1, y0, y1, sheet) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (st.flags[st.idx(x, y)] && sheetOf(st.type[st.idx(x, y)]) === sheet) n++;
    return n;
  };

  // 真机械/困难 flags（用户实报场景=双机械）
  g.world.flags.hardMode = true;
  g.world.flags['downed_134'] = true;
  g.world.flags['downed_125'] = true;

  // 地下丛林地板地形：groundLevel+120 起 5 层,层距 6（草行+下承泥 2 行+空气 3 行）
  const px = Math.floor(g.player.cx / 16);
  const baseY = Math.floor(g.world.groundLevel) + 120;
  const floors = [];
  for (let f = 0; f < 5; f++) {
    const y = baseY + f * 6;
    floors.push(y);
    for (let x = px - 250; x <= px + 250; x++) {
      st.setTile(x, y, S(60));
      st.setTile(x, y + 1, S(59));
      st.setTile(x, y + 2, S(59));
      st.setTile(x, y - 1, 0);
      st.setTile(x, y - 2, 0);
      for (let dy = 1; dy <= 2; dy++) { st.liquid[st.idx(x, y - dy)] = 0; }   // 洞窟积水清位（case60 liquid 门）
    }
  }
  const region = { x0: px - 252, x1: px + 252, y0: baseY - 3, y1: baseY + 5 * 6 + 2 };

  // ① constructor 后置条件:脚本化蔓延流 [顶植物败,1/25 过,1/40 过,style=0]
  const evo = g.evolution;
  evo.update();   // 刷新演化域 hardMode 缓存字段（update() 头每 tick 重读 flags）
  const gy = floors[2];
  const rng = evo.spreadRng;
  const origNext = rng.next.bind(rng);
  const q = [0.99, 0.0, 0.0, 0.0];
  let qi = 0;
  rng.next = () => (qi < q.length ? q[qi++] : 0.99);
  evo.grassGrowth(px, gy, px - 1, px + 2, gy - 1, gy + 2, true);
  rng.next = origNext;
  const dump = [[px - 1, gy - 2], [px, gy - 2], [px - 1, gy - 1], [px, gy - 1]]
    .map(([x, y]) => [x, y, st.flags[st.idx(x, y)], st.type[st.idx(x, y)], sheetOf(st.type[st.idx(x, y)])]);
  const post = {
    dump,
    tiles236: countIn(px - 2, px + 2, gy - 3, gy - 1, 236),
    frames: [[px - 1, gy - 2], [px, gy - 2], [px - 1, gy - 1], [px, gy - 1]].map(([x, y]) => [st.frameX[st.idx(x, y)], st.frameY[st.idx(x, y)]]),
    grassKept: sheetOf(st.type[st.idx(px, gy)]) === 60,
  };
  // 清理定谳果,进入 ② 脚本化定谳段（BJ233 重制）
  for (const [x, y] of [[px - 1, gy - 2], [px, gy - 2], [px - 1, gy - 1], [px, gy - 1]]) st.setTile(x, y, 0);

  // ② 脚本化 spreadRng 定谳（BJ233:原 12000 tick 真实采样果支 λ≈0.75/轮 →
  //   accelFruit>=4 ≈掷硬币）。patch spreadRng.next 队列直呼 grassGrowth——
  //   果支抽序 4 掷（同 ①）:[0.99 顶植物败, 0 过 1/25, 0 过 1/40(classic lifeDoor),
  //   styleX 骰] 。mechAll()=false（未钉 127）→ 球茎 1/60 掷被 && 短路,流位与 ① 一致。
  const evoRng = evo.spreadRng;
  const origNext2 = evoRng.next.bind(evoRng);   // ① 已占 origNext 名
  const scriptedGrow = (x, y, style) => {
    const q = [0.99, 0.0, 0.0, [0, 0.4, 0.8][style]];   // floor(q×3)=styleX,避开 1/3 浮点边界
    let qi = 0;
    evoRng.next = () => (qi < q.length ? q[qi++] : 0.99);
    evo.grassGrowth(x, y, x - 1, x + 2, y - 1, y + 2, true);
    evoRng.next = origNext2;
  };
  const cellsOf = (x, y) => [[x - 1, y - 2], [x, y - 2], [x - 1, y - 1], [x, y - 1]];
  const clearFruit = (x, y) => { for (const [cx, cy] of cellsOf(x, y)) st.setTile(cx, cy, 0); };
  const probeCells = (x, y) => cellsOf(x, y).map(([cx, cy]) => {
    const i = st.idx(cx, cy);
    return { sh: st.flags[i] ? sheetOf(st.type[i]) : -1, fx: st.frameX[i] ?? 0, fy: st.frameY[i] ?? 0 };
  });
  const clearRegion236 = () => {
    for (let y = region.y0; y <= region.y1; y++) for (let x = region.x0; x <= region.x1; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && sheetOf(st.type[i]) === 236) st.setTile(x, y, 0);
    }
  };
  clearRegion236();   // 清天然/①拍残留 236——②各掷互不串味

  // ②a 落地面:5 掷 × styleX 0/1/2 全档,锚距 ≥70（躲 ±60 格 236 距离扫描）→
  //   逐掷 2×2 落地 + 帧 36*styleX 逐格断言（确定性,零统计等待）;失败掷带诊断转储
  const attempts = [];
  for (const [ax, style] of [[px - 240, 0], [px - 150, 1], [px - 60, 2], [px + 30, 0], [px + 120, 1]]) {
    scriptedGrow(ax, gy, style);
    const cells = probeCells(ax, gy);
    const want = 36 * style;
    const landed = cells.every((c) => c.sh === 236)
      && JSON.stringify(cells.map((c) => [c.fx, c.fy]))
        === JSON.stringify([[want, 0], [want + 18, 0], [want, 18], [want + 18, 18]]);
    if (!landed) {
      // 诊断:四格实况 + 底承两列 sheet + 锚上液面 + 距离扫描窗内 236 计数
      const sup = [-1, 0].map((d) => sheetOf(st.type[st.idx(ax + d, gy)]));
      let scanHas = 0;
      for (let x = ax - 60; x < ax + 60; x += 2) for (let y = gy - 60; y < gy + 60; y += 2) {
        const i = st.idx(x, y);
        if (st.flags[i] && sheetOf(st.type[i]) === 236) scanHas++;
      }
      attempts.push({ dx: ax - px, style, landed, cells, sup, liquid: st.liquid[st.idx(ax, gy - 1)], scanHas });
    } else attempts.push({ dx: ax - px, style, landed });
    clearFruit(ax, gy);
  }

  // ②b 距离门负例（cs:75061-75077 距离内无 236 扫描）:有果在场 +30 格同队列掷 →
  //   零落且不落 233 兜底（236 门过即 break——else 233 臂不可达,原版字面）
  const gx = px + 190;
  const distGate = {
    preClean: countIn(px + 158, px + 252, region.y0, region.y1, 236) === 0,   // 距离扫描窗内零残留
    first: 0, blocked: false,
  };
  scriptedGrow(gx, gy, 2);
  distGate.first = probeCells(gx, gy).filter((c) => c.sh === 236).length === 4;
  scriptedGrow(gx + 30, gy, 0);
  distGate.blocked = probeCells(gx + 30, gy).every((c) => c.sh === -1);
  clearFruit(gx, gy); clearFruit(gx + 30, gy);

  // ②c hardMode 关负例（确定性）:hardMode 门短路 → 果支不可达 → 233 兜底株
  //   确定性落地（else 臂正覆盖——负例顺带钉死兜底分支不空转）
  g.world.flags.hardMode = false;
  evo.update();   // 刷新演化域 hardMode 缓存（update() 头每 tick 重读 flags）
  scriptedGrow(px - 240, gy, 0);
  const hmOff = probeCells(px - 240, gy);
  const noFruitHMOff = {
    tiles236: hmOff.filter((c) => c.sh === 236).length,
    plant233: hmOff.filter((c) => c.sh === 233).length,
  };
  clearFruit(px - 240, gy);
  g.world.flags.hardMode = true;
  evo.update();

  // ②d 真实循环接线烟囱:真实 update() 采样对试验场 grassGrowth 的派发计数。
  //   sheet 60 ∈ SPREAD_UNDERGROUND → 主链无骰直派（undergroundTile else-if 链）;
  //   λ≈3000tick×75 样本×(2505 格/地下面积)≈150,门 ≥10 统计零翻车。
  //   真实果数只作信息面——不做统计门,防 λ 波动假红（欠功效病灶不复辟）。
  let realDispatch = 0;
  const origGG = evo.grassGrowth.bind(evo);
  evo.grassGrowth = function (i, j, ...rest) {   // 影子自有属性,delete 即还原原型方法
    if (i >= region.x0 && i <= region.x1 && j >= region.y0 && j <= region.y1) realDispatch++;
    return origGG(i, j, ...rest);
  };
  for (let t = 0; t < 3000; t++) evo.update();
  delete evo.grassGrowth;
  const realFruit = countIn(region.x0, region.x1, region.y0, region.y1, 236);

  // ③ 真实循环负例:关 hardMode → 清果 → 6000 tick 零生命果
  //   （确定性:果支门含 hardMode,任意 tick 数零果——门测真实接线不断）
  g.world.flags.hardMode = false;
  evo.update();
  clearRegion236();
  for (let t = 0; t < 6000; t++) evo.update();
  const negFruit = countIn(region.x0, region.x1, region.y0, region.y1, 236);
  g.world.flags.hardMode = true;

  return { post, attempts, distGate, noFruitHMOff, realDispatch, realFruit, negFruit, floors: floors.length };
});
console.log('[lifefruit-probe]', JSON.stringify(out));
const ok = out.post.tiles236 === 4
  && JSON.stringify(out.post.frames) === JSON.stringify([[0, 0], [18, 0], [0, 18], [18, 18]])
  && out.post.grassKept
  && out.attempts.length === 5 && out.attempts.every((a) => a.landed)
  && out.distGate.preClean && out.distGate.first && out.distGate.blocked
  && out.noFruitHMOff.tiles236 === 0 && out.noFruitHMOff.plant233 === 4
  && out.realDispatch >= 10
  && out.negFruit === 0;
console.log(ok ? 'PROBE PASS' : 'PROBE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
