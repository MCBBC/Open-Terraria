/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=143, 实指令=28,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_RainbowTownSlime(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#4 op:0x02 */
let tmp4_0 = T[0] + (-C[0]);
let tmp4_1 = T[1] + (-C[1]);
R[4] = tmp4_0;
R[5] = tmp4_1;
/* inst#5 op:0x01 */
let tmp5_3 = C[12];
R[11] = tmp5_3;
/* inst#6 op:0x04 */
let tmp6_0 = R[4] * C[4] + R[11];
let tmp6_1 = R[5] * C[5] + R[11];
R[4] = tmp6_0;
R[5] = tmp6_1;
/* inst#7 op:0x05 */
let tmp7_1 = R[5] * C[13];
R[5] = tmp7_1;
/* inst#8 op:0x04 */
let tmp8_0 = R[4] * C[13] + R[5];
R[4] = tmp8_0;
/* inst#9 op:0x02 */
let tmp9_0 = R[4] + C[8];
R[4] = tmp9_0;
/* inst#10 op:0x58 */
let tmp10_1 = R[4] >= 0 ? C[14] : C[15];
R[5] = tmp10_1;
/* inst#11 op:0x05 */
let tmp11_0 = R[4] * R[5];
R[4] = tmp11_0;
/* inst#12 op:0x13 */
let tmp12_0 = R[4] - Math.floor(R[4]);
R[4] = tmp12_0;
/* inst#13 op:0x04 */
let tmp13_0 = R[5] * (-R[4]) + C[14];
R[4] = tmp13_0;
/* inst#14 op:0x04 */
let tmp14_1 = R[4] * C[17] + C[18];
R[5] = tmp14_1;
/* inst#15 op:0x23 */
let tmp15_1 = Math.abs(R[5]);
R[5] = tmp15_1;
/* inst#16 op:0x02 */
let tmp16_0 = R[5] + C[15];
R[8] = sat(tmp16_0);
/* inst#17 op:0x04 */
let tmp17_1 = R[4] * C[17] + C[19];
R[5] = tmp17_1;
/* inst#18 op:0x04 */
let tmp18_0 = R[4] * C[20] + C[21];
R[4] = tmp18_0;
/* inst#19 op:0x23 */
let tmp19_0 = Math.abs(R[4]);
R[4] = tmp19_0;
/* inst#20 op:0x02 */
let tmp20_2 = (-R[4]) + (-C[19]);
R[10] = sat(tmp20_2);
/* inst#21 op:0x23 */
let tmp21_0 = Math.abs(R[5]);
R[4] = tmp21_0;
/* inst#22 op:0x02 */
let tmp22_1 = (-R[4]) + (-C[19]);
R[9] = sat(tmp22_1);
/* inst#23 op:0x01 */
let tmp23_3 = C[14];
R[11] = tmp23_3;
/* inst#24 op:0x12 */
let tmp24_0 = C[22] * R[0] + (1 - C[22]) * R[8];
let tmp24_1 = C[22] * R[1] + (1 - C[22]) * R[9];
let tmp24_2 = C[22] * R[2] + (1 - C[22]) * R[10];
let tmp24_3 = C[22] * R[3] + (1 - C[22]) * R[11];
R[4] = tmp24_0;
R[5] = tmp24_1;
R[6] = tmp24_2;
R[7] = tmp24_3;
/* inst#25 op:0x04 */
let tmp25_0 = R[0] * C[23] + R[4];
let tmp25_1 = R[1] * C[23] + R[5];
let tmp25_2 = R[2] * C[23] + R[6];
let tmp25_3 = R[3] * C[23] + R[7];
R[4] = tmp25_0;
R[5] = tmp25_1;
R[6] = tmp25_2;
R[7] = tmp25_3;
/* inst#26 op:0x05 */
let tmp26_0 = R[0] * C[16];
R[8] = sat(tmp26_0);
/* inst#27 op:0x12 */
let tmp27_0 = R[8] * R[4] + (1 - R[8]) * R[0];
let tmp27_1 = R[8] * R[5] + (1 - R[8]) * R[1];
let tmp27_2 = R[8] * R[6] + (1 - R[8]) * R[2];
let tmp27_3 = R[8] * R[7] + (1 - R[8]) * R[3];
R[12] = tmp27_0;
R[13] = tmp27_1;
R[14] = tmp27_2;
R[15] = tmp27_3;
/* inst#28 op:0x05 */
let tmp28_0 = R[12] * V[0];
let tmp28_1 = R[13] * V[1];
let tmp28_2 = R[14] * V[2];
let tmp28_3 = R[15] * V[3];
R[4] = tmp28_0;
R[5] = tmp28_1;
R[6] = tmp28_2;
R[7] = tmp28_3;
/* inst#29 op:0x05 */
let tmp29_0 = R[3] * R[4];
let tmp29_1 = R[3] * R[5];
let tmp29_2 = R[3] * R[6];
let tmp29_3 = R[3] * R[7];
R[0] = tmp29_0;
R[1] = tmp29_1;
R[2] = tmp29_2;
R[3] = tmp29_3;
/* inst#30 op:0x01 */
let tmp30_0 = R[0];
let tmp30_1 = R[1];
let tmp30_2 = R[2];
let tmp30_3 = R[3];
O[0] = tmp30_0;
O[1] = tmp30_1;
O[2] = tmp30_2;
O[3] = tmp30_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

