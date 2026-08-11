// 实体同步注入点（沿用 TileStore.netReporter 注入模式——entities 层不反向依赖 net 层）。
// Game 在联机模式下注入；单机恒 null（零开销）。
export const entityNet = {
  /** 傀儡受击上报（访客→房主 StrikeNPC：原始伤害+击退，房主权威结算） */
  reportStrike: null as null | ((netId: number, rawDmg: number, kbx: number, kby: number) => void),
  /** 本地实体诞生上报（drop；房主/访客各自的掉落物互播） */
  reportSpawn: null as null | ((netId: number, key: string, stack: number, x: number, y: number, vx: number, vy: number) => void),
  /** 本地掉落物被拾取上报（take：所有客户端各自的真掉落被捡→广播移除） */
  reportTake: null as null | ((netId: number) => void),
};

/** 实体 netId 合成：高 8 位 = 拥有者 slot（防跨客户端本地 id 撞号），低 24 位 = 本地实体 id */
export function makeNetId(ownerSlot: number, localId: number): number {
  return ((ownerSlot & 0xff) << 24) | (localId & 0xffffff);
}

export function netIdLocal(netId: number): number {
  return netId & 0xffffff;
}
