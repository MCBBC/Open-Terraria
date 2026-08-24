// 闪电折线生成器 —— LightningGenerator.cs(Terarria1457/Terraria.GameContent)1:1 移植。
//
// 消费方：proj1457.ts StormLightning（1117 天雷 Kill 帧 bolt / 1122 ArcSurge Kill 帧
// 手→雷 bolt + MultiPointHitbox 16×16 多点结算）。原版该类同时服务世界生成
// (WorldGen.cs)与弹幕；本移植仅取弹幕路径（GenerateMainBoltPath/Generate +
// CalcRotations + 两个预设 StormLightning/LightningStrikeWeapon + ArcSurge 工厂）。
//
// 数值精度：C# float32 逐运算舍入未做 fround 镜像（种子→折线的统计形态一致；
// 逐位对拍不可行——种子每次出手重掷、折线为瞬态视觉+命中域，无金标可锁）。
// LCG32 与分支/循环结构逐行对齐源码。

/** LCG32Random（Terraria.Utilities/LCG32Random.cs:5-44）1:1。
 *  Advance: state = (int)state * -1856014347 + 1（uint32 回绕） */
export class LCG32 {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  advance(): void {
    this.state = (Math.imul(this.state, -1856014347) + 1) >>> 0;
  }
  /** Next(uint maxValue) = (ulong)(state·maxValue) >> 32（BigInt 精确——
   *  state<2³² × maxValue 可超 2⁵³，Number 乘法会丢位） */
  next(maxValue: number): number {
    this.advance();
    return Number((BigInt(this.state) * BigInt(Math.max(0, maxValue | 0))) >> 32n);
  }
  nextDouble(): number {
    this.advance();
    return this.state / 4294967296.0;
  }
  nextFloat(): number {
    return this.nextDouble();
  }
}

export interface FloatRange {
  min: number;
  max: number;
}
export const floatRange = (min: number, max: number): FloatRange => ({ min, max });
export const rangeContains = (r: FloatRange, f: number): boolean => r.min <= f && f <= r.max;
export const rangeLerp = (r: FloatRange, amount: number): number => r.min + (r.max - r.min) * amount;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
/** Utils.Remap（Utils.cs:345）= lerp(toMin,toMax,GetLerpValue(fromMin,fromMax,from,clamped)) */
export const remap = (fromValue: number, fromMin: number, fromMax: number,
  toMin: number, toMax: number): number => {
  const t = clamp((fromValue - fromMin) / (fromMax - fromMin || 1e-9), 0, 1);
  return toMin + (toMax - toMin) * t;
};
/** MathHelper.WrapAngle（FNA）：while 双向规约,边界 ±π 原样返回 */
export const wrapAngle = (a: number): number => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  else if (x < -Math.PI) x += Math.PI * 2;
  return x;
};

export interface V2 { x: number; y: number }

export interface Bolt {
  positions: V2[];
  /** GenerateMainBoltPath（calcRotations:false）恒 null——EmitSpawnDust 走 UnitY 回退 */
  rotations: number[] | null;
  progressRange: FloatRange;
  forkDepth: number;
  collidedWithTile: boolean;
  get isMainBolt(): boolean;
}

/** 世界探针（TileCollision :209-226 的调用侧注入）：实心/斜坡实心 或 液体浸没 */
export type TileProbe = (x: number, y: number) => boolean;

export class LightningGenerator {
  solidTileCollision = false;
  sourceRotationLimit = Math.PI / 9;
  length = 1000;
  rotationStrength = 0;
  stepSize = 8;
  layers = 0;
  layerStrengthFactor = 0;
  perpendicularDeviationFactor = 0;
  reduceRandomnessAfter = 0;
  forkGenerationThresholdAngleFraction = 0;
  forkReflectAngleMultiplier = 0;
  forkRotationStrengthMultiplier = 0;
  forkStepSizeMultiplier = 0;
  forkLengthMultiplier = 0;
  maxForksPerBolt = 0;
  maxForkDepth = 0;
  forkProgressRange: FloatRange = floatRange(0, 1);
  tileProbe: TileProbe | null = null;

  /** Generate（:102-114）——direction 缺省语义由调用方展开（null → UnitY） */
  generate(bolts: Bolt[] | null, seed: number, targetPosition: V2,
    direction: V2, calcPositions: boolean, calcRotations: boolean): Bolt {
    const rng = new LCG32(seed);
    const rot = (rng.nextDouble() * 2.0 - 1.0) * this.sourceRotationLimit;
    const c = Math.cos(rot), s = Math.sin(rot);
    const dir: V2 = {
      x: (direction.x * c - direction.y * s) * this.length,
      y: (direction.x * s + direction.y * c) * this.length,
    };
    const result = this.generateBolt(bolts, seed, 0, calcPositions,
      { x: targetPosition.x - dir.x, y: targetPosition.y - dir.y },
      targetPosition, this.rotationStrength, this.stepSize, floatRange(0, 1));
    if (calcRotations && bolts) {
      for (const b of bolts) b.rotations = boltRotations(b.positions);
    }
    return result;
  }

  private generateBolt(bolts: Bolt[] | null, seed: number, depth: number, calcPositions: boolean,
    startPos: V2, targetPos: V2, rotationStrength: number, stepSize: number,
    progressRange: FloatRange): Bolt {
    const rng = new LCG32(seed);
    let num = 0;                                        // 累计角偏移
    const layerAngles = new Float64Array(this.layers);  // float[] array
    // ToTileCoordinates = (int)(pos/16)（正坐标域 floor≡trunc；负坐标取 C# 截断语义）
    const targetTileX = Math.trunc(targetPos.x / 16);
    const targetTileY = Math.trunc(targetPos.y / 16);
    let vector: V2 = { x: startPos.x, y: startPos.y };
    let value: V2 = { x: targetPos.x - startPos.x, y: targetPos.y - startPos.y };
    const num2 = Math.hypot(value.x, value.y);
    value.x /= num2; value.y /= num2;                   // 归一（num2>0：start≠target 恒成立）
    const value2: V2 = { x: value.y, y: -value.x };     // 垂直基
    const num3 = Math.max(Math.trunc((num2 * 2) / stepSize), 1);
    let num4 = 0;                                       // 已生成分叉数
    const positions: V2[] = calcPositions ? new Array(num3) : [];
    const bolt: Bolt = {
      positions,
      rotations: null,
      progressRange,
      forkDepth: depth,
      collidedWithTile: false,
      isMainBolt: depth === 0,
    };
    let i = 0;
    for (; i < num3; i++) {
      if (calcPositions) positions[i] = { x: vector.x, y: vector.y };
      let toTarget: V2 = { x: targetPos.x - vector.x, y: targetPos.y - vector.y };
      const num5 = toTarget.x * value.x + toTarget.y * value.y;   // 剩余投影
      if (num5 < stepSize) break;
      const num6 = clamp(1 - num5 / num2, 0, 1);                  // 归一进度
      if (this.solidTileCollision && this.tileProbe
        && (Math.trunc(vector.x / 16) !== targetTileX || Math.trunc(vector.y / 16) !== targetTileY)
        && this.tileProbe(vector.x, vector.y)) {
        bolt.progressRange = floatRange(progressRange.min, rangeLerp(progressRange, num6));
        bolt.collidedWithTile = true;
        break;
      }
      const tl = Math.hypot(toTarget.x, toTarget.y);
      toTarget.x /= tl; toTarget.y /= tl;
      const num7 = -(toTarget.x * value2.x + toTarget.y * value2.y);
      const num8 = Math.max(0.01, Math.min(num6, 1 - num6) * this.perpendicularDeviationFactor * 2);
      const num9 = clamp(num7 / num8, -1, 1);
      let layer = 0;
      if (pickLayerToReroll(rng.nextDouble(), 0.5, this.layers, outLayer())) {
        layer = takeLayer();
        let num10 = rotationStrength;
        for (let k = this.layers - 1; k > layer; k--) num10 /= this.layerStrengthFactor;
        let num12 = rng.nextDouble() * 2 - 1;
        num12 += (num9 - num12 * Math.abs(num9)) / 2;
        const num13 = num12 * num10;
        const num14 = layerAngles[layer];
        const num15 = num13 - num14;
        num += num15;
        layerAngles[layer] = num13;
        if (layer === this.layers - 1) {
          const num16 = rng.nextFloat();
          const num17 = remap(num4, 0, this.maxForksPerBolt, 1, 0);
          const num18 = num - num15 * (1 + this.forkReflectAngleMultiplier);
          if (bolts !== null && Math.abs(num15) >= rotationStrength * this.forkGenerationThresholdAngleFraction
            && rangeContains(this.forkProgressRange, num6) && depth < this.maxForkDepth
            && num16 < num17 && Math.abs(num18) < Math.PI * 4 / 9) {
            num4++;
            const num19 = (1 - num6) * this.forkLengthMultiplier;
            const targetPos2: V2 = {
              x: vector.x + (toTarget.x * Math.cos(num18) - toTarget.y * Math.sin(num18)) * num2 * num19,
              y: vector.y + (toTarget.x * Math.sin(num18) + toTarget.y * Math.cos(num18)) * num2 * num19,
            };
            this.generateBolt(bolts, (rng.state + 1) >>> 0, depth + 1, calcPositions,
              vector, targetPos2, rotationStrength * this.forkRotationStrengthMultiplier,
              stepSize * this.forkStepSizeMultiplier,
              floatRange(rangeLerp(progressRange, num6), rangeLerp(progressRange, num6 + num19)));
          }
        }
      }
      let num20 = remap(num6, this.reduceRandomnessAfter, 1, 0, 1);
      num20 += remap(Math.abs(num9), 0.5, 1, 0, 1);
      if (pickHighLayerToReroll(rng.nextDouble(), num20, this.layers, outLayer())) {
        layer = takeLayer();
        num -= layerAngles[layer];
        layerAngles[layer] = 0;
      }
      vector = {
        x: vector.x + (value.x * Math.cos(num) - value.y * Math.sin(num)) * stepSize,
        y: vector.y + (value.x * Math.sin(num) + value.y * Math.cos(num)) * stepSize,
      };
    }
    if (calcPositions && i < num3) {
      positions.length = i + 1;              // Array.Resize(ref array2, i + 1)
      bolt.positions = positions;
    }
    if (bolts !== null && (bolt.isMainBolt || i > 2)) bolts.push(bolt);
    return bolt;
  }

  /** GenerateMainBoltPath（:293-296）：calcPositions=true/calcRotations=false */
  generateMainBoltPath(seed: number, targetPosition: V2,
    direction?: V2 | null): Bolt {
    const dir = direction ?? { x: 0, y: 1 };
    return this.generate(null, seed, targetPosition, dir, true, false);
  }
}

// out 参数模拟（TS 无 out）：单槽闭包
let _layerSlot = 0;
function outLayer(): { get(): number; set(v: number): void } {
  return {
    get: () => _layerSlot,
    set: (v: number) => { _layerSlot = v; },
  };
}
function takeLayer(): number {
  return _layerSlot;
}

/** PickLayerToReroll（:228-239）：逐层 r≥1−chance 判定 + r/=chance 下探 */
function pickLayerToReroll(r: number, chance: number, layers: number, layer: { set(v: number): void }): boolean {
  let rr = r;
  for (let l = 0; l < layers; l++) {
    layer.set(l);
    if (rr >= 1 - chance) return true;
    rr /= chance;
  }
  return false;
}

/** PickHighLayerToReroll（:241-249）：命中后层号镜像（Layers−1−layer） */
function pickHighLayerToReroll(r: number, chance: number, layers: number, layer: { set(v: number): void }): boolean {
  if (!pickLayerToReroll(r, chance, layers, layer)) return false;
  layer.set(layers - 1 - _layerSlot);
  return true;
}

/** CalcRotations（:251-274）：相邻段角 + 中点平滑 + SmoothRotations */
export function boltRotations(positions: V2[]): number[] {
  const rotations = new Array<number>(positions.length).fill(0);
  calcRotationsInto(positions, rotations);
  return rotations;
}

export function calcRotationsInto(positions: V2[], rotations: number[]): void {
  if (rotations.length < 2) return;
  let num = 0;
  let num2 = Math.atan2(positions[0].y - positions[1].y, positions[0].x - positions[1].x);
  rotations[num++] = num2;
  while (num < rotations.length - 1) {
    const num3 = Math.atan2(positions[num].y - positions[num + 1].y,
      positions[num].x - positions[num + 1].x);
    rotations[num++] = num2 + wrapAngle(num3 - num2) / 2;
    num2 = num3;
  }
  rotations[num] = num2;
  smoothRotations(rotations);
}

function smoothRotations(rotations: number[]): void {
  let prev = rotations[0];
  for (let i = 1; i < rotations.length - 1; i++) {
    const cur = rotations[i];
    const next = rotations[i + 1];
    rotations[i] = cur + (wrapAngle(prev - cur) + wrapAngle(next - cur)) / 2;
    prev = cur;
  }
}

/** StormLightning 预设（:60-79）——世界天雷（1091 蓝雷同款） */
export function stormLightningGenerator(tileProbe: TileProbe | null): LightningGenerator {
  const g = new LightningGenerator();
  g.sourceRotationLimit = Math.PI / 9;
  g.length = 1000;
  g.rotationStrength = 0.9;
  g.stepSize = 8;
  g.layers = 4;
  g.layerStrengthFactor = 1.5;
  g.perpendicularDeviationFactor = 5;
  g.reduceRandomnessAfter = 0.8;
  g.forkGenerationThresholdAngleFraction = 0.65;
  g.forkReflectAngleMultiplier = 0.4;
  g.forkRotationStrengthMultiplier = 0.9;
  g.forkStepSizeMultiplier = 0.8;
  g.forkLengthMultiplier = 0.8;
  g.maxForksPerBolt = 2;
  g.maxForkDepth = 2;
  g.forkProgressRange = floatRange(0.3, 0.8);
  g.solidTileCollision = true;
  g.tileProbe = tileProbe;
  return g;
}

/** LightningStrikeWeapon 预设（:81-100）——6155 天雷杖（1117） */
export function lightningStrikeWeaponGenerator(tileProbe: TileProbe | null): LightningGenerator {
  const g = stormLightningGenerator(tileProbe);
  g.sourceRotationLimit = Math.PI / 36;
  g.length = 750;
  g.solidTileCollision = false;
  return g;
}

/** GetArcSurgeWeaponGenerator（:303-326）——6173 ArcSurge（1122）手→雷 bolt */
export function arcSurgeWeaponGenerator(start: V2, end: V2,
  tileProbe: TileProbe | null): LightningGenerator {
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const g = new LightningGenerator();
  g.sourceRotationLimit = 0;
  g.length = 1;
  g.rotationStrength = 0.7;
  g.stepSize = 6;
  g.layers = 5;
  g.layerStrengthFactor = 1.2;
  g.perpendicularDeviationFactor = remap(dist, 0, 1000, 5, 1);
  g.reduceRandomnessAfter = 0.7;
  g.forkGenerationThresholdAngleFraction = remap(dist, 0, 1000, 0.3, 0.5);
  g.forkReflectAngleMultiplier = remap(dist, 0, 1000, 0.6, 0.2);
  g.forkRotationStrengthMultiplier = 0.9;
  g.forkStepSizeMultiplier = 0.8;
  g.forkLengthMultiplier = 0.7;
  g.maxForksPerBolt = 3;
  g.maxForkDepth = 3;
  g.forkProgressRange = floatRange(remap(dist, 0, 1000, 0.1, 0.5), 0.8);
  g.solidTileCollision = true;
  g.tileProbe = tileProbe;
  return g;
}
