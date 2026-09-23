// BJ313 探针:永夜刃 273 四层效果运行时观测(弹幕生成/绘制/尘/光)
// 层1 弹幕:挥击 273 → projectiles 桶应出现 SwingArc(972 锚弧)+NightsEdgeFly(972 飞斩)
// 层2 绘制:SwingArc.draw 被调且 projSprite(972) 非 null(贴图缺=不可见="没弹幕")
// 层3 尘:AI_190 972 支 per-frame 尘14(1/5)/尘27(1/2) + 持械挥砍尘(:45158 独立面)
// 层4 光:尘27 原版默认发光(无 noLight);972 弹体无 AddLight(原文本相);挥击瞬间取样
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let crashed = null;
page.on('pageerror', (e) => { crashed = crashed ?? e.message; console.error('PAGEERROR:', e.message.slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const arcMod = await import('/src/entities/SwingArc.ts');
  const { itemCombat, combatWeapon } = await import('/src/data/vanillaItemCombat.ts');
  const res = {};
  // ---- 定位 273 的 def ----
  let idx273 = -1;
  items.ITEM_DEFS.forEach((d, i) => { if (d && d.vid === 273) idx273 = i; });
  res.def273 = { idx: idx273, key: idx273 >= 0 ? items.ITEM_DEFS[idx273].key : null, vid: idx273 >= 0 ? items.ITEM_DEFS[idx273].vid : null };
  const c273 = itemCombat(273);
  res.combat273 = { shoot: c273?.shoot, shootSpeed: c273?.shootSpeed, noMelee: c273?.noMelee, melee: c273?.melee, autoReuse: c273?.autoReuse, useAnimation: c273?.useAnimation };
  const cw = idx273 >= 0 ? combatWeapon({ ...items.ITEM_DEFS[idx273], vid: 273 }) : null;
  res.cw273 = cw ? { kind: cw.kind, shoot: cw.shoot, useAnimation: cw.useAnimation } : null;
  // ---- 场地:平地清空 ----
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 4;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  for (let dy = -14; dy <= 1; dy++) for (let dx = -24; dx <= 24; dx++) st.setTile(px + dx, gy + dy, 0);
  for (let dx = -24; dx <= 24; dx++) st.setTile(px + dx, gy + 1, 2);
  g.player.x = px * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp;
  // ---- 挂观测:spawnDust 计数 + SwingArc.draw 计数 + draw 内 img ----
  const dustCounts = {};
  const origSpawnDust = g.spawnDust.bind(g);
  g.spawnDust = function (x, y, w, h, type, ...rest) {
    dustCounts[type] = (dustCounts[type] ?? 0) + 1;
    return origSpawnDust(x, y, w, h, type, ...rest);
  };
  let drawCalls = 0, drawImgNull = 0, drawSamples = [];
  const origDraw = arcMod.SwingArc.prototype.draw;
  arcMod.SwingArc.prototype.draw = function (r) {
    drawCalls++;
    // 复制 draw 的贴图判定
    const { projSprite } = window.__projSpriteMod;
    const img = projSprite(this.projId);
    if (!img || !(img.width > 0)) drawImgNull++;
    if (drawSamples.length < 6) drawSamples.push({ projId: this.projId, t: this.t, ai1: this.ai1, num: +this.num.toFixed(3), op: +this.op.toFixed(3), imgOk: !!(img && img.width > 0), imgW: img?.width ?? 0 });
    return origDraw.call(this, r);
  };
  window.__projSpriteMod = await import('/src/entities/Arrow.ts');
  // 原始类型计数(识别 SwingArc/NightsEdgeFly 实体)
  const origFixed = arcMod.SwingArc.prototype.fixedUpdate;
  let arcFixedCalls = 0, dustArcFrames = 0;
  arcMod.SwingArc.prototype.fixedUpdate = function (dt, game) {
    arcFixedCalls++;
    if (this.projId === 972) dustArcFrames++;
    return origFixed.call(this, dt, game);
  };
  // ---- 挥击 273:装入热栏 0 号,鼠标按下 40 帧(覆盖 anim 25t) ----
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx273, stack: 1 };
  // 鼠标指向玩家右侧(世界坐标换算交给 game 内部:直接设 input.mouseX/Y 于画布中心右侧)
  g.input.mouseX = g.renderer.canvas.width / 2 + 200;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  res.obs = { drawCalls, drawImgNull, drawSamples, arcFixedCalls, dustCounts };
  // ---- 桶快照(挥击刚结束,弧可能已 Kill)→ 再挥一次在 t=5 时快照 ----
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx273, stack: 1 };
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const bucket = g.entities.projectiles.map((p) => ({ ctor: p.constructor.name, projId: p.projId, x: Math.round(p.x), y: Math.round(p.y), ai0: p.ai0, ai1: p.ai1, damage: p.damage }));
  res.bucketAfter2t = bucket;
  res.swingState = { swingItem: g.swing?.item, t: g.swing?.t, dur: g.swing?.dur, useTime: g.player.useTime };
  // ---- 光照取样:弧中心 3 帧后(挥击 1 内取) ----
  // 用下一挥:重挥,在 t=6 读 g.lighting 或 lightAt(若存在)
  res.noCrash = true;
  return res;
});
console.log(JSON.stringify({ ...out, pageCrashed: crashed }, null, 1));
await browser.close();
