// 一次性诊断：golden wld 头部 groundLevel/rockLevel vs 我方 post-terrain gs 值。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

it('wld header surface/rock vs ours', () => {
  const cases = [
    { f: '9293480世界.wld', seedText: '9293480', evil: 0 as const },
    { f: '12345世界.wld', seedText: '12345', evil: 0 as const },
    { f: '20260811世界.wld', seedText: '20260811', evil: 0 as const },
    { f: '2147483647世界.wld', seedText: '2147483647', evil: 1 as const },
    { f: 'SandboxWorld世界.wld', seedText: 'SandboxWorld', evil: 1 as const },
  ];
  { // 服务器真值 vs 用户客户端金标（一致性验证）
    const a = parseWld(new Uint8Array(readFileSync('/tmp/vserver/s9293480.wld')));
    const b = parseWld(new Uint8Array(readFileSync('tests/golden/wld/9293480世界.wld')));
    console.log(`SERVER 9293480: ground=${a.groundLevel} rock=${a.rockLevel} vs CLIENT金标 ground=${b.groundLevel} rock=${b.rockLevel} ${a.groundLevel === b.groundLevel && a.rockLevel === b.rockLevel ? 'OK' : 'MISMATCH'}`);
  }
  for (const c of cases) {
    const w = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${c.f}`)));
    const { gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: c.seedText, evil: c.evil });
    console.log(
      `${c.seedText}: wld worldId=${w.worldId} moon=${w.moonType} tree=${w.treeStyle.join('/')} cave=${(w.caveBackStyle ?? []).join('/')} ice=${w.iceBackStyle} jun=${w.jungleBackStyle} hell=${w.hellBackStyle} dungeon=(${w.dungeonX},${w.dungeonY}) spawn=(${w.spawnX},${w.spawnY}) ground=${w.groundLevel.toFixed(1)} rock=${w.rockLevel.toFixed(1)} | ` +
      `ours ws=${gs.worldSurface} rl=${gs.rockLevel} wsl=${gs.worldSurfaceLow} wsh=${gs.worldSurfaceHigh} rll=${gs.rockLevelLow.toFixed(0)} rlh=${gs.rockLevelHigh.toFixed(0)} water=${gs.waterLine} lava=${gs.lavaLine}`,
    );
  }
});
