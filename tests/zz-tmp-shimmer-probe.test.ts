// 临时探针：微光液体生成量 vs 沉降后存活量（验证后删除）
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

function shim(st: any) {
  let n = 0;
  for (let i = 0; i < st.liquid.length; i++) if (st.liquidType[i] === 4 && st.liquid[i] > 0) n++;
  return n;
}

describe('shimmer probe', () => {
  it('instrument pipeline settle', async () => {
    const origQuick = LiquidSim.prototype.quickWater;
    const origCheck = LiquidSim.prototype.waterCheck;
    const origUpdate = LiquidSim.prototype.updateLiquid;
    let tag = 'gen-pipeline';
    LiquidSim.prototype.quickWater = function (this: any, ...a: any[]) {
      const r = origQuick.apply(this, a as any);
      console.log(`[${tag}] quickWater -> shim=${shim(this.world.store)}`);
      return r;
    };
    LiquidSim.prototype.waterCheck = function (this: any, ...a: any[]) {
      const before = shim(this.world.store);
      const r = origCheck.apply(this, a as any);
      console.log(`[${tag}] waterCheck ${before} -> ${shim(this.world.store)} numLiquid=${this.numLiquid}`);
      return r;
    };
    let calls = 0;
    LiquidSim.prototype.updateLiquid = function (this: any, ...a: any[]) {
      const r = origUpdate.apply(this, a as any);
      if (++calls % 50 === 0) console.log(`[${tag}] updateLiquid#${calls} shim=${shim(this.world.store)} numLiquid=${this.numLiquid}`);
      return r;
    };
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'probe-shimmer' });
    console.log('final shim', shim(world.store), 'updateLiquid calls', calls);
    LiquidSim.prototype.quickWater = origQuick;
    LiquidSim.prototype.waterCheck = origCheck;
    LiquidSim.prototype.updateLiquid = origUpdate;
  }, 600000);
});
