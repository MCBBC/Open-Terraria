// 拴绳实体联机同步（msg82 + NetModule.LeashedEntity=13）——原版 LeashedEntity.NetModule
// （LeashedEntity.cs:13-107）三消息语义在本仓传输模型上的落地：
//
//   原版                          本仓
//   ─────────────────────────    ─────────────────────────────────────────────
//   FullSync（AddNewEntity        sub1：房主放置/重生时广播（Game.tryPlace 724/723 钩）；
//     :369-372 / section 激活       服务器登记后按条带向**新收到该条带**的客户端定向补发
//     SyncEntitiesInSection        （server/room.ts sendStrips 尾段 = RemoteClient.
//     :469-472）                    NetSectionActivated 等价——晚进房/走进视野即得）
//   PartialSync（每 1024t 按      sub2：房主每 64t 扫一轮，逐实体距上次同步 ≥1024t 才发
//     whoAmI 错相 :461-467）        （相位 = 各实体出生时刻，与原版 whoAmI 错相同效；
//                                    见 Game.netLeashedHostSweep 差异备案）
//   Remove（:43-49 广播）          sub0：锚桩破坏广播（Game 破坏钩 + 房主锚格巡检兜底）
//   ——                            sub3 PlaceRequest：访客→房主放置请求（本仓新增，见下）
//   ——                            sub4 RetrieveRequest：访客右键取回锚桩存物请求
//                                   （本仓新增，访客端无 furnitureItems 记录 → 房主
//                                   权威取回 + msg21 掉物，见 applyLeashedRetrieve）
//
// 信任边界（对齐本仓双保护/hostToken 服务端权威约定）：
//   - sub0/1/2 仅房主上行：服务器非房主整包丢弃（= msg23 npcAuthority 同款门）；
//     访客端 ClientNet 不提供这三个发送入口——代码路径上就不存在伪造源。
//   - sub3 是访客唯一可发的消息，语义=「请求」：服务器校验 state/限流后**定向转发
//     房主**（= msg42 StrikeNPC 同款路径），由房主校验（锚格 tile 类型匹配/锚点无
//     既有实体/furniture 记录为空，见 Game.netApplyLeashedPlace）后才落 furniture
//     记录 + 实体 + FullSync。伪造请求最多让房主收到一次不成立的放置意图。
//   - 掉落权威：锚桩破坏的存物掉落归**房主**（原版 dedicated server 在 msg17 落格
//     时由 TE DropItemForTileBreak 服务端掉落，语义一致），走既有 msg21 掉落同步。
import {
  NetWriter, NetReader, Msg, NetModule,
} from './protocol';
import {
  LEASHED_SUB_REMOVE, LEASHED_SUB_FULL, LEASHED_SUB_PARTIAL, LEASHED_SUB_PLACE_REQUEST,
  LEASHED_SUB_RETRIEVE_REQUEST,
  LEASHED_KIND_CRITTER, LEASHED_KIND_KITE, type LeashedNetMsg,
  type LeashedCritterEntity, type LeashedKiteEntity,
} from '../entities/LeashedCritter';
import {
  leashedAnchorAt, leashedAnchorBreakDrop, removeFurnitureAt, type FurnitureItemRecord,
} from '../world/FurnitureItems';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';

/** 拴绳实体类型联合（发送侧入口） */
export type LeashedEntityLike = LeashedCritterEntity | LeashedKiteEntity;

/** 实体族判别（LeashedKiteEntity.projType 为构造必赋字段，critter 无此键） */
const kindOf = (e: LeashedEntityLike): number =>
  'projType' in e ? LEASHED_KIND_KITE : LEASHED_KIND_CRITTER;

/** FullSync 帧（= NetModule.Sync full:true，LeashedEntity.cs:51-69）。
 *  头部字段对齐原版语义：messageType / whoAmI→netId / Type→kind / AnchorPosition(X,Y)。
 *  线序差异备案：锚格 (ax,ay) 在 kind 之前（原版 Type 在锚格前）；kind 为 0/1
 *  判别字而非原版 0-19 注册序（重建靠 npcType/projType 实体段字段，见 toNet）。
 *  随后实体段（e.toNet） */
export function writeLeashedFullSync(e: LeashedEntityLike): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.LeashedEntity);
  w.u8(LEASHED_SUB_FULL);
  w.u32(e.netId >>> 0);
  w.i32(e.ax); w.i32(e.ay);
  w.u8(kindOf(e));
  e.toNet(w, true);
  return w.finish();
}

/** PartialSync 帧（= NetModule.Sync full:false；原版 partial 也带 Type 供失配校验
 *  （HandlePartialSync :98-106），本仓 kind 同位保留） */
export function writeLeashedPartialSync(e: LeashedEntityLike): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.LeashedEntity);
  w.u8(LEASHED_SUB_PARTIAL);
  w.u32(e.netId >>> 0);
  w.u8(kindOf(e));
  e.toNet(w, false);
  return w.finish();
}

/** Remove 帧（= NetModule.Remove :43-49；原版逐实体单包，对齐） */
export function writeLeashedRemove(netId: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.LeashedEntity);
  w.u8(LEASHED_SUB_REMOVE);
  w.u32(netId >>> 0);
  return w.finish();
}

/** PlaceRequest 帧（sub3，访客→房主；vid = 捕获小动物/风筝物品的原版物品 id） */
export function writeLeashedPlaceRequest(ax: number, ay: number, itemVid: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.LeashedEntity);
  w.u8(LEASHED_SUB_PLACE_REQUEST);
  w.i32(ax); w.i32(ay);
  w.u16(itemVid & 0xffff);
  return w.finish();
}

/** RetrieveRequest 帧（sub4，访客→房主；kind = 0 critter / 1 kite——锚桩存物类型，
 *  房主据此选 furnitureItems 记录的 kind 匹配校验） */
export function writeLeashedRetrieveRequest(ax: number, ay: number, kind: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.LeashedEntity);
  w.u8(LEASHED_SUB_RETRIEVE_REQUEST);
  w.i32(ax); w.i32(ay);
  w.u8(kind & 0xff);
  return w.finish();
}

/**
 * msg82 module13 解析（= NetModule.Deserialize :22-41）。
 *  返回 null = 未知 sub / 脏包（原版 default return false 同义）——游标已推进到
 *  本条消息可消费的边界，调用方整包丢弃。注意 FullSync/PartialSync 的实体段留在
 *  NetReader 里交 LeashedEntityManager 消费（身份头在 netApplyFull 内读，
 *  对齐 HandleFullSync 先读 type/anchor 再 NewInstance 的拆分）。
 */
export function readLeashedMessage(r: NetReader): LeashedNetMsg | null {
  const sub = r.u8();
  const msg: LeashedNetMsg = { sub, netId: 0, ax: 0, ay: 0, kind: 0, vid: 0, r };
  if (sub === LEASHED_SUB_REMOVE) {
    msg.netId = r.u32() >>> 0;
    return msg.netId > 0 ? msg : null;
  }
  if (sub === LEASHED_SUB_FULL) {
    msg.netId = r.u32() >>> 0;
    msg.ax = r.i32(); msg.ay = r.i32();
    msg.kind = r.u8();
    if (msg.netId === 0 || msg.ax < 0 || msg.ay < 0) return null;
    if (msg.kind !== LEASHED_KIND_CRITTER && msg.kind !== LEASHED_KIND_KITE) return null;
    return msg;
  }
  if (sub === LEASHED_SUB_PARTIAL) {
    msg.netId = r.u32() >>> 0;
    msg.kind = r.u8();
    if (msg.netId === 0) return null;
    if (msg.kind !== LEASHED_KIND_CRITTER && msg.kind !== LEASHED_KIND_KITE) return null;
    return msg;
  }
  if (sub === LEASHED_SUB_PLACE_REQUEST) {
    msg.ax = r.i32(); msg.ay = r.i32();
    msg.vid = r.u16();
    if (msg.ax < 0 || msg.ay < 0 || msg.vid === 0) return null;
    return msg;
  }
  if (sub === LEASHED_SUB_RETRIEVE_REQUEST) {
    msg.ax = r.i32(); msg.ay = r.i32();
    msg.kind = r.u8();
    if (msg.ax < 0 || msg.ay < 0) return null;
    if (msg.kind !== LEASHED_KIND_CRITTER && msg.kind !== LEASHED_KIND_KITE) return null;
    return msg;
  }
  return null;
}

/** 物品 vid → 内部 item id（furniture 记录槽存内部 id；链路与 placeStyleOfVid 同源） */
export function internalIdOfVid(itemVid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[itemVid];
  return key !== undefined ? (ITEM_BY_KEY[key] ?? 0) : 0;
}

// ============================================================================
// 锚桩存物取回（sub4 RetrieveRequest 的房主权威落账）
// ============================================================================
// 原版锚桩（TELeashedEntityAnchorWithItem）只有破坏掉物一路（DropItemForTileBreak
// :20-30 + OnRemoved → DespawnLeashedEntity），无 OnPlayerInteraction——"右键取回"
// 是本仓扩展交互（房主/单人本地直取，访客经 sub4 请求房主代取）。此处只做
// 纯状态约简（furniture 记录 + 拴绳实体 + 掉物/广播回调），不触 tile——锚桩
// 本体保留（空桩可再放置，= 原版 itemType=0 的合法态）；tile 破坏仍走既有
// msg17 TileBatch 链（破坏掉物语义不变，见 Game 破坏钩）。

/** 房主侧取回的世界绑定（Game.retrieveLeashedAnchor 组装；测试以 mock 注入） */
export interface LeashedRetrieveHost {
  /** furnitureItems 记录表（权威） */
  records: FurnitureItemRecord[];
  /** 锚点 (x,y) 上的实体 netId 集（破坏/取回前捕获，供 Remove 广播） */
  netIdsAt(x: number, y: number): number[];
  /** 锚点实体消散（TELeashedEntityAnchor.OnRemoved → DespawnLeashedEntity :16-21） */
  removeAt(x: number, y: number): boolean;
  /** 存物掉落（房主权威 → 既有 msg21 SyncItem 广播，访客收包拾取）。
   *  x/y = 锚格像素位（锚格×16+8, 锚格×16），与破坏掉物同位 */
  dropItem(x: number, y: number, itemKey: string, stack: number): void;
  /** 实体消散广播（sub0 Remove；仅房主联机态实际发送，由绑定方门禁） */
  broadcastRemove(netId: number): void;
  /** 存物内部 item id → 物品 key（掉落用；ITEM_DEFS 查表） */
  keyOf(internalItemId: number): string;
}

/**
 * 取回落账（房主/单人共用；访客请求经 sub4 转发到房主后由此执行）。
 * 校验链（不裸信请求方）：
 *  ① kind 合法（信封层已挡，双保险）；
 *  ② 该锚格有对应 kind 的 furniture 记录且存物槽非空（空桩/无记录 → 拒绝）。
 * 通过 → 弹出存物（leashedAnchorBreakDrop 清槽）+ 清记录 + 消散实体 +
 * 掉物 + Remove 广播。返回是否实际取回（false = 校验未过，零副作用）。
 */
export function applyLeashedRetrieve(
  host: LeashedRetrieveHost, ax: number, ay: number, kind: number,
): boolean {
  if (kind !== LEASHED_KIND_CRITTER && kind !== LEASHED_KIND_KITE) return false;
  const fKind = kind === LEASHED_KIND_CRITTER ? 'critter_anchor' : 'kite_anchor';
  const rec = leashedAnchorAt(host.records, fKind, ax, ay);       // ② 记录存在
  if (!rec) return false;
  const stored = leashedAnchorBreakDrop(host.records, fKind, ax, ay);
  if (!stored) return false;                                      // ② 存物非空（空桩）
  removeFurnitureAt(host.records, ax, ay);
  const ids = host.netIdsAt(ax, ay);
  host.removeAt(ax, ay);
  for (const id of ids) host.broadcastRemove(id);                 // sub0（房主门禁在绑定方）
  host.dropItem(ax * 16 + 8, ay * 16, host.keyOf(stored.id), stored.stack);
  return true;
}
