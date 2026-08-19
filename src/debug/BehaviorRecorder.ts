// 行为录制系统（2026-08-19）：时序因果事件日志（非视频）。
// 两层结构：
//   ① 常开环形缓冲（8192 条）——log() 恒安全，无录制窗也在写。短按 F5 的
//     调试报告带 snapshotTail(2000) 最近上下文 = "追溯能力"：出问题后再按
//     F5 也能拿到事发前的输入/方块/生死序列；
//   ② 录制窗（startMark 环形下标）——长按 F5 开窗，再长按关窗并 export()
//     开窗以来的全部事件。爆炸/刷怪风暴自动淘汰最旧（环形天性），关窗时
//     若窗口起点已被淘汰则截断并注明 truncated:true。
// 事件格式 {t, k, d}：t=游戏 tick（Game.tickCount）、k=事件类（key/tile/
// spawn/death/hurt/drop/pickup/use/chat/sample/world/burn/bomb…）、d=紧凑
// 载荷（只存 id/键名/坐标，勿嵌套类实例——环持有引用会钉死实体）。
// Date 只在 export() 头部用一次（exportedAt），录制路径零分配时间对象。

/** 环形容量：8192 条。爆炸族一格一事件 + 每 60t 玩家采样，8192 条 ≈ 数分钟
 *  正常游玩；风暴场景自动淘汰最旧（比"停录"或"丢新"都正确——旧上下文价值低） */
export const REC_RING_CAPACITY = 8192;

export interface RecEvent {
  /** 游戏 tick（单调递增；导出侧可据此校验事件序） */
  t: number;
  /** 事件类（短键：key/tile/spawn/death/hurt/drop/pickup/use/chat/sample/world/burn） */
  k: string;
  /** 紧凑载荷（unknown：数字/字符串/扁平小对象） */
  d: unknown;
}

export interface RecMeta {
  worldName: string;
  seed: number;
  w: number;
  h: number;
  hardMode: boolean;
  dayTime: boolean;
  exportedAt: string;
  truncated: boolean;
  eventCount: number;
  /** 录制窗开启 tick（无窗导出=全环快照时为 null） */
  startTick: number | null;
}

export interface RecExport {
  meta: RecMeta;
  events: RecEvent[];
}

export interface RecWorldInfo {
  worldName: string;
  seed: number;
  w: number;
  h: number;
  hardMode: boolean;
  dayTime: boolean;
}

export class BehaviorRecorder {
  /** 环形缓冲（定长数组复用，零扩容；count<capacity 时前 count 条有效） */
  private buf: RecEvent[] = [];
  /** 已写入总数（buf 下标 = total % capacity；total 同时是淘汰检测基准） */
  private total = 0;
  /** 录制窗起点（【total 口径】而非 buf 下标——total 单调，跨淘汰不歧义）；
   *  null = 无窗（snapshotTail 仍可用） */
  private startTotal: number | null = null;
  /** 最近一次【关闭】的窗起点：关窗 → export 仍取该窗全量（F5 长按关窗的
   *  保存链就发生在 toggle 之后）；开新窗时重置 */
  private lastStart: number | null = null;
  /** 最近一次【关闭】的窗终点（关窗时刻 total）：窗口在关窗瞬间冻结——
   *  关窗后的新事件不混入已关窗口的导出 */
  private lastEnd = 0;
  /** tick 源（Game 构造注入 () => this.tickCount；缺省 0 供单测/降级） */
  tickSource: () => number = () => 0;
  /** 世界元信息源（Game 构造注入；export 头用。缺省占位） */
  worldInfo: () => RecWorldInfo = () => ({ worldName: '', seed: 0, w: 0, h: 0, hardMode: false, dayTime: true });

  /** 恒安全写入（无窗也进环——追溯能力的根基）。风暴下自动淘汰最旧 */
  log(k: string, d: unknown): void {
    this.buf[this.total % REC_RING_CAPACITY] = { t: this.tickSource(), k, d };
    this.total++;
  }

  /** 录制窗开/关（方向切换）。返回切换后状态（true=录制中）。关窗把起点
   *  移入 lastStart——紧随其后的 export() 取该窗全量（见 lastStart 注释） */
  toggle(): boolean {
    if (this.startTotal === null) {
      this.lastStart = null;
      this.startTotal = this.total;
      return true;
    }
    this.lastStart = this.startTotal;
    this.lastEnd = this.total;
    this.startTotal = null;
    return false;
  }

  /** 当前是否在录制窗内 */
  get recording(): boolean { return this.startTotal !== null; }

  /** 开窗以来事件数（无窗 = 0） */
  windowCount(): number {
    return this.startTotal === null ? 0 : this.total - this.startTotal;
  }

  /** 导出：开窗以来的全部事件。录制中 = 活窗（起点→当前）；关窗后 =
   *  冻结窗（起点→关窗时刻）；从未开窗 = 全环快照。截断判定：窗口起点
   *  < 写入总数 - capacity 时起点事件已被淘汰 → truncated:true（爆炸风暴
   *  淘汰旧事件是环形天性，非数据损坏） */
  export(): RecExport {
    const active = this.startTotal !== null;
    const from = this.startTotal ?? this.lastStart ?? Math.max(0, this.total - REC_RING_CAPACITY);
    const to = active ? this.total : (this.lastStart !== null ? this.lastEnd : this.total);
    const truncated = from < this.total - REC_RING_CAPACITY;
    const events: RecEvent[] = [];
    for (let i = Math.max(from, this.total - REC_RING_CAPACITY); i < to; i++) {
      events.push(this.buf[i % REC_RING_CAPACITY]);
    }
    const wi = this.worldInfo();
    return {
      meta: {
        ...wi,
        exportedAt: new Date().toISOString(),
        truncated,
        eventCount: events.length,
        startTick: events[0] ? events[0].t : null,
      },
      events,
    };
  }

  /** 最近 n 条（F5 短按报告 behaviorTail 段；无窗也有效） */
  snapshotTail(n: number): RecEvent[] {
    const from = Math.max(0, this.total - n);
    const out: RecEvent[] = [];
    for (let i = from; i < this.total; i++) out.push(this.buf[i % REC_RING_CAPACITY]);
    return out;
  }

  /** 探针口用：环内容只读视图（__swRec.buffer——新副本，防外部污染环） */
  get buffer(): RecEvent[] {
    return this.snapshotTail(REC_RING_CAPACITY);
  }

  /** 总写入数（探针/测试观测淘汰） */
  get totalLogged(): number { return this.total; }
}
