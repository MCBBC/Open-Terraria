// ★WaveWorker release 红绿（2026-10-06 标题/worker 清理刀登记债清偿）——
//
// 定谳：waterWaves = 模块单例（WaterWaves.ts:1461），跨世界生命周期存活；
// _wwSpawned 是【会话闩】（_wwEnsure 唯一短路钥匙）。只 terminate 不复位的
// 双重「波场静默永失」机制：
//   ① _wwSpawned 残留 → 下世界 _wwEnsure 永久短路 = 波场永不重建；
//   ② _wwOn 残留 → frame() 走 worker 分支向死 worker postMessage（结构化克隆
//      不抛错、静默丢弃）= 注入批/帧输入全吞 + 看门狗无新证据面。
// release() = terminate + 复位集 ⊇ 看门狗回落支（frame() :934-943）+ 阶梯重生
// 态清零（_wwFallCount/_wwRespawnAt/_wwShadow）= 下世界按「首建」语义惰性重建
// （_wwEnsure）。挂 Game.destroy（LightWorkerLink dispose 同范式）。
// node 测试域无 document/Worker → wwWorkerFlag 恒 false（:444 worker 上下文禁
// 自嵌套同款），worker 分支不可达 → 假 worker 态经私有字段直装（as any）；
// 全流程进→退→再进由活机探针覆盖（scripts/_ww-release-live.mjs）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waterWaves, setWaveTextures } from '../src/render/WaterWaves';

/** 假 worker 态直装（release() 的全部消费面） */
function armWorkerMode(): { terminate: ReturnType<typeof vi.fn> } {
  const ws = waterWaves as unknown as Record<string, unknown>;
  const terminate = vi.fn();
  ws._ww = { terminate };
  ws._wwOn = true;
  ws._wwSpawned = true;
  ws._wwShadow = true;          // 重生双轨残留
  ws._wwRespawnAt = 12345;      // 阶梯重生排程残留
  ws._wwFallCount = 2;          // 回落计数残留
  ws._wwErrored = true;
  ws._wwWd = { healthy: () => true };
  ws._wwTexSent = true;
  ws._wwQuietRun = 3; ws._wwQuietFrames = 1;
  ws._wwQuietVW = 800; ws._wwQuietVH = 600;
  return { terminate };
}

const frameInp = {
  camX: 0, camY: 0, zoom: 1, viewW: 400, viewH: 400,
  tileX: 1050, tileY: 100, maxTilesX: 2100, maxTilesY: 700,
  worldSurface: 110, rockLayer: 190, windAbs: 0, rain: 0, dt: 1 / 60,
};

beforeEach(() => {
  waterWaves.resetForTest();
  waterWaves.setQuality(3);
  const noise = new Uint8ClampedArray(256 * 256 * 4).fill(128);
  const ripple = new Uint8ClampedArray(64 * 128 * 4).fill(255);
  setWaveTextures({ w: 256, h: 256, data: noise }, { data: ripple });
});

describe('WaveWorker release（Game.destroy 挂点语义）', () => {
  it('release()：terminate 恰一次 + worker 域状态全复位', () => {
    const { terminate } = armWorkerMode();
    waterWaves.release();
    expect(terminate).toHaveBeenCalledTimes(1);
    const ws = waterWaves as unknown as Record<string, unknown>;
    expect(ws._ww).toBeNull();
    expect(ws._wwOn).toBe(false);
    expect(ws._wwSpawned).toBe(false);   // ★会话闩复位——_wwEnsure 重建唯一钥匙
    expect(ws._wwShadow).toBe(false);
    expect(ws._wwRespawnAt).toBe(0);     // 阶梯排程清零（防下世界按过期时刻误判重生）
    expect(ws._wwFallCount).toBe(0);     // 回落计数清零（下世界首建语义,不继承阶梯）
    expect(ws._wwErrored).toBe(false);
    expect(ws._wwWd).toBeNull();
    expect(ws._wwTexSent).toBe(false);   // 纹理下发旗复位（重生实例须重喂 32KB Ripples 形状纹理）
    expect(ws._wwQuietRun).toBe(0);
    expect(ws._wwQuietFrames).toBe(0);
    expect(ws._wwQuietVW).toBe(-1);
    expect(ws._wwQuietVH).toBe(-1);
    expect(waterWaves.wwActive()).toBe(false);
  });

  it('【病理论证锁】只 terminate 不复位：会话闩残留 → _wwEnsure 永久短路', () => {
    const { terminate } = armWorkerMode();
    // 模拟「天真清理刀」：只 terminate，不动任何闩
    terminate();
    const ws = waterWaves as unknown as Record<string, unknown>;
    // _wwSpawned 仍 true → _wwEnsure 首行短路（:517）——下世界永不重建
    expect(ws._wwSpawned).toBe(true);
    const before = ws._ww;
    (waterWaves as unknown as { _wwEnsure(): void })._wwEnsure();
    expect(ws._ww).toBe(before);         // 短路实证：_ww 未被重建
    // _wwOn 仍 true → frame() 会向死 worker postMessage（注入批静默吞）——
    // release() 两闩齐清后此面消失
    waterWaves.release();
    expect(ws._wwOn).toBe(false);
    expect(ws._wwSpawned).toBe(false);
  });

  it('幂等：未 spawn 态 release() 零副作用', () => {
    expect(() => waterWaves.release()).not.toThrow();
    const ws = waterWaves as unknown as Record<string, unknown>;
    expect(ws._ww).toBeNull();
    expect(ws._wwOn).toBe(false);
    expect(ws._wwSpawned).toBe(false);
    // 连发两次同样安全（destroy 幂等卫之后的二次 destroy 面）
    expect(() => waterWaves.release()).not.toThrow();
  });

  it('release 后 frame() 本地模拟链路无损（回落即主线程模拟语义）', () => {
    armWorkerMode();
    waterWaves.release();
    // q=3 本地路径照常步进——不因 _ww/_wwWd 已空而异常（:907 重生门 _wwRespawnAt=0
    // 短路;:991 _wwEnsure 由 wwWorkerFlag=false 跳过,node 域等价 worker 上下文）
    expect(() => waterWaves.frame(frameInp)).not.toThrow();
    expect(waterWaves.debug().stepsLastFrame).toBe(1);
    expect(waterWaves.wwActive()).toBe(false);
  });
});
