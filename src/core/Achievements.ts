// 原版成就系统引擎 1:1（AchievementManager.cs / Achievement.cs / 8 条件类语义 +
// AchievementsHelper.cs 事件通知）。注册表 = data/vanillaAchievements.ts
// （AchievementInitializer.cs 全量）。持久化经注入 store（跨世界，原版独立
// achievements.dat 的等价物——本仓走 localStorage）。
//
// 条件状态机：
//   flag            一次性置位
//   int/float       累计 ≥ 阈值完成（CustomInt/CustomFloatCondition.Value 语义）
//   itemPickup/     id 集命中即完成；npcKilled+many 时逐 id 独立条件
//   itemCraft/
//   npcKilled/
//   tileDestroyed/
//   progressionEvent 事件 id 命中即完成
import {
  ACH_DEFS, ACH_ICON_INDEX, achIconFrame, ACH_ICON_LOCKED_DX,
  type AchCondDef, type AchDef,
} from '../data/vanillaAchievements';

/** 持久化存储（localStorage 门面；测试可注入内存版） */
export interface AchStore {
  load(): string | null;
  save(s: string): void;
}

interface CondState {
  done: boolean;
  /** npcKilled+many：逐 id 完成集 */
  doneIds?: Set<number>;
  /** int/float 计数 */
  val?: number;
}

export interface AchProgress {
  completed: number;
  /** 条件完成数（tracker 显示） */
  doneConds: number;
  totalConds: number;
  /** 计数型条件进度（int/float：val/threshold 取最大占比） */
  ratio: number | null;
}

export class Achievements {
  private defs: AchDef[];
  private completed = new Map<string, boolean>();
  private condState = new Map<string, CondState>(); // key = achName + '#' + condIdx
  private unlockedQueue: string[] = [];
  onUnlock: ((name: string, def: AchDef) => void) | null = null;
  private store: AchStore | null;

  constructor(store?: AchStore | null) {
    this.defs = ACH_DEFS;
    this.store = store ?? null;
    this.load();
  }

  // ---- 持久化 ----
  private load(): void {
    const raw = this.store?.load();
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as {
        v: number; c?: string[]; f?: Record<string, number[]>;
        n?: Record<string, Record<string, number>>;
      };
      if (data.v !== 1) return;
      for (const n of data.c ?? []) this.completed.set(n, true);
      for (const [ach, arr] of Object.entries(data.f ?? {})) {
        arr.forEach((done, i) => {
          if (done) this.condState.set(`${ach}#${i}`, { done: true });
        });
      }
      for (const [ach, conds] of Object.entries(data.n ?? {})) {
        for (const [k, v] of Object.entries(conds)) {
          const idx = Number(k);
          this.condState.set(`${ach}#${idx}`, { done: v >= 1, val: v });
        }
      }
    } catch { /* 损坏数据静默丢弃（原版 Load 同样容错） */ }
  }

  private save(): void {
    const c = [...this.completed.keys()];
    const f: Record<string, number[]> = {};
    const n: Record<string, Record<string, number>> = {};
    for (const def of this.defs) {
      def.conditions.forEach((cond, i) => {
        const st = this.condState.get(`${def.name}#${i}`);
        if (!st) return;
        if (cond.kind === 'int' || cond.kind === 'float') {
          if (st.val) (n[def.name] ??= {})[String(i)] = st.val;
        } else if (st.done) {
          (f[def.name] ??= [])[i] = 1;
        }
      });
    }
    this.store?.save(JSON.stringify({ v: 1, c, f, n }));
  }

  // ---- 查询 ----
  get count(): number { return this.defs.length; }

  isCompleted(name: string): boolean { return !!this.completed.get(name); }

  /** 图标图集坐标 + 锁定态（未完成 → 灰阶列块 X+528） */
  iconFrameOf(name: string): { x: number; y: number; locked: boolean; lockedDx: number } | null {
    const idx = ACH_ICON_INDEX[name];
    if (idx == null) return null;
    const f = achIconFrame(idx);
    return { x: f.x, y: f.y, locked: !this.isCompleted(name), lockedDx: ACH_ICON_LOCKED_DX };
  }

  iconIndex(name: string): number { return ACH_ICON_INDEX[name] ?? 0; }

  defOf(name: string): AchDef | undefined { return this.defs.find((d) => d.name === name); }

  /** 进度（AchievementAdvisor 大小卡显示） */
  progressOf(name: string): AchProgress {
    const def = this.defOf(name)!;
    let done = 0;
    let ratio: number | null = null;
    def.conditions.forEach((cond, i) => {
      const st = this.condState.get(`${name}#${i}`);
      if (cond.kind === 'int' || cond.kind === 'float') {
        const v = st?.val ?? 0;
        const r = Math.min(1, v / (cond.value ?? 1));
        ratio = ratio == null ? r : Math.max(ratio, r);
        if (st?.done) done++;
      } else if (st?.done) done++;
    });
    return { completed: done, doneConds: done, totalConds: def.conditions.length, ratio };
  }

  /** 未完成且可显示的成就（Advisor 列表：有进度或有近完成条件者优先） */
  advisorList(): AchDef[] {
    return this.defs.filter((d) => !this.completed.get(d.name));
  }

  /** 定义列表（注册原序——菜单列表序） */
  defList(): AchDef[] { return this.defs; }

  /** 弹出解锁队列（UI toast 消费） */
  popUnlocked(): string[] { const q = this.unlockedQueue; this.unlockedQueue = []; return q; }

  // ---- 通知入口（AchievementsHelper 对应方法） ----
  notifyItemPickup(itemId: number): void { this.notifyId('itemPickup', itemId); }
  notifyItemCraft(itemId: number): void { this.notifyId('itemCraft', itemId); }
  notifyTileDestroyed(tileId: number): void { this.notifyId('tileDestroyed', tileId); }
  notifyNPCKilled(npcNetId: number): void { this.notifyId('npcKilled', npcNetId); }
  notifyProgressionEvent(eventId: number): void { this.notifyId('progressionEvent', eventId); }

  private notifyId(kind: AchCondDef['kind'], id: number): void {
    for (const def of this.defs) {
      if (this.completed.get(def.name)) continue;
      def.conditions.forEach((cond, i) => {
        if (cond.kind !== kind || !cond.ids) return;
        const key = `${def.name}#${i}`;
        const st = this.condState.get(key) ?? { done: false };
        if (cond.many) {
          // CreateMany：逐 id 独立条件（npcKilled 专用）
          if (!cond.ids.includes(id)) return;
          (st.doneIds ??= new Set()).add(id);
          st.done = st.doneIds.size >= cond.ids.length;
        } else if (cond.ids.includes(id)) {
          st.done = true;
        }
        this.condState.set(key, st);
        if (st.done) this.checkComplete(def);
      });
    }
  }

  /** CustomFlagCondition.Complete()（HandleSpecialEvent/装备检查） */
  completeFlag(achName: string, condName: string): void {
    const def = this.defOf(achName);
    if (!def || this.completed.get(achName)) return;
    def.conditions.forEach((cond, i) => {
      if (cond.kind !== 'flag' || cond.name !== condName) return;
      const key = `${achName}#${i}`;
      const st = this.condState.get(key) ?? { done: false };
      st.done = true;
      this.condState.set(key, st);
      this.checkComplete(def);
    });
  }

  /** CustomInt/FloatCondition.Value +=（HandleMining/HandleRunning/护士花费/树种橡实） */
  addCounter(achName: string, condName: string, delta: number): void {
    const def = this.defOf(achName);
    if (!def || this.completed.get(achName)) return;
    def.conditions.forEach((cond, i) => {
      if ((cond.kind !== 'int' && cond.kind !== 'float') || cond.name !== condName) return;
      const key = `${achName}#${i}`;
      const st = this.condState.get(key) ?? { done: false, val: 0 };
      st.val = (st.val ?? 0) + delta;
      if (st.val >= (cond.value ?? Infinity)) { st.val = cond.value; st.done = true; }
      this.condState.set(key, st);
      if (st.done) this.checkComplete(def);
    });
  }

  private checkComplete(def: AchDef): void {
    if (this.completed.get(def.name)) return;
    const all = def.conditions.every((_, i) => this.condState.get(`${def.name}#${i}`)?.done);
    if (!all) return;
    this.completed.set(def.name, true);
    this.unlockedQueue.push(def.name);
    this.onUnlock?.(def.name, def);
    this.save();
  }

  // ---- AchievementsHelper.HandleSpecialEvent switch 1:1（cs:282-381） ----
  /** @param player 玩家状态读取器（statLifeMax/statManaMax；TOPPED_OFF 门） */
  handleSpecialEvent(eventId: number, player: { statLifeMax: number; statManaMax: number }): void {
    switch (eventId) {
      case 1:
        this.completeFlag('STAR_POWER', 'Use');
        if (player.statLifeMax === 500 && player.statManaMax === 200) {
          this.completeFlag('TOPPED_OFF', 'Use');
        }
        break;
      case 2:
        this.completeFlag('GET_A_LIFE', 'Use');
        if (player.statLifeMax === 500 && player.statManaMax === 200) {
          this.completeFlag('TOPPED_OFF', 'Use');
        }
        break;
      case 3: this.completeFlag('NOT_THE_BEES', 'Use'); break;
      case 4: this.completeFlag('WATCH_YOUR_STEP', 'Hit'); break;
      case 5: this.completeFlag('RAINBOWS_AND_UNICORNS', 'Use'); break;
      case 6: this.completeFlag('YOU_AND_WHAT_ARMY', 'Spawn'); break;
      case 7: this.completeFlag('THROWING_LINES', 'Use'); break;
      case 8: this.completeFlag('LUCKY_BREAK', 'Hit'); break;
      case 9: this.completeFlag('VEHICULAR_MANSLAUGHTER', 'Hit'); break;
      case 10: this.completeFlag('ROCK_BOTTOM', 'Reach'); break;
      case 11: this.completeFlag('INTO_ORBIT', 'Reach'); break;
      case 12: this.completeFlag('WHERES_MY_HONEY', 'Reach'); break;
      case 13: this.completeFlag('JEEPERS_CREEPERS', 'Reach'); break;
      case 14: this.completeFlag('ITS_GETTING_HOT_IN_HERE', 'Reach'); break;
      case 15: this.completeFlag('FUNKYTOWN', 'Reach'); break;
      case 16: this.completeFlag('I_AM_LOOT', 'Peek'); break;
      case 17: this.completeFlag('FLY_A_KITE_ON_A_WINDY_DAY', 'Use'); break;
      case 18: this.completeFlag('FOUND_GRAVEYARD', 'Reach'); break;
      case 19: this.completeFlag('GO_LAVA_FISHING', 'Do'); break;
      case 20: this.completeFlag('TALK_TO_NPC_AT_MAX_HAPPINESS', 'Do'); break;
      case 21: this.completeFlag('PET_THE_PET', 'Do'); break;
      case 22: this.completeFlag('FIND_A_FAIRY', 'Do'); break;
      case 23: this.completeFlag('DIE_TO_DEAD_MANS_CHEST', 'Do'); break;
      case 24: this.completeFlag('GAIN_TORCH_GODS_FAVOR', 'Use'); break;
      case 25: this.completeFlag('DRINK_BOTTLED_WATER_WHILE_DROWNING', 'Use'); break;
      case 26: this.completeFlag('PLAY_ON_A_SPECIAL_SEED', 'Do'); break;
      case 27: this.completeFlag('PURIFY_ENTIRE_WORLD', 'Do'); break;
      default: break;
    }
  }

  // ---- 计数型便捷入口（AchievementsHelper 对应方法） ----
  plantedAcorn(): void { this.addCounter('CONSERVATIONIST', 'Do', 1); }
  handleNurseService(coinsSpent: number): void { this.addCounter('FREQUENT_FLYER', 'Pay', coinsSpent); }
  handleAnglerService(): void {
    this.completeFlag('SERVANT_IN_TRAINING', 'Finish');
    this.addCounter('GOOD_LITTLE_SLAVE', 'Finish', 1);
    this.addCounter('TROUT_MONKEY', 'Finish', 1);
    this.addCounter('FAST_AND_FISHIOUS', 'Finish', 1);
    this.addCounter('SUPREME_HELPER_MINION', 'Finish', 1);
  }
  handleRunning(pixelsMoved: number): void { this.addCounter('MARATHON_MEDALIST', 'Move', pixelsMoved); }
  handleMining(): void { this.addCounter('BULLDOZER', 'Pick', 1); }
  doClassicTitleScreenAchievement(): void { this.completeFlag('GOING_OLDSCHOOL', 'Do'); }

  // ---- MechaMayhem（AchievementsHelper.cs:433-503 1:1） ----
  private mayhemOK = false;
  private mayhem1down = false;
  private mayhem2down = false;
  private mayhem3down = false;

  mechaMayhemStart(activeTypes: number[]): void {
    // ScanForMechs：127=毁灭者 134=机械骷髅王( SkeletronPrime=127? 按 Helper 源码：
    // foundSkeletronPrime |= 127；foundDestroyer |= 134；Twins = 125 && 126)
    const has = (t: number) => activeTypes.includes(t);
    this.mayhemOK = has(127) && has(134) && has(125) && has(126);
  }

  mechaMayhemClear(activeTypes: number[]): void {
    const has = (t: number) => activeTypes.includes(t);
    if (!(has(127) || has(134) || has(125) || has(126))) {
      this.mayhem1down = this.mayhem2down = this.mayhem3down = false;
    }
  }

  /** 击杀推进；activeTypes = 击杀后场上仍存活的 mech 类型集 */
  mechaMayhemKill(justKilled: number, activeTypes: number[]): void {
    if (!this.mayhemOK) return;
    const has = (t: number) => activeTypes.includes(t);
    if (justKilled === 125 || justKilled === 126) this.mayhem1down = true;
    else if (!has(125) && !has(126) && !this.mayhem1down) { this.mayhemOK = false; return; }
    if (justKilled === 134) this.mayhem2down = true;
    else if (!has(134) && !this.mayhem2down) { this.mayhemOK = false; return; }
    if (justKilled === 127) this.mayhem3down = true;
    else if (!has(127) && !this.mayhem3down) { this.mayhemOK = false; return; }
    if (this.mayhem1down && this.mayhem2down && this.mayhem3down) {
      this.notifyProgressionEvent(21);
    }
  }
}
