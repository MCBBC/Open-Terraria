import { it } from 'vitest';
import * as MB from '../src/world/gen/vanilla/MicroBiomesPass';
(it as never as ((n: string, f: () => void) => void))('module probe', () => {
  const src = (MB as unknown as { runMicroBiomesPass: { toString(): string } }).runMicroBiomesPass.toString();
  console.log('driver has TI.place:', src.includes("TI.place"), 'len=', src.length);
  console.log('exports:', Object.keys(MB).length);
});
