/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=284, 实指令=56,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_HorizonClouds(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#6 op:0x02 */
let tmp6_0 = T[0] + C[21];
let tmp6_1 = T[1] + C[22];
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x02 */
let tmp7_0 = T[0] + C[24];
let tmp7_1 = T[1] + C[25];
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x02 */
let tmp8_0 = T[0] + C[26];
let tmp8_1 = T[1] + C[24];
R[8] = tmp8_0;
R[9] = tmp8_1;
/* inst#9 op:0x02 */
let tmp9_0 = T[0] + C[28];
let tmp9_1 = T[1] + C[29];
R[12] = tmp9_0;
R[13] = tmp9_1;
/* inst#10 op:0x42 */
SAM[0]!(R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#11 op:0x42 */
SAM[0]!(R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#12 op:0x42 */
SAM[0]!(R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#13 op:0x42 */
SAM[0]!(R[12], R[13], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#14 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#15 op:0x02 */
let tmp15_0 = R[3] + R[7];
R[0] = tmp15_0;
/* inst#16 op:0x02 */
let tmp16_0 = R[11] + R[0];
R[0] = tmp16_0;
/* inst#17 op:0x02 */
let tmp17_0 = R[15] + R[0];
R[0] = tmp17_0;
/* inst#18 op:0x02 */
let tmp18_0 = R[19] + R[0];
R[0] = tmp18_0;
/* inst#19 op:0x04 */
let tmp19_0 = R[0] * (-C[30]) + C[31];
R[0] = tmp19_0;
/* inst#20 op:0x02 */
let tmp20_1 = R[16] + C[23];
R[1] = tmp20_1;
/* inst#21 op:0x05 */
let tmp21_1 = R[1] * C[27];
R[1] = sat(tmp21_1);
/* inst#22 op:0x02 */
let tmp22_1 = (-R[1]) + C[14];
R[1] = tmp22_1;
/* inst#23 op:0x0b */
let tmp23_0 = Math.max(R[1], R[0]);
R[4] = tmp23_0;
/* inst#24 op:0x02 */
let tmp24_0 = T[4] + (-C[4]);
let tmp24_1 = T[5] + (-C[5]);
R[0] = tmp24_0;
R[1] = tmp24_1;
/* inst#25 op:0x5a */
R[2] = R[0] * R[0] + R[1] * R[1] + C[12];
/* inst#26 op:0x07 */
let tmp26_2 = 1 / Math.sqrt(R[2]);
R[2] = tmp26_2;
/* inst#27 op:0x05 */
let tmp27_0 = R[0] * R[2];
let tmp27_1 = R[1] * R[2];
R[0] = tmp27_0;
R[1] = tmp27_1;
/* inst#28 op:0x02 */
let tmp28_0 = (-T[4]) + C[8];
let tmp28_1 = (-T[5]) + C[9];
R[8] = tmp28_0;
R[9] = tmp28_1;
/* inst#29 op:0x5a */
R[2] = R[8] * R[8] + R[9] * R[9] + C[12];
/* inst#30 op:0x07 */
let tmp30_2 = 1 / Math.sqrt(R[2]);
R[2] = tmp30_2;
/* inst#31 op:0x05 */
let tmp31_0 = R[8] * R[2];
let tmp31_1 = R[9] * R[2];
R[8] = tmp31_0;
R[9] = tmp31_1;
/* inst#32 op:0x06 */
let tmp32_2 = 1 / R[2];
R[2] = tmp32_2;
/* inst#33 op:0x5a */
R[0] = R[0] * R[8] + R[1] * R[9] + C[12];
/* inst#34 op:0x05 */
let tmp34_1 = R[2] * C[20];
R[1] = tmp34_1;
/* inst#35 op:0x04 */
let tmp35_1 = R[1] * (-R[1]) + C[14];
R[1] = tmp35_1;
/* inst#36 op:0x0b */
let tmp36_1 = Math.max(R[0], R[1]);
R[5] = tmp36_1;
/* inst#37 op:0x04 */
let tmp37_0 = T[0] * C[18] + C[19];
let tmp37_1 = T[1] * C[18] + C[19];
R[0] = tmp37_0;
R[1] = tmp37_1;
/* inst#38 op:0x5a */
R[0] = R[0] * R[0] + R[1] * R[1] + C[12];
/* inst#39 op:0x07 */
let tmp39_0 = 1 / Math.sqrt(R[0]);
R[0] = tmp39_0;
/* inst#40 op:0x06 */
let tmp40_0 = 1 / R[0];
R[0] = tmp40_0;
/* inst#41 op:0x04 */
let tmp41_1 = R[5] * R[0] + (-C[15]);
R[1] = tmp41_1;
/* inst#42 op:0x04 */
let tmp42_0 = R[5] * R[0] + C[33];
R[0] = sat(tmp42_0);
/* inst#43 op:0x04 */
let tmp43_1 = R[4] * C[32] + R[1];
R[1] = tmp43_1;
/* inst#44 op:0x04 */
let tmp44_3 = R[2] * (-C[13]) + C[14];
R[3] = tmp44_3;
/* inst#45 op:0x04 */
let tmp45_2 = R[2] * (-C[16]) + C[17];
R[2] = tmp45_2;
/* inst#46 op:0x0b */
let tmp46_1 = Math.max(C[15], R[2]);
R[5] = tmp46_1;
/* inst#47 op:0x58 */
let tmp47_2 = R[3] >= 0 ? (-R[3]) : (-C[12]);
R[2] = tmp47_2;
/* inst#48 op:0x02 */
let tmp48_1 = R[1] + R[2];
R[1] = tmp48_1;
/* inst#49 op:0x04 */
let tmp49_0 = R[0] * R[4] + R[1];
R[0] = tmp49_0;
/* inst#50 op:0x05 */
let tmp50_0 = R[0] * C[10];
R[0] = tmp50_0;
/* inst#51 op:0x05 */
let tmp51_1 = R[5] * R[5];
R[1] = tmp51_1;
/* inst#52 op:0x05 */
let tmp52_1 = R[5] * R[1];
R[1] = tmp52_1;
/* inst#53 op:0x05 */
let tmp53_0 = R[0] * R[1];
R[0] = sat(tmp53_0);
/* inst#54 op:0x02 */
let tmp54_0 = (-V[0]) + C[0];
let tmp54_1 = (-V[1]) + C[1];
let tmp54_2 = (-V[2]) + C[2];
R[4] = tmp54_0;
R[5] = tmp54_1;
R[6] = tmp54_2;
/* inst#55 op:0x02 */
let tmp55_3 = (-V[3]) + C[14];
R[7] = tmp55_3;
/* inst#56 op:0x04 */
let tmp56_0 = R[4] * C[34] + V[0];
let tmp56_1 = R[5] * C[34] + V[1];
let tmp56_2 = R[6] * C[34] + V[2];
let tmp56_3 = R[7] * C[34] + V[3];
R[4] = tmp56_0;
R[5] = tmp56_1;
R[6] = tmp56_2;
R[7] = tmp56_3;
/* inst#57 op:0x05 */
let tmp57_0 = R[19] * R[4];
let tmp57_1 = R[19] * R[5];
let tmp57_2 = R[19] * R[6];
let tmp57_3 = R[19] * R[7];
R[4] = tmp57_0;
R[5] = tmp57_1;
R[6] = tmp57_2;
R[7] = tmp57_3;
/* inst#58 op:0x05 */
let tmp58_0 = R[16] * V[0];
let tmp58_1 = R[17] * V[1];
let tmp58_2 = R[18] * V[2];
let tmp58_3 = R[19] * V[3];
R[8] = tmp58_0;
R[9] = tmp58_1;
R[10] = tmp58_2;
R[11] = tmp58_3;
/* inst#59 op:0x04 */
let tmp59_0 = R[4] * V[3] + (-R[8]);
let tmp59_1 = R[5] * V[3] + (-R[9]);
let tmp59_2 = R[6] * V[3] + (-R[10]);
let tmp59_3 = R[7] * V[3] + (-R[11]);
R[4] = tmp59_0;
R[5] = tmp59_1;
R[6] = tmp59_2;
R[7] = tmp59_3;
/* inst#60 op:0x04 */
let tmp60_0 = R[0] * R[4] + R[8];
let tmp60_1 = R[0] * R[5] + R[9];
let tmp60_2 = R[0] * R[6] + R[10];
let tmp60_3 = R[0] * R[7] + R[11];
R[0] = tmp60_0;
R[1] = tmp60_1;
R[2] = tmp60_2;
R[3] = tmp60_3;
/* inst#61 op:0x01 */
let tmp61_0 = R[0];
let tmp61_1 = R[1];
let tmp61_2 = R[2];
let tmp61_3 = R[3];
O[0] = tmp61_0;
O[1] = tmp61_1;
O[2] = tmp61_2;
O[3] = tmp61_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

