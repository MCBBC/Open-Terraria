// 同源游戏实例互认(2026-08-18 双开崩溃的协同降耗)。
// 双开窗口共享一个 Chrome GPU 进程配额——谁都不知道对方存在,各自满配
// (chunk 384 + GL 192MB + 小地图 80MB…)相加必然打爆(contextlost 风暴 16 万次
// 的根因)。BroadcastChannel 让同一游戏的多个窗口互相看见:检测到 >1 实例
// 时各自主动降一半常驻预算,让两个窗口都活得下来;实例退出即恢复满配。
//
// 协议:每实例随机 id;announce(进场)+ heartbeat(2s)+ goodbye(销毁);
// 对端 5s 无心跳视为已退出。计数变化时回调(增=>进经济档,减=>回满配)。
const CHANNEL = 'sw-game-instances';
const HEARTBEAT_MS = 2000;
const TIMEOUT_MS = 5000;

export class GamePresence {
  private id = Math.random().toString(36).slice(2);
  private peers = new Map<string, number>();
  private ch: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setInterval> | 0 = 0;
  private lastCount = 1;
  /** 实例数变化(含自己);回调在变化时触发一次 */
  onChange: ((count: number) => void) | null = null;

  start(): void {
    if (this.ch || typeof BroadcastChannel === 'undefined') return;
    try {
      this.ch = new BroadcastChannel(CHANNEL);
    } catch { return; }
    this.ch.onmessage = (e) => {
      const d = (e.data ?? {}) as { kind?: string; id?: string };
      if (!d.id || d.id === this.id) return;
      if (d.kind === 'goodbye') this.peers.delete(d.id);
      else this.peers.set(d.id, Date.now());       // announce/heartbeat
      this.recount();
    };
    this.post('announce');
    this.timer = setInterval(() => {
      this.post('heartbeat');
      const now = Date.now();
      let dropped = false;
      for (const [k, t] of this.peers) if (now - t > TIMEOUT_MS) { this.peers.delete(k); dropped = true; }
      if (dropped) this.recount();
    }, HEARTBEAT_MS);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.ch) {
      this.post('goodbye');
      this.ch.close();
      this.ch = null;
    }
  }

  /** 当前实例数(含自己) */
  get count(): number { return 1 + this.peers.size; }

  private post(kind: string): void {
    try { this.ch?.postMessage({ kind, id: this.id }); } catch { /* 频道已关 */ }
  }

  private recount(): void {
    const n = this.count;
    if (n !== this.lastCount) {
      this.lastCount = n;
      this.onChange?.(n);
    }
  }
}
