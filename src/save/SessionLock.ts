// ★BJ617 件1（2026-10-10 用户拍板）：多标签页同世界/同角色并发会话锁（Web Locks）。
// 终态口径（用户原话）：「干脆就不应该有合并这个功能，支持的 web locks 的对同一世界
// 已在进行的会话拒载，不支持的就各自开存档后自己覆盖写也没关系」——index 合并/
// nextId 重读面被用户明令否决（合并有风险,可能引入重复数据导致存档混乱）,并发防线
// 只此一道：
//  - 支持 navigator.locks（Chromium/Firefox/Safari 16.4+；非安全上下文无此 API）：
//    ifAvailable 非阻塞抢锁——拿不到=另一标签页会话在途 → 调用方拒载+toast；拿到=
//    持锁至主动 release()（回调 await gate 悬持=持锁面,MDN request 语义:回调 promise
//    settle 即释放）,tab 关闭=浏览器自动释放（标准语义,零接线）；
//  - 不支持（老 Safari<16.4/非安全上下文）：降级放行+console.warn 一次性（登记债）——
//    双开各自覆盖写 last-writer-wins 为用户明示接受面（「自己覆盖写也没关系」）；
//  - 纯会话域：无 IDB/LS 依赖;锁名带 'sandboxworld.' 域前缀防与其他 Web Locks 消费方撞名。
//  键面（mainFlow 消费定谳）：
//   世界 sandboxworld.world-lock.<id>——world.<id> 载入面（世界选择 Play 等）；quicksave
//   键无槽位 id 可反解 → quickLoad 只走角色锁（quickload 会话 slotMeta=null 不写世界
//   槽位,无世界互踩面;quicksave 键本身跨 tab 共享草稿面=既有语义,不在此刀）；
//   角色 sandboxworld.char-lock.<id>——charContextId()（同角色双 tab=playerstate
//   互踩/复制窗；loadFromKey 与 createWorldFlow 两进世界面都接）。

/** 世界会话锁名 */
export const worldLockKey = (id: number): string => `sandboxworld.world-lock.${id}`;
/** 角色会话锁名 */
export const charLockKey = (id: number): string => `sandboxworld.char-lock.${id}`;

/** lib.dom 形状漂移防御：Web Locks 最小消费面（MDN LockManager.request;ifAvailable+
 *  回调以 Lock 对象或 null 调用）。不声明全局 Navigator.locks（避免 lib.dom 版本耦合,
 *  FsBackup 同习语）。 */
interface LocksManagerLike {
  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<void> | void): Promise<unknown>;
}
function locksApi(): LocksManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LocksManagerLike } }).navigator;
  return nav?.locks ?? null;
}

/** 兼容门：navigator.locks 可用（Chromium/Firefox/Safari 16.4+） */
export function sessionLocksSupported(): boolean {
  return locksApi() !== null;
}

let warnedUnsupported = false;
function warnUnsupportedOnce(): void {
  if (warnedUnsupported) return;
  warnedUnsupported = true;
  console.warn('[sessionLock] navigator.locks 不可用（老 Safari<16.4/非安全上下文?）——多标签页同世界/同角色并发未设防，降级放行（各自覆盖写 last-writer-wins=用户明示接受面；登记债）');
}

/** 到手的会话锁：release() 主动放行（幂等）；tab 关闭=浏览器自动释放（无需接线） */
export interface SessionLock {
  key: string;
  release(): void;
}

export type SessionLockTake = SessionLock | 'busy' | 'unsupported';

/** 非阻塞抢会话锁（ifAvailable:true）：
 *  - SessionLock=到手（持锁中；release() 放行,tab 关闭自动释放）；
 *  - 'busy'=锁被他方（另一标签页）持有 → 调用方拒载+toast；
 *  - 'unsupported'=API 缺失/request 本体异常 → 调用方降级放行（warn 一次性）。
 *  绝不悬挂：request 异常/回调未拿到锁都即时 resolve。 */
export async function acquireSessionLock(key: string): Promise<SessionLockTake> {
  const locks = locksApi();
  if (!locks) {
    warnUnsupportedOnce();
    return 'unsupported';
  }
  return new Promise<SessionLockTake>((resolve) => {
    let releaseGate: (() => void) | null = null;
    const gate = new Promise<void>((res) => { releaseGate = res; });
    try {
      void locks.request(key, { ifAvailable: true }, async (lock) => {
        if (lock == null) { resolve('busy'); return; }   // ifAvailable 未拿到=他方持锁（spec 回调以 null 调用）
        resolve({
          key,
          release: () => { const r = releaseGate; releaseGate = null; r?.(); },
        });
        await gate;   // 持锁面：gate 悬持期间锁不放（回调 promise settle 即释放）
      }).catch(() => {
        warnUnsupportedOnce();
        resolve('unsupported');
      });
    } catch {
      warnUnsupportedOnce();
      resolve('unsupported');
    }
  });
}
