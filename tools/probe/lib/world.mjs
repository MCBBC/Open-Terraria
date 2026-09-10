/**
 * IIII236 统一探针框架 —— 世界读写夹具。
 *
 * 坑史锚:
 *  - memory: placement-obstruction-dual-exemption 十四批 ★探针纪律 —— AddWater
 *    尾冲毁链是【事件驱动】(LiquidSim.ts:781):静默写 tile 不触发液体事件 →
 *    夹具必须【液先置 tile 后置】(st.liquid 先写,再 setTile 触发级联),
 *    否则断言 vacuous;CheckPot 夹具须落实心底格(悬空罐级联判死连坐)。
 *  - TileStore.ts:253 —— setTile 是唯一写入入口(触发 onTileChanged 级联);
 *    setTileSilent 仅生成/导入期合法(多格件夹具用 silent+显式单点级联)。
 *  - memory: boomerang-born-center-owngate 二批 —— store.setSlope 无条件清
 *    half 位:铺场脚本 setHalfBrick 后再 setSlope 会静默抹位(footInCellPx 假 0)。
 *  - memory: chain-playthrough 四坑 —— 挖灯泡召王有玩家 50 格曼哈顿距离门
 *    (先贴位再 breakTile——st.setTile 不触发监听);教徒石碑有 PlayerLOS 拒召门;
 *    塔盾清零后须 ticks 重算 dontTakeDamage 再 hurt;掉落检测用 itemByVid 反查。
 *  - memory: ghost-tile-consumer-gate-full-sweep —— 破坏/写入层有 active 门
 *    (JS 裸读 type≠0 = 幽灵残型格漏洞);读格判"有方块"用 st.hasTile(flags bit0)。
 */
import { front } from './browser.mjs';

/**
 * 液体+tile 夹具(事件序纪律的唯一合法形态):
 *   ① 先写 st.liquid/st.liquidType(静默,液体域不动);
 *   ② 再 setTile(非静默)→ AddWater 3×3 尾冲毁链按原版时点兑现。
 * 反序或全程 silent = 断言 vacuous(曾烧出 F3 类假绿)。
 */
export async function placeLiquidThenTile(page, tx, ty, { liquid = 255, liquidType = 0, tile = 0 } = {}) {
  return page.evaluate(({ tx, ty, liquid, liquidType, tile }) => {
    const g = window.__swGame;
    const st = g.world.store;
    const i = st.idx(tx, ty);
    if (!st.inBounds?.(tx, ty) && (tx < 5 || ty < 5 || tx > st.w - 5 || ty > st.h - 5)) return false;
    st.liquid[i] = liquid;             // ① 液先置
    st.liquidType[i] = liquidType;     //   (原版 +1 编码:0=water 1=lava 2=honey 3=shimmer)
    if (tile) st.setTile(tx, ty, tile, 0, 0);   // ② tile 后置(触发级联)
    return true;
  }, { tx, ty, liquid, liquidType, tile });
}

/** 清场:区域内置空(含 liquid/wire/paint/half/slope 全位)——探针场景污染首因。 */
export async function clearArea(page, tx0, ty0, tx1, ty1, { floorTile = null, floorRow = null } = {}) {
  return page.evaluate(({ tx0, ty0, tx1, ty1, floorTile, floorRow }) => {
    const st = window.__swGame.world.store;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
        const i = st.idx(x, y);
        st.setTile(x, y, 0, 0, 0);
        st.liquid[i] = 0; st.wire[i] = 0; st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0;
      }
    }
    if (floorTile != null && floorRow != null) {
      for (let x = tx0; x <= tx1; x++) st.setTile(x, floorRow, floorTile, 0, 0);
    }
    return true;
  }, { tx0, ty0, tx1, ty1, floorTile, floorRow });
}

/**
 * 石盒庇护所(_iii219 同款):隔怪/防 constant 黑暗/防 NPC 漫步出盒;
 * 玩家站盒中央+手持火把(光照双保险)。
 */
export async function buildShelter(page, {
  halfW = 12, top = 6, floor = 3, wall = 1, torches = true, torchTile = 4, torchStep = 4,
  clearBelow = 1,   // 地板下再清一行(与 _iii219 原始庇护所逐格同构)
} = {}) {
  return page.evaluate(({ halfW, top, floor, wall, torches, torchTile, torchStep, clearBelow }) => {
    const g = window.__swGame, st = g.world.store;
    const sx = Math.floor(g.player.cx / 16), sy = Math.floor(g.player.cy / 16);
    for (let x = sx - halfW; x <= sx + halfW; x++) {
      for (let y = sy - top; y <= sy + floor + clearBelow; y++) {
        const i = st.idx(x, y);
        st.setTile(x, y, 0, 0, 0);
        st.liquid[i] = 0;
      }
      st.setTile(x, sy + floor, wall, 0, 0);   // 地板
      st.setTile(x, sy - top, wall, 0, 0);     // 顶
    }
    for (let y = sy - top + 1; y <= sy + floor - 1; y++) {
      st.setTile(sx - halfW, y, wall, 0, 0);   // 左壁
      st.setTile(sx + halfW, y, wall, 0, 0);   // 右壁
    }
    if (torches) {
      for (let x = sx - halfW + 2; x <= sx + halfW - 2; x += torchStep) st.setTile(x, sy + floor - 1, torchTile, 0, 0);
    }
    g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
    return { sx, sy };
  }, { halfW, top, floor, wall, torches, torchTile, torchStep, clearBelow });
}

/**
 * 按 vanilla sheet 找 tile(脉冲扫描,seedable 起点防每次命中同格)。
 * 返回 { x, y } 或 null。★TILE_DEFS[st.type[i]].vanilla.sheet——内部 id ≠ 原版 vid。
 */
export async function findTileBySheet(page, sheet, { maxScan = 80000, x0 = 60, y0 = 60 } = {}) {
  return page.evaluate(async ({ sheet, maxScan, x0, y0 }) => {
    const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
    const g = window.__swGame, st = g.world.store;
    const idT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
    if (idT < 0) return { why: 'no-sheet', sheet };
    const w = g.world.w, h = g.world.h;
    for (let k = 0; k < maxScan; k++) {
      const x = x0 + ((k * 1103) % Math.max(1, w - x0 - 60));
      const y = y0 + ((k * 733) % Math.max(1, h - y0 - 60));
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === idT) return { x, y };
    }
    return { why: 'not-found', sheet };
  }, { sheet, maxScan, x0, y0 });
}

/** 原版 vid → 内部 item id(__swFlow.itemByVid;缺 -1)。掉落/持物断言唯一合法通道。 */
export async function itemByVid(page, vid) {
  return page.evaluate((vid) => window.__swFlow?.itemByVid?.(vid) ?? -1, vid);
}

/**
 * fresh import(?t= 击穿 vite 私有实例的转换缓存——改盘不生效坑的唯一稳解)。
 * 返回模块导出的可序列化投影(pick 数组指定键;函数导出不跨 evaluate)。
 */
export async function importFresh(page, spec, pick = null) {
  return page.evaluate(async ({ spec, pick }) => {
    const m = await import(spec.startsWith('/src/') ? `${spec}?t=${Date.now()}` : spec);
    if (!pick) return null;
    const out = {};
    for (const k of pick) out[k] = m[k];
    return out;
  }, { spec, pick });
}

/** 玩家手持置物(vid 直填;selected=0)。 */
export async function holdItem(page, vid, stack = 1, slot = 0) {
  return page.evaluate(({ vid, stack, slot }) => {
    const g = window.__swGame;
    const iid = window.__swFlow.itemByVid(vid);
    if (iid == null || iid < 0) return false;
    g.player.inv.slots[slot] = { id: iid, stack };
    g.player.inv.selected = slot;
    return true;
  }, { vid, stack, slot });
}

/** 鼠标指向世界像素(经 worldToScreen;页内映射过敏的断言应交还单测)。 */
export async function aimAt(page, wx, wy) {
  return page.evaluate(({ wx, wy }) => {
    const g = window.__swGame;
    const scr = g.camera.worldToScreen(wx, wy);
    const x = Array.isArray(scr) ? scr[0] : scr.x;
    const y = Array.isArray(scr) ? scr[1] : scr.y;
    g.input.mouseX = x; g.input.mouseY = y;
    return [x, y];
  }, { wx, wy });
}

/** 按住/松开鼠标(边沿语义:mouseDown 每帧被 rAF 消费须显式复位)。 */
export async function mouseHold(page, down) {
  return page.evaluate((down) => {
    const g = window.__swGame;
    g.input.mouseDown = down;
    g.input.mouseHeld = down;
    return true;
  }, down);
}

// ═══════════ G9(IIIRS241 缺口矩阵):FNV store 指纹(世界终态) ═══════════

/**
 * FNV-1a 32bit(纯函数,字节流直哈希;与 scripts/_worldgen-hash.mjs 唯一实现逐字同源)。
 */
export function fnv1a32(u8) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * store 全通道字节提取(_worldgen-hash 逐字同源,守卫测试钉死——改这里=改金标
 * 口径,禁):type/wall/frameX/frameY 是 Uint16Array → new Uint8Array(buffer) 按
 * LE 字节展开;其余 Uint8Array 直通。通道序=金标序。
 */
export const STORE_FNV_CHANNELS = {
  type: (st) => new Uint8Array(st.type.buffer),
  wall: (st) => new Uint8Array(st.wall.buffer),
  liquid: (st) => st.liquid,
  liquidType: (st) => st.liquidType,
  half: (st) => st.half,
  slope: (st) => st.slope,
  frameX: (st) => new Uint8Array(st.frameX.buffer),
  frameY: (st) => new Uint8Array(st.frameY.buffer),
  paint: (st) => st.paint,
  coat: (st) => st.coat,
};

/** 纯函数:store → {size, type, wall, …}(channels=子集名单,缺省金标全 10 通道)。 */
export function fingerprintStoreChannels(st, channels = null) {
  const out = { size: `${st.w}x${st.h}` };
  for (const [name, get] of Object.entries(STORE_FNV_CHANNELS)) {
    if (channels && !channels.includes(name)) continue;
    out[name] = fnv1a32(get(st));
  }
  return out;
}

/** 页内:世界终态指纹(helper 单一真值源经 toString 注入——shot.litStats 同款;
 *  evaluate 只序列化函数本体,模块作用域引用不跨闭包)。 */
export function __fnvStoreInPage({ channels = null, fnvSrc = null, chanPairs = null } = {}) {
  const st = window.__swGame?.world?.store;
  if (!st) return { ok: false, why: 'no-store' };
  const fnv1a32 = eval('(' + fnvSrc + ')');   // 单一真值源注入(shot.litStats 同款)
  const out = { ok: true, size: `${st.w}x${st.h}` };
  for (const [name, src] of chanPairs) {
    if (channels && !channels.includes(name)) continue;
    out[name] = fnv1a32(new Function('st', `return (${src})(st);`)(st));
  }
  return out;
}

/**
 * FNV store 指纹(IIIRS241 G9 收编;真值源=scripts/_worldgen-hash.mjs 唯一实现,
 * 指纹值与既有 _worldgen-hash 快照逐位可比)。世界终态指纹的标准件:
 *   同 origin 两跑=确定性验证;跨 origin(dev=未混淆 vs preview=混淆)=位级等价验证。
 * 入参通吃 page(页内 evaluate)|game|world|store(Node 直跑,框架自测用);
 * channels=通道子集名单。返回 {ok,size,type,…}|{ok:false,why:'no-store'}。
 */
export async function fnvStore(pageOrStore, { channels = null } = {}) {
  if (pageOrStore && typeof pageOrStore.evaluate === 'function') {
    return pageOrStore.evaluate(__fnvStoreInPage, {
      channels,
      fnvSrc: fnv1a32.toString(),
      chanPairs: Object.entries(STORE_FNV_CHANNELS).map(([name, get]) => [name, get.toString()]),
    });
  }
  const st = pageOrStore?.world?.store ?? pageOrStore;   // game|world 传参走 .world.store,store 传参直用
  if (!st || st.type == null || st.w == null) return { ok: false, why: 'no-store' };
  return { ok: true, ...fingerprintStoreChannels(st, channels) };
}
