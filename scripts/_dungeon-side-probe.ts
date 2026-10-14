// 硫磺海侧别疑点定谳①:node 台 Reset 流的 dungeonSide/dungeonLocation(seed 9293480)
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
const { gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 } as never);
console.log(JSON.stringify({
  dungeonSide: gs.dungeonSide, dungeonX: gs.dungeonX,
  dungeonLocation: gs.dungeonLocation, seed: gs.seed,
  worldSurfaceLow: gs.worldSurfaceLow,
}));
process.exit(0);
