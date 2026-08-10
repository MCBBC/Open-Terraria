// 存档 worker 客户端:主线程只付一次结构化克隆(全图数组 memcpy,小/中/大世界约
// 15/35/60ms——对比原同步序列化 147ms+ 全在主线程),RLE+base64+JSON 全套在后台完成。
// worker 不可用/超时/出错 → 回退主线程 saveGame(行为与旧版完全一致)。
// 与 WorldGenClient 同款握手模式。
import type { World } from '../world/World';
import type { Player } from '../entities/Player';
import type { SaveData, SaveMeta } from '../save/serialize';
import { saveGame } from '../save/SaveFile';
import { weatherToSave } from '../world/weather/Weather';

const HANDSHAKE_MS = 2000;
const SAVE_TIMEOUT_MS = 20000;

type SaveResponse =
  | { type: 'saved'; id: number; json: string }
  | { type: 'error'; id: number; message: string };

export class SaveClient {
  private worker: Worker | null = null;
  private broken = false;
  private nextId = 1;
  private pending = new Map<number, { resolve: (json: string) => void; reject: (e: Error) => void }>();
  /** 串行队列:连按保存只排一次,避免并发双份全图快照(瞬时内存 ×2) */
  private chain: Promise<unknown> = Promise.resolve();

  /** 后台存档(串行):成功返回与 saveGame 逐位一致的 JSON;任何失败回退同步路径 */
  save(world: World, player: Player, playTimeMs: number, townNpcs?: import('../save/serialize').SaveData['npcs']): Promise<string> {
    const run = this.chain
      .catch(() => undefined) // 前序失败不阻塞本次
      .then(() => this.doSave(world, player, playTimeMs, townNpcs));
    this.chain = run;
    return run;
  }

  private async doSave(world: World, player: Player, playTimeMs: number, townNpcs?: import('../save/serialize').SaveData['npcs']): Promise<string> {
    const w = this.worker;
    if (this.broken || !w) return saveGame(world, player, playTimeMs, townNpcs);
    const st = world.store;
    const id = this.nextId++;
    void townNpcs; // 附进 meta 消息（下方展开处）
    void 0;
    const meta: Omit<SaveMeta, 'w' | 'h'> = {
      name: world.name, seed: world.seed,
      spawnX: world.spawnX, spawnY: world.spawnY,
      groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
      treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
      crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
      timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
      chests: world.chests, signs: world.signs, flags: world.flags,
      weather: weatherToSave(world.weather),
      invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
        x: world.invasionX, delay: world.invasionDelay },
    };
    const playerData: SaveData['player'] = {
      hp: player.hp, x: player.x, y: player.y,
      inventory: player.inv.slots, selected: player.inv.selected,
      baseMaxHp: player.baseMaxHp, baseMaxMana: player.baseMaxMana, mana: player.mana,
      banks: player.banks,
    };
    // ★ 不 transfer:st.* 是活数组,transfer 会 detach 游戏状态;结构化克隆在发送线程
    // 完成(一次 memcpy),游戏内后续写入不影响已快照的副本
    const bufs = {
      type: st.type.buffer, flags: st.flags.buffer,
      frameX: st.frameX.buffer, frameY: st.frameY.buffer,
      wall: st.wall.buffer, liquid: st.liquid.buffer,
      liquidType: st.liquidType.buffer, wire: st.wire.buffer,
    };
    const promise = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p.reject(new Error('save worker timeout')); }
      }, SAVE_TIMEOUT_MS);
    });
    try {
      w.postMessage({ type: 'save', id, w: st.w, h: st.h, bufs, meta, player: playerData, playTimeMs, townNpcs });
    } catch {
      const p = this.pending.get(id);
      if (p) { this.pending.delete(id); }
      return saveGame(world, player, playTimeMs);
    }
    try {
      return await promise;
    } catch {
      return saveGame(world, player, playTimeMs); // 回退同步
    }
  }

  /** 懒建 worker(首次 save 时);失败标记 broken 永久回退 */
  ensure(): void {
    if (this.worker || this.broken || typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./save.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SaveResponse>) => {
        const d = e.data;
        const p = this.pending.get(d.id);
        if (!p) return;
        this.pending.delete(d.id);
        if (d.type === 'saved') p.resolve(d.json);
        else p.reject(new Error(d.message));
      };
      w.onerror = () => {
        // 致命错误:拒绝全部在途并永久回退
        this.broken = true;
        for (const [, p] of this.pending) p.reject(new Error('save worker fatal'));
        this.pending.clear();
        try { w.terminate(); } catch { /* 已死 */ }
        this.worker = null;
      };
      this.worker = w;
    } catch {
      this.broken = true;
    }
  }
}

/** 全局单例(mainFlow 建流时 ensure) */
export const saveClient = new SaveClient();
