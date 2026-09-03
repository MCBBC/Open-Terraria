// 一次性诊断：CheckPot per-style 瓦砾 Gore 分档探针（★pot-goreTier 2026-09-02 十批移植验证）。
// 语义源：WorldGen.cs:57358-57431（switch(num4) 逐档 Gore.NewGore(new Vector2(i*16,j*16),
// default(Vector2), <id>) —— 整件一次、命中格左上角、速度 default 由 NewGore :1347-1348
// 内置扰动）。本仓移植：Game.smashPotInner（src/core/Game.ts，标记 pot-goreTier）。
// 断言面：
//  ① per-style gore id 档：0→[51,52,53] / 1-3 各三元组 / 4-6→[197,198] / 7-9→[199,200] /
//    10-12→[201,202] / 13-15→[203,204] / 16-24→【无】(:57388 显式 break) /
//    25-27→2 枚 Next(217,220) / 28-30→2 枚 Next(315,317) / 31-33→Next(2,5) 枚 698+Next(6) /
    //    34-36→[1122,1123,1124] / 37(越界)→无
//  ② 位置 = 命中格（右下格触发）左上角 (i*16,j*16)，非锚格
//  ③ 时序 = [sfx(音效分档), gore×n, loot]（音效 :57333-57344 → 杀环 :57347-57356 →
//    gore :57358-57431 → SpawnThingsFromPot :57490）
//  ④ frameX 带基变体（0/36/72,PlacePot :54557 genRand.Next(3)*36）不干扰分档
//  ⑤ 素材链：vanilla/Gore_51.png 经 atlas.ensureVImage 懒载可得（Renderer.drawGorePiece 出口）
// 运行：node tools/run-diag.mjs scripts/_pot-gore.mjs（SW_ORIGIN 指私有 vite 实例）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (23).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const gp = await import('/src/entities/GorePiece.ts');
  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const POT = idOfSheet(28), STONE = idOfSheet(1);
  const out = { cases: [], asset: null };

  // ---- 出口拦截：gore/sfx/loot 单一时间线（proto/静态 monkeypatch，同 _decor-sweep ⑧ 手法）----
  const timeline = [];
  const origNewGore = gp.GorePiece.newGore.bind(gp.GorePiece);
  gp.GorePiece.newGore = (type, x, y, vx, vy, scale, perfect) => {
    timeline.push({ kind: 'gore', type, x, y });
    return origNewGore(type, x, y, vx, vy, scale, perfect);
  };
  const origSfx = g.sfx.play.bind(g.sfx);
  g.sfx.play = (key, ...a) => { timeline.push({ kind: 'sfx', key, x: a[1], y: a[2] }); return origSfx(key, ...a); };
  const origLoot = g.potLoot.bind(g);
  g.potLoot = (...a) => { timeline.push({ kind: 'loot' }); return origLoot(...a); };

  /** 期望档（与原版 switch(num4) 同构） */
  const expectFor = (style) => {
    if (style === 0) return { ids: [51, 52, 53] };
    if (style === 1) return { ids: [166, 167, 168] };
    if (style === 2) return { ids: [169, 170, 171] };
    if (style === 3) return { ids: [172, 173, 174] };
    if (style >= 4 && style <= 6) return { ids: [197, 198] };
    if (style >= 7 && style <= 9) return { ids: [199, 200] };
    if (style >= 10 && style <= 12) return { ids: [201, 202] };
    if (style >= 13 && style <= 15) return { ids: [203, 204] };
    if (style <= 24) return { ids: [] };
    if (style <= 27) return { pool: [217, 218, 219], n: 2 };
    if (style <= 30) return { pool: [315, 316], n: 2 };
    if (style <= 33) return { pool: [698, 699, 700, 701, 702, 703], n: [2, 4] };
    if (style <= 36) return { ids: [1122, 1123, 1124] };
    return { ids: [] };
  };
  const sfxExpect = (style) => (style >= 7 && style <= 9) ? 'chop'
    : (style >= 16 && style <= 24) ? 'killed' : 'shatter';

  // ---- 场景构造：石基行 + 2×2 罐（顶行 fy=style*36 / 底行 fy=style*36+18，
  //      frameX=带基变体+dx*18,PlacePot :54557-54562 帧式）→ 右下格触发 smashPot ----
  const PX = 100, PY = 30;   // 空中清净区（基地行 PY+2）
  let seq = 0;
  const smashStyle = (style, fxBand) => {
    timeline.length = 0;
    const by = PY + 2 + (seq % 4) * 8;            // 每案下移,避免残渣
    seq++;
    for (let dx = 0; dx < 2; dx++) {
      st.setTileSilent(PX + dx, by, STONE, 0, 0);                 // 基行
      st.setTileSilent(PX + dx, by - 1, POT, fxBand + dx * 18, style * 36 + 18);   // 底行
      st.setTileSilent(PX + dx, by - 2, POT, fxBand + dx * 18, style * 36);        // 顶行
    }
    g.smashPot(PX + 1, by - 1);                    // 命中格=右下（非锚 ax=PX,ay=by-2）
    const gore = timeline.filter((e) => e.kind === 'gore');
    const sfxEv = timeline.filter((e) => e.kind === 'sfx');
    const sfxKeys = sfxEv.map((e) => e.key);
    const kinds = timeline.map((e) => e.kind);
    const residue = [0, 1].flatMap((dx) => [0, 1].map((dy) => st.get(PX + dx, by - 2 + dy)));
    for (let dx = 0; dx < 2; dx++) for (let dy = -2; dy <= 0; dy++) st.setTile(PX + dx, by + dy, 0);
    return { gore, sfxKeys, sfxPos: sfxEv.map((e) => ({ x: e.x, y: e.y })), kinds, residue, hitX: PX + 1, hitY: by - 1 };

  };

  const CASES = [
    [0, 0], [0, 36], [0, 72],                     // 普通罐 + 三档带基变体
    [1, 0], [2, 0], [3, 0],
    [4, 0], [6, 0], [7, 0], [9, 0],
    [10, 0], [13, 0], [15, 0],
    [16, 0], [19, 0], [24, 0],                    // 16-24：只出音效
    [25, 0], [27, 0], [28, 0], [30, 0],
    [31, 0], [33, 0], [34, 0], [36, 0],
    [37, 0],                                      // 越界 style：无分支=无瓦砾
  ];
  for (const [style, fx] of CASES) {
    const r = smashStyle(style, fx);
    const exp = expectFor(style);
    let ok, detail;
    if (exp.ids) {
      const ids = r.gore.map((e) => e.type);
      ok = ids.length === exp.ids.length && ids.every((v, k) => v === exp.ids[k]);
      detail = { got: ids, want: exp.ids };
    } else {
      const ids = r.gore.map((e) => e.type);
      const [lo, hi] = Array.isArray(exp.n) ? exp.n : [exp.n, exp.n];
      ok = ids.length >= lo && ids.length <= hi && ids.every((v) => exp.pool.includes(v));
      detail = { got: ids, want: `${exp.n} 枚 ∈ ${exp.pool}` };
    }
    const posOk = r.gore.every((e) => e.x === r.hitX * 16 && e.y === r.hitY * 16);
    const sfxOk = r.sfxKeys.length > 0 && r.sfxKeys[0] === sfxExpect(style);
    // ★potSfxPos（④,十三批）：音效位置=命中格左上角 (i*16,j*16)（:57335/:57339/:57343
    //  三档同式,i/j=CheckPot 入参）——曾用锚格中心 (ax*16+16, ay*16+16)
    const sfxPosOk = r.sfxPos.length > 0 && r.sfxPos[0].x === r.hitX * 16 && r.sfxPos[0].y === r.hitY * 16;
    const orderOk = r.kinds.length >= 2 && r.kinds[0] === 'sfx'
      && r.kinds.slice(1, 1 + r.gore.length).every((k) => k === 'gore')
      && r.kinds[r.kinds.length - 1] === 'loot';
    const cleanOk = r.residue.every((v) => v === 0);
    out.cases.push({ style, fx, goreOk: ok, posOk, sfxOk, sfxPosOk, sfxPos: r.sfxPos[0], hitX: r.hitX, hitY: r.hitY, orderOk, cleanOk, ...detail, sfxGot: r.sfxKeys[0] });
  }

  // ---- 素材链：Gore_51 懒载可得（首取触发加载 → 等待 → 再取 width>0）----
  const atlas = g.renderer?.atlas;
  atlas?.ensureVImage?.('vanilla/Gore_51.png');
  await new Promise((r) => setTimeout(r, 1200));
  const img = atlas?.ensureVImage?.('vanilla/Gore_51.png');
  out.asset = img ? { loaded: true, w: img.width, h: img.height } : { loaded: false };

  // ---- 还原出口 ----
  gp.GorePiece.newGore = origNewGore;
  g.sfx.play = origSfx;
  g.potLoot = origLoot;

  // ---- ⑦ 十二批：653 Rubblemaker 材质罐定额带（CheckPot 653 分支 :57432-57487）----
  // 整件清 + style 定额带掉材质块一件 + 显式不吃 SpawnThingsFromPot（:57488）；
  // potLoot 被替换为哨兵（抛错）以证明 653 不到达罐族战利品表
  try {
    const items = await import('/src/data/items.ts');
    const tiles653 = await import('/src/data/tiles.ts');
    const T653 = idOfSheet(653);
    const origLoot653 = g.potLoot;
    g.potLoot = () => { throw new Error('653 reached potLoot'); };
    const bands = [[0, 133], [6, 664], [9, 4564], [12, 154], [33, 3081], [37, 0]];
    const out653 = [];
    let seq6 = 0;
    for (const [style, wantVid] of bands) {
      const by = PY + 2 + (seq6 % 4) * 8; seq6++;
      const bx = PX + 40 + (seq6 % 3) * 8;
      timeline.length = 0;
      for (let dx = -1; dx <= 3; dx++) for (let dy = -3; dy <= 1; dy++) {
        if (st.inBounds(bx + dx, by + dy)) st.setTileSilent(bx + dx, by + dy, 0, 0, 0);
      }
      for (let dx = 0; dx < 2; dx++) st.setTileSilent(bx + dx, by, STONE, 0, 0);
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
        st.setTileSilent(bx + dx, by - 2 + dy, T653, dx * 18, style * 36 + dy * 18);
      const cap = [];
      const origSpawn = g.spawnDrop.bind(g);
      g.spawnDrop = (px, py, key, n) => {
        const m = /^vi_(\d+)/.exec(String(key));
        if (m) cap.push(Number(m[1]));
        return origSpawn(px, py, key, n);
      };
      let lootErr = false;
      try { g['breakTile'].call(g, bx + 1, by - 1); } catch (e) { lootErr = String(e).includes('potLoot'); }
      g.spawnDrop = origSpawn;
      let cleared = true;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
        if (st.get(bx + dx, by - 2 + dy) !== 0) cleared = false;
      const resolvable = wantVid > 0 && !!items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[wantVid] ?? ''];
      out653.push({ style, wantVid, got: cap, resolvable, cleared, lootErr });
    }
    g.potLoot = origLoot653;
    out.p653 = out653;
    out.p653ok = out653.every((r) => r.cleared && !r.lootErr
      && (r.resolvable ? r.got.includes(r.wantVid) : r.got.length === 0));
  } catch (e) { out.p653 = { error: String(e) }; out.p653ok = false; }
  return out;
});

await browser.close();

let fail = 0;
for (const c of res.cases) {
  const ok = c.goreOk && c.posOk && c.sfxOk && c.sfxPosOk && c.orderOk && c.cleanOk;
  if (!ok) fail++;
  console.log(`style ${String(c.style).padStart(2)} fx${String(c.fx).padStart(3)}  gore=${JSON.stringify(c.got)}`
    + `  [gore${c.goreOk ? '✓' : '✗(' + JSON.stringify(c.want) + ')'} pos${c.posOk ? '✓' : '✗'}`
    + ` sfx${c.sfxOk ? '✓' : '✗(' + c.sfxGot + ')'} sfxPos${c.sfxPosOk ? '✓' : '✗(' + JSON.stringify(c.sfxPos) + ' want(' + c.hitX * 16 + ',' + c.hitY * 16 + ')'} order${c.orderOk ? '✓' : '✗:' + JSON.stringify(c.orderOk)}`
    + ` clean${c.cleanOk ? '✓' : '✗'}]`);
}
console.log(`asset Gore_51.png: ${JSON.stringify(res.asset)}`);
if (!res.asset?.loaded) fail++;
if (!res.p653ok) { fail++; console.log('p653:', JSON.stringify(res.p653)); }
console.log(fail === 0 ? 'ALL PASS' : `FAILED: ${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
