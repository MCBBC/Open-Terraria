// 逻辑感应器 423 纯决策(TELogicSensor.cs 1:1,R20-D3/D4/D5/D6 提取自 Game.updateTriggerTiles)。
// frameY/18 全值分派(TELogicSensor.FigureCheckType :169-186):0昼/1夜/2玩家上方/
// 3水/4岩浆/5蜂蜜/6任意液。On 锁存 = tile frameX 18(ChangeState/GetFrame :129-141)。
// 液型编码 = 仓内 TileStore.liquidType(1水 2岩浆 3蜜 4微光)。

/** LogicCheckType(TELogicSensor.cs:9-17) */
export const LOGIC_SENSOR_MODE = {
  DAY: 0, NIGHT: 1, PLAYER_ABOVE: 2, WATER: 3, LAVA: 4, HONEY: 5, LIQUID: 6,
} as const;

/** 感应器档位(frameY/18;FigureCheckType :172-186 switch 同构) */
export function logicSensorMode(frameY: number): number {
  return Math.floor(frameY / 18);
}

/** 玩家上方档(GetState PlayerAbove :177-186):判定框 = (x*16-33, y*16-161, 82, 162)
 *  与玩家 AABB 相交(曾单列 ≤8 格 = 触发范围显著偏窄) */
export function playerAboveSensorState(
  px: number, py: number, pw: number, ph: number, x: number, y: number,
): boolean {
  const bx = x * 16 - 33, by = y * 16 - 161;
  return px + pw > bx && px < bx + 82 && py + ph > by && py < by + 162;
}

/** 液体四档(GetState Water/Lava/Honey/Liquid :236-266):
 *  - 基态 liquid>0;水档排除岩浆/蜂蜜/微光;岩浆档须岩浆;蜂蜜档须蜂蜜
 *  - 关断宽限(CountedData :247-262):干且 On 时首拍置 15,其后逐拍递减,>0 仍视为湿;
 *    原版计数不复位——归零后才重新武装(湿期不写计数)
 *  @param grace 上一拍计数(0 = 已武装/未启用) */
export function liquidSensorState(
  liquid: number, liquidType: number, mode: number, on: boolean, grace: number,
): { state: boolean; grace: number } {
  let flag = liquid > 0;
  if (mode === LOGIC_SENSOR_MODE.WATER && (liquidType === 2 || liquidType === 3 || liquidType === 4)) flag = false;
  else if (mode === LOGIC_SENSOR_MODE.LAVA && liquidType !== 2) flag = false;
  else if (mode === LOGIC_SENSOR_MODE.HONEY && liquidType !== 3) flag = false;
  if (!flag && on) {
    grace = grace === 0 ? 15 : grace - 1;
    flag = grace > 0;
  }
  return { state: flag, grace };
}

/** 昼/夜档状态(GetState Day/Night :234-235):昼档 = dayTime,夜档 = !dayTime */
export function dayNightSensorState(mode: number, isDay: boolean): boolean {
  return mode === LOGIC_SENSOR_MODE.DAY ? isDay : !isDay;
}
