// 双案验证探针（2026-08-28 用户报）：
// ① NPC 商店行图标张冠李戴——iconUrl 收内部 id 而商店喂 vid（ITEM_DEFS[vid] 错位
//    def）。断言:派对女孩 10 件在售 vid 的行图标 dataURL ≡ 按【正确内部 id】复刻
//    iconUrl 的产物（同帧同绘制序 → 字节相等）。
// ② 烟雾弹 1168 使用后无烟——烟尾曾挂在撞块支=飞行全程零烟。断言:投掷后弹体
//    存在 + d31 烟尘按 tick 流式产出（首尘滞后 ≤8 tick）+ 截图可见烟尾。
// 用法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_shopicon-smoke-probe.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

let pass = 0, fail = 0;
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${e ? '  ' + e : ''}`); ok ? pass++ : fail++; };

// ---- 进游戏（chip-align 直进模式：小平原世界）----
const boot = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 300, H = 180;
  const world = new World(W, H, 777, 'shop-icon-probe');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < W; x++) { for (let y = 95; y < H; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  for (let i = 0; i < 40 && !window.__swItems; i++) await new Promise((r2) => setTimeout(r2, 50));
  const g0 = window.__swGame;
  if (g0.player.dead) g0.respawnPlayer?.();   // 裸世界出生 hp0=死态,updateUse 全链被 dead 门拦
  document.getElementById('sw-boot-prime')?.remove();   // 向日葵幕遮截图(z10000 黑幕,直进流程不撤)
  // 欢迎弹层点掉（z 高于商店面板,遮截图）
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
  return { inGame: !!g0 && !!window.__swUI, dead: g0.player.dead };
});
check('进游戏', boot.inGame === true, JSON.stringify(boot));

// ---- ① 商店行图标：派对女孩 208 全部常驻在售（day 档 1449 走常驻 4552 的对位——
//      探针固定白天,直接用 stock 里 cond:null 的 10 件）----
const PARTY_GIRL_VIDS = [859, 1000, 1168, 1345, 1450, 3253, 4553, 2700, 2738, 4470];
const shop = await page.evaluate(async (vids) => {
  const ui = window.__swUI;
  const VIK = window.__swVANILLA_ITEM_KEY_BY_ID;
  const ITEM_BY_KEY = window.__swItems, ITEM_DEFS = window.__swITEM_DEFS;
  const { atlasIconForKey, sliceItemAnimFrame } = await import('/src/assets/SpriteAtlas.ts');
  const { VANILLA_ITEM_COLOR, blendItemColorTint } = await import('/src/data/vanillaItemColor.ts');
  const { vanillaIdOfItemKey } = await import('/src/data/vanillaRecipes.ts');
  const atlas = window.__swAtlas;
  // 商店族样式由 NpcDialog 构造注入（sw-npc-style）——真流程先对话后开店必已注入;
  // 探针直呼 showNpcShop 需手动补（否则面板裸块,截图难看但断言不受影响）
  if (!document.getElementById('sw-npc-style')) {
    const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
    new NpcDialog(document.body, () => {});
  }
  ui.showNpcShop('probe-shop', vids.map((vid) => ({
    key: VIK[vid] ?? '', vanillaId: vid, name: 'id' + vid, price: 1,
  })), 999999999);
  // 复刻 iconUrl（内部 id 路径）期望产物——与 UI.ts 同绘制序,同源同参 → dataURL 字节相等
  const expectedOf = (vid) => {
    const key = VIK[vid];
    const internal = key !== undefined ? ITEM_BY_KEY[key] : undefined;
    if (internal === undefined) return null;
    const def = ITEM_DEFS[internal];
    let ar = atlasIconForKey(atlas, def.key);
    if (!ar) return null;
    if (def.key.startsWith('vi_')) {
      const vm = /^vi_(\d+)_/.exec(def.key);
      if (vm) ar = sliceItemAnimFrame(Number(vm[1]), ar, 0);
    }
    if (ar.img instanceof HTMLImageElement && !(ar.img.width > 0)) return null;
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    const s = Math.min(1, 32 / ar.sw, 32 / ar.sh);
    const w = ar.sw * s, h = ar.sh * s;
    cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, (32 - w) / 2, (32 - h) / 2, w, h);
    const tvid = def.vid ?? vanillaIdOfItemKey(def.key);
    const tint = tvid > 0 ? VANILLA_ITEM_COLOR[tvid] : undefined;
    if (tint && tint[3] > 0) {
      const id32 = cx.getImageData(0, 0, 32, 32);
      blendItemColorTint(id32.data, tint);
      cx.putImageData(id32, 0, 0);
    }
    return c.toDataURL();
  };
  // 轮询至全部就绪（atlas 懒加载 + UI 600ms 升级拍同源）
  let report = [];
  for (let tries = 0; tries < 40; tries++) {
    await new Promise((r2) => setTimeout(r2, 300));
    report = vids.map((vid) => {
      const el = document.querySelector(`.sw-shop-item[data-id="${vid}"]`);
      const img = el ? el.querySelector('img') : null;
      const exp = expectedOf(vid);
      return {
        vid, row: !!el, hasImg: !!img, expReady: !!exp,
        match: !!(img && exp && img.src === exp),
      };
    });
    if (report.every((x) => x.match)) break;
  }
  // 错位取证：旧路径 ITEM_DEFS[vid] 的 def 键（内嵌别的 vid → 错图根因）
  const oldPath = vids.map((vid) => ({
    vid, correct: VIK[vid] ?? '(缺)', wrongOld: ITEM_DEFS[vid] ? ITEM_DEFS[vid].key : '(越界)',
  }));
  // 等 HUD 根显示（进游戏后段才放 .sw-root,早拍截不到面板）
  for (let i = 0; i < 40; i++) {
    const rootEl = document.querySelector('.sw-root');
    if (rootEl && getComputedStyle(rootEl).display !== 'none' && document.querySelector('.sw-hotbar')) break;
    await new Promise((r2) => setTimeout(r2, 300));
  }
  return { report, oldPath };
}, PARTY_GIRL_VIDS);
check('商店行=正确图标(dataURL 全等)', shop.report.every((x) => x.match),
  JSON.stringify(shop.report.filter((x) => !x.match)));
check('旧路径确系错位(逐件 oldKey≠newKey)', shop.oldPath.every((x) => x.correct !== x.wrongOld),
  JSON.stringify(shop.oldPath.slice(0, 3)));
await page.screenshot({ path: '/tmp/shop-icons-fixed.png' });

// ---- ③ 点击穿透：行上合成 mousedown → input.mouseDown 必须保持 false（修前穿透
//      开火/挖掘）。用合成事件而非 page.mouse.click：click 的 down/up 连发会与
//      mouseup 复位竞速；且裸世界直进绕过菜单过渡,boot 幕(z10000)未撤会吃掉
//      命中测试——合成事件直钉 target,单测守门本身。对照组:canvas 上合成
//      mousedown → mouseDown 照常 true（门不得过度拦截） ----
const clickRes = await page.evaluate(() => {
  const g = window.__swGame;
  const row = document.querySelector('.sw-shop-item');
  const down = (el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    const md = g.input.mouseDown;
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return md;
  };
  const mdRow = row ? down(row) : null;
  const mdCanvas = down(g.renderer.canvas);
  window.__swUI.npcShop?.close?.();
  return { mdRow, mdCanvas };
});
check('商店行点击不穿透为游戏输入', clickRes.mdRow === false, JSON.stringify(clickRes));
check('世界画布点击照常进输入(门不过拦)', clickRes.mdCanvas === true, JSON.stringify(clickRes));

// ---- ② 烟雾弹 1168：装弹连投 → 弹体存在 + d31 逐 tick 产出 ----
const smoke = await page.evaluate(async () => {
  // 关店（part ① 面板别进截图）
  document.querySelector('.sw-npc-shop .sw-set-back')?.click();
  const g = window.__swGame;
  const id = window.__swItems[window.__swVANILLA_ITEM_KEY_BY_ID[1168]];
  if (id === undefined) return { why: 'item 1168 未注册' };
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 99 };
  g.cb.onInventoryChanged?.();
  // d31 产出计数钩
  const gvd = g.vanillaDust;
  let d31 = 0;
  const orig = gvd.spawn.bind(gvd);
  gvd.spawn = function (...a) { if (a[4] === 31) d31++; return orig(...a); };
  g.input.mouseX = g.player.cx + 250;
  g.input.mouseY = g.player.cy - 30;
  let projPeak = 0, tFirstDust = -1, firstThrowTick = -1;
  for (let i = 0; i < 240; i++) {
    if (i % 40 === 0) {                     // 周期性按下沿=连投（消耗品无 autoReuse）
      g.input.mouseDown = true; g.input.mouseHeld = true;
      if (firstThrowTick < 0) firstThrowTick = i;
    }
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;              // 用毕抬起（use 分支自身也会清）
    projPeak = Math.max(projPeak, g.entities.projectiles.filter((p) => p.projId === 196).length);
    if (d31 > 0 && tFirstDust < 0) tFirstDust = i;
  }
  const stackAfter = g.player.inv.slots[g.player.inv.selected]?.stack ?? -1;
  return { projPeak, d31, tFirstDust, firstThrowTick, stackAfter };
});
check('弹体 196 生成', smoke.projPeak >= 1, JSON.stringify(smoke));
check('d31 烟尘产出 ≥200', smoke.d31 >= 200, `d31=${smoke.d31}`);
check('首尘紧跟首发(≤8 tick)', smoke.tFirstDust >= 0 && smoke.tFirstDust - smoke.firstThrowTick <= 8,
  `first=${smoke.firstThrowTick} firstDust=${smoke.tFirstDust}`);
check('消耗品扣减', smoke.stackAfter >= 0 && smoke.stackAfter < 99, `stack=${smoke.stackAfter}`);

// 烟尾视觉档：等素材/chunk 烘焙追上（裸世界首帧黑屏+HUD 晚挂）→ 重开商店补拍
await new Promise((r) => setTimeout(r, 7000));
await page.evaluate(() => {
  window.__swUI.showNpcShop('probe-shop',
    [{ key: '', vanillaId: 859, name: '沙滩球', price: 1 }], 999999);
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/shop-icons-fixed.png' });
await page.evaluate(() => { window.__swUI.npcShop?.close?.(); });
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = g.player.cx + 220; g.input.mouseY = g.player.cy - 50;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 26; i++) g.fixedUpdate(1 / 60);
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/smoke-bomb-trail.png' });

// ---- ④ 满包购买守门：原版买入落光标永不丢件（HandleShopSlot :2033-2066 满叠
//      continue 钱不扣）——本仓直入背包,扣款前必须验容量:满包拒买钱分文不动,
//      有格照常买;bulk 同守门 ----
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer?.();
  g.player.hp = 99999;   // 顶血:夜怪别把探针玩家打死干扰断言
});
const full = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const VIK = window.__swVANILLA_ITEM_KEY_BY_ID, IK = window.__swItems;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const npc = new TownNPC('party_girl', g.player.x + 100, g.player.y - 40);
  g.entities.add(npc, 'npcs');
  g.openNpcDialog(npc);                       // dialogNpc = 派对女孩(买链查货架用)
  const stone = IK['stone_block'], ball = IK[VIK[859]];
  for (let i = 0; i <= 49; i++) g.player.inv.slots[i] = { id: stone, stack: 999 };
  g.player.inv.slots[50] = { id: IK[VIK[73]], stack: 20 };    // 20 金币
  const coins0 = g.coinsOwned();
  const buyFull1 = g.npcShopBuy(859, undefined);              // 满包单买 → 拒
  const coins1 = g.coinsOwned();
  const bagIntact = g.player.inv.slots.slice(0, 50).every((s) => s && s.id === stone && s.stack === 999);
  const toastFull = (document.querySelector('.sw-toast')?.textContent || '').includes('背包');
  const buyFullBulk = g.npcShopBuy(859, undefined, undefined, true);   // 满包批量 → 拒
  const coinsBulk = g.coinsOwned();
  // 腾一格 → 单买成功落格、钱只扣一笔（快照深拷贝——slots 元素是活引用,后续
  // 合并会原地改 stack,浅捕获会读到终值假象）
  const snap = () => JSON.stringify(g.player.inv.slots.slice(0, 58));
  g.player.inv.slots[49] = null;
  const ballsBefore3 = JSON.parse(snap()).filter((s) => s && s.id === ball).reduce((a, s) => a + s.stack, 0);
  const coinsP3 = g.coinsOwned();
  const buy3 = g.npcShopBuy(859, undefined);
  const s49 = JSON.parse(snap())[49];
  const coins3 = g.coinsOwned();
  // 再腾一格 → bulk 10 全收进该格
  g.player.inv.slots[48] = null;
  const coinsP4 = g.coinsOwned();
  const buy4 = g.npcShopBuy(859, undefined, undefined, true);
  const s48 = JSON.parse(snap())[48];
  const coins4 = g.coinsOwned();
  const hits = [];
  g.player.inv.slots.forEach((s, i) => { if (s && s.id === ball) hits.push([i, s.stack]); });
  return {
    ballId: ball, ballsBefore3, hits,
    s49Raw: s49,
    s48Raw: s48,
    buyFull1, coinsUnchanged1: coins1 === coins0, bagIntact, toastFull,
    buyFullBulk, coinsUnchangedBulk: coinsBulk === coins0,
    buy3, s49IsBall: s49?.id === ball && s49?.stack === 1, coinsSpent3: coinsP3 - coins3,
    buy4, s48Stack: s48?.stack, s48IsBall: s48?.id === ball, coinsSpent4: coinsP4 - coins4,
  };
});
check('满包单买=拒购且钱分文不动', full.buyFull1 === false && full.coinsUnchanged1 === true, JSON.stringify(full));
check('满包背包内容零扰动', full.bagIntact === true);
check('满包购买有「背包满」toast', full.toastFull === true);
check('满包批量买=拒购且钱不动', full.buyFullBulk === false && full.coinsUnchangedBulk === true);
check('腾一格单买=成功落格', full.buy3 === true && full.s49IsBall === true && full.coinsSpent3 > 0, JSON.stringify(full));
check('腾一格批量=10 只入账(合并优先,GetItem ③先于④)', full.buy4 === true
  && full.hits.length === 1 && full.hits[0][1] === 11 && full.coinsSpent4 === full.coinsSpent3 * 10,
  JSON.stringify(full));

// ---- ⑤ 钱币槽/猪猪存钱罐 1:1 链（对照 ItemCheck_Shoot :47463/:49957 + AI_097
//      :33640-33744 + TryInteractingWithMoneyTrough :38411-38490 + BuyItem
//      Player.cs:35687-35708 计四随身银行）：使用→发射飞猪(不消耗/不直开面板) →
//      悬停后右键飞猪开 banks[0] → Shift 存币 → 空背包用银行钱购物 → 猪猪 tile
//      右键同容器 → 走远自动关(T2) → timeLeft 自灭 → 同型去重 → 智能光标选圈态 ----
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer?.();
  g.player.hp = 99999;
});
const bank = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const VIK = window.__swVANILLA_ITEM_KEY_BY_ID, IK = window.__swItems;
  const { FlyingPiggyBank } = await import('/src/entities/FlyingPiggyBank.ts');
  const wipe = () => {
    for (let i = 0; i < g.player.inv.slots.length; i++) g.player.inv.slots[i] = null;
    for (const b of g.player.banks) b.fill(null);
  };
  wipe();
  // ① 使用 3213 → 飞猪出生、面板不直开、物品不消耗
  g.player.inv.slots[0] = { id: IK[VIK[3213]], stack: 1 };
  g.cb.onInventoryChanged?.();
  g.input.mouseX = 640; g.input.mouseY = 400;   // 平掷:Simple 射程=tileRangeX/Y(5),上掷会停在射程外(原版正确行为)
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const findPig = () => g.entities.projectiles.find((e) => e instanceof FlyingPiggyBank && !e.dead) ?? null;
  let pig = findPig();
  const spawnOk = !!pig && ui.openChest === null && g.player.inv.slots[0]?.stack === 1;
  // ② 抛出减速 → 悬停（phase 0→1，速度清零）
  for (let i = 0; i < 120 && pig && pig.phase === 0; i++) g.fixedUpdate(1 / 60);
  const hoverOk = !!pig && pig.phase === 1 && pig.vx === 0 && pig.vy === 0;
  // ③ 右键飞猪 → 开 banks[0] 面板（不消耗）
  const aim = () => {
    const [sx, sy] = g.camera.worldToScreen(pig.cx, pig.cy);
    g.input.mouseX = sx; g.input.mouseY = sy;
  };
  aim();
  const diag = {
    rect: { x: pig.x, y: pig.y, w: pig.w, h: pig.h, cx: pig.cx, cy: pig.cy },
    mouse: [g.input.mouseX, g.input.mouseY],
    world: (() => { const [wx, wy] = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY); return [wx, wy]; })(),
    contains: (() => { const [wx, wy] = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY); return wx >= pig.x && wx < pig.x + pig.w && wy >= pig.y && wy < pig.y + pig.h; })(),
    inRange: g.inTileRange(Math.floor(pig.cx / 16), Math.floor(pig.cy / 16)),
    uiBlocking: g.input.uiBlocking, dead: g.player.dead,
  };
  g.input.rightDown = true;
  g.fixedUpdate(1 / 60);
  g.input.rightDown = false;
  const openOk = ui.openChest?.x === -2 && ui.openChest.items === g.player.banks[0];
  ui.closeInventory();
  // ④ 再右键 → 关
  aim();
  g.input.rightDown = true;
  g.fixedUpdate(1 / 60);
  g.input.rightDown = false;
  const closeOk = ui.openChest === null;
  // ⑤ 重开 → Shift 存 50 银入猪猪
  aim();
  g.input.rightDown = true;
  g.fixedUpdate(1 / 60);
  g.input.rightDown = false;
  const reopened = ui.openChest?.x === -2;
  g.player.inv.slots[51] = { id: IK[VIK[72]], stack: 50 };
  ui.refreshAll();
  ui.shiftClick(51, 'inv');
  const deposited = g.player.banks[0].some((s) => s && s.id === IK[VIK[72]] && s.stack === 50);
  ui.closeInventory();
  // ⑥ 空背包消费：买 30 铜沙滩球 → 扣银行 1 银、找零 70 铜回背包
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const npc = new TownNPC('party_girl', g.player.x + 100, g.player.y - 40);
  g.entities.add(npc, 'npcs');
  g.openNpcDialog(npc);
  const totalBefore = g.coinsOwned();
  const okBuy = g.npcShopBuy(859, undefined);
  const bankSilver = g.player.banks[0].find((s) => s && s.id === IK[VIK[72]])?.stack ?? 0;
  const totalAfter = g.coinsOwned();
  const invCoins = [];
  for (let i = 0; i < g.player.inv.slots.length; i++) {
    const s = g.player.inv.slots[i];
    if (s && window.__swItems[VIK[71]] === s.id) invCoins.push(s.stack);
  }
  // ⑦ 猪猪 tile：玩家右侧 3 格放置 → 右键开同一容器
  if (g.player.dead) g.respawnPlayer?.();
  g.player.hp = 99999;
  const pigTile = window.__swTiles['v_29_piggy_bank'];
  const tx = Math.floor(g.player.cx / 16) + 3, ty = Math.floor(g.player.cy / 16);
  g.world.store.setTile(tx, ty, pigTile);
  g.world.store.setTile(tx + 1, ty, pigTile);
  const [sx2, sy2] = g.camera.worldToScreen((tx + 0.5) * 16, (ty + 0.5) * 16);
  g.input.mouseX = sx2; g.input.mouseY = sy2;
  g.input.rightDown = true;
  g.fixedUpdate(1 / 60);
  g.input.rightDown = false;
  const pigPanel = ui.openChest ? { x: ui.openChest.x, sameRef: ui.openChest.items === g.player.banks[0] } : null;
  ui.closeInventory();
  // ⑧ T2 走远自动关（开猪面板 → 玩家传送出射程 → 面板关）
  aim();
  g.input.rightDown = true;
  g.fixedUpdate(1 / 60);
  g.input.rightDown = false;
  const openedForT2 = ui.openChest?.x === -2;
  g.player.x += 800;                       // 50 格 ≫ Simple 射程
  for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
  const t2Closed = ui.openChest === null;
  g.player.x -= 800;
  // ⑨ timeLeft 自灭（10800t;直接拨到 3t 快进）
  pig.timeLeft = 3;
  aim();
  g.input.rightDown = true;
  g.fixedUpdate(1 / 60);
  g.input.rightDown = false;
  const reopened2 = ui.openChest?.x === -2;
  for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
  const pigExpired = pig.dead && ui.openChest === null;
  // ⑩ 同型去重：再掷一枚 → 旧猪死新猪活
  g.player.inv.slots[0] = { id: IK[VIK[3213]], stack: 1 };
  g.cb.onInventoryChanged?.();
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const pigs = g.entities.projectiles.filter((e) => e instanceof FlyingPiggyBank && !e.dead);
  const dedupOk = pigs.length === 1 && pigs[0] !== pig;
  pig = pigs[0] ?? null;
  // ⑪ 智能光标选圈态：wanted 开 → 射程内 1、光标命中 2；关 → 0
  let selHover = -1, selAway = -1, selOff = -1;
  if (pig) {
    g.smartCursor.wanted = true;
    aim();
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    selHover = pig.interactState;
    g.input.mouseX = 100; g.input.mouseY = 700;
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    selAway = pig.interactState;
    g.smartCursor.wanted = false;
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    selOff = pig.interactState;
  }
  ui.closeInventory?.();
  return {
    diag, spawnOk, hoverOk, openOk, closeOk, reopened, deposited, totalBefore, okBuy,
    bankSilver, totalAfter, invCopper70: invCoins.includes(70), pigPanel,
    openedForT2, t2Closed, reopened2, pigExpired, dedupOk, selHover, selAway, selOff,
  };
});
check('钱币槽使用=发射飞猪(不消耗,不直开面板)',
  bank.spawnOk === true && bank.hoverOk === true, JSON.stringify(bank).slice(0, 200));
check('右键飞猪=开 banks[0] 面板;再右键=关', bank.openOk === true && bank.closeOk === true);
check('Shift+点存币 → 入猪猪且背包清空',
  bank.deposited === true && bank.reopened === true);
check('空背包用银行钱购物成功', bank.okBuy === true && bank.totalBefore === 5000 && bank.totalAfter === 4970,
  JSON.stringify(bank).slice(0, 200));
check('扣银行 1 银、找零 70 铜回背包', bank.bankSilver === 49 && bank.invCopper70 === true);
check('猪猪 tile 右键 = 同一 piggy 容器', bank.pigPanel?.x === -2 && bank.pigPanel?.sameRef === true);
check('T2 走远=面板自动关(关猪音路径)', bank.openedForT2 === true && bank.t2Closed === true);
check('timeLeft 到期=飞猪自灭+面板关', bank.reopened2 === true && bank.pigExpired === true);
check('同型去重=新猪顶旧猪(单实例)', bank.dedupOk === true);
check('智能光标选圈态(命中2/射程1/关0)',
  bank.selHover === 2 && bank.selAway === 1 && bank.selOff === 0,
  `hover=${bank.selHover} away=${bank.selAway} off=${bank.selOff}`);

console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
