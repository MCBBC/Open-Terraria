/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=289, 实指令=60,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorPhase(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#6 op:0x0b */
let tmp6_3 = Math.max(R[1], R[2]);
R[7] = tmp6_3;
/* inst#7 op:0x0b */
let tmp7_3 = Math.max(R[0], R[7]);
R[11] = tmp7_3;
/* inst#8 op:0x0a */
let tmp8_0 = Math.min(R[2], R[1]);
R[4] = tmp8_0;
/* inst#9 op:0x0a */
let tmp9_0 = Math.min(R[4], R[0]);
R[8] = tmp9_0;
/* inst#10 op:0x02 */
let tmp10_0 = R[11] + R[8];
R[4] = tmp10_0;
/* inst#11 op:0x02 */
let tmp11_1 = R[11] + (-R[8]);
R[5] = tmp11_1;
/* inst#12 op:0x04 */
let tmp12_2 = R[4] * (-C[64]) + C[65];
R[6] = tmp12_2;
/* inst#13 op:0x01 */
let tmp13_3 = C[66];
R[7] = tmp13_3;
/* inst#14 op:0x04 */
let tmp14_0 = R[6] * (-C[24]) + R[7];
let tmp14_1 = R[6] * (-C[25]) + R[7];
let tmp14_2 = R[6] * (-C[26]) + R[7];
R[8] = tmp14_0;
R[9] = tmp14_1;
R[10] = tmp14_2;
/* inst#15 op:0x04 */
let tmp15_3 = R[4] * (-C[52]) + C[52];
R[11] = tmp15_3;
/* inst#16 op:0x05 */
let tmp16_0 = R[4] * C[20];
let tmp16_1 = R[4] * C[21];
let tmp16_2 = R[4] * C[22];
R[12] = tmp16_0;
R[13] = tmp16_1;
R[14] = tmp16_2;
/* inst#17 op:0x58 */
let tmp17_0 = R[11] >= 0 ? R[12] : R[8];
let tmp17_1 = R[11] >= 0 ? R[13] : R[9];
let tmp17_2 = R[11] >= 0 ? R[14] : R[10];
R[8] = tmp17_0;
R[9] = tmp17_1;
R[10] = tmp17_2;
/* inst#18 op:0x04 */
let tmp18_0 = R[4] * (-C[52]) + R[8];
let tmp18_1 = R[4] * (-C[52]) + R[9];
let tmp18_2 = R[4] * (-C[52]) + R[10];
R[8] = tmp18_0;
R[9] = tmp18_1;
R[10] = tmp18_2;
/* inst#19 op:0x05 */
let tmp19_3 = R[4] * C[52];
R[11] = tmp19_3;
/* inst#20 op:0x05 */
let tmp20_0 = R[5] * C[40];
R[4] = tmp20_0;
/* inst#21 op:0x04 */
let tmp21_1 = R[5] * C[68] + C[69];
R[5] = tmp21_1;
/* inst#22 op:0x01 */
let tmp22_0 = C[28];
R[12] = tmp22_0;
/* inst#23 op:0x04 */
let tmp23_0 = R[4] * R[12] + C[32];
R[4] = tmp23_0;
/* inst#24 op:0x04 */
let tmp24_0 = R[4] * R[8] + R[11];
let tmp24_1 = R[4] * R[9] + R[11];
let tmp24_2 = R[4] * R[10] + R[11];
R[8] = tmp24_0;
R[9] = tmp24_1;
R[10] = tmp24_2;
/* inst#25 op:0x04 */
let tmp25_0 = R[8] * (-R[3]) + C[66];
let tmp25_1 = R[9] * (-R[3]) + C[66];
let tmp25_2 = R[10] * (-R[3]) + C[66];
R[8] = tmp25_0;
R[9] = tmp25_1;
R[10] = tmp25_2;
/* inst#26 op:0x05 */
let tmp26_0 = R[3] * R[8];
let tmp26_1 = R[3] * R[9];
let tmp26_2 = R[3] * R[10];
R[8] = tmp26_0;
R[9] = tmp26_1;
R[10] = tmp26_2;
/* inst#27 op:0x05 */
let tmp27_0 = R[5] * R[8];
let tmp27_1 = R[5] * R[9];
let tmp27_2 = R[5] * R[10];
R[4] = tmp27_0;
R[5] = tmp27_1;
R[6] = tmp27_2;
/* inst#28 op:0x01 */
let tmp28_0 = C[48];
let tmp28_1 = C[49];
R[8] = tmp28_0;
R[9] = tmp28_1;
/* inst#29 op:0x04 */
let tmp29_0 = T[0] * R[8] + (-C[44]);
let tmp29_1 = T[1] * R[9] + (-C[45]);
R[8] = tmp29_0;
R[9] = tmp29_1;
/* inst#30 op:0x05 */
let tmp30_0 = R[8] * C[52];
let tmp30_1 = R[9] * C[52];
R[8] = tmp30_0;
R[9] = tmp30_1;
/* inst#31 op:0x13 */
let tmp31_2 = R[9] - Math.floor(R[9]);
let tmp31_3 = R[8] - Math.floor(R[8]);
R[10] = tmp31_2;
R[11] = tmp31_3;
/* inst#32 op:0x02 */
let tmp32_0 = R[8] + (-R[11]);
let tmp32_1 = R[9] + (-R[10]);
R[8] = tmp32_0;
R[9] = tmp32_1;
/* inst#33 op:0x02 */
let tmp33_0 = R[8] + R[8];
let tmp33_1 = R[9] + R[9];
R[8] = tmp33_0;
R[9] = tmp33_1;
/* inst#34 op:0x05 */
let tmp34_0 = R[8] * C[8];
let tmp34_1 = R[9] * C[9];
R[8] = tmp34_0;
R[9] = tmp34_1;
/* inst#35 op:0x05 */
let tmp35_0 = R[8] * C[53];
R[12] = tmp35_0;
/* inst#36 op:0x01 */
let tmp36_2 = C[54];
R[10] = tmp36_2;
/* inst#37 op:0x04 */
let tmp37_1 = R[9] * R[10] + C[12];
R[13] = tmp37_1;
/* inst#38 op:0x05 */
let tmp38_0 = T[0] * C[0];
let tmp38_1 = T[1] * C[1];
R[8] = tmp38_0;
R[9] = tmp38_1;
/* inst#39 op:0x13 */
let tmp39_2 = R[9] - Math.floor(R[9]);
let tmp39_3 = R[8] - Math.floor(R[8]);
R[10] = tmp39_2;
R[11] = tmp39_3;
/* inst#40 op:0x02 */
let tmp40_0 = R[8] + (-R[11]);
let tmp40_1 = R[9] + (-R[10]);
R[8] = tmp40_0;
R[9] = tmp40_1;
/* inst#41 op:0x01 */
let tmp41_0 = C[16];
let tmp41_1 = C[17];
R[16] = tmp41_0;
R[17] = tmp41_1;
/* inst#42 op:0x04 */
let tmp42_0 = R[8] * C[4] + (-R[16]);
let tmp42_1 = R[9] * C[5] + (-R[17]);
R[8] = tmp42_0;
R[9] = tmp42_1;
/* inst#43 op:0x05 */
let tmp43_0 = R[8] * C[55];
R[16] = tmp43_0;
/* inst#44 op:0x01 */
let tmp44_0 = C[56];
R[8] = tmp44_0;
/* inst#45 op:0x04 */
let tmp45_1 = R[9] * R[8] + C[5];
R[17] = tmp45_1;
/* inst#46 op:0x02 */
let tmp46_0 = R[16] + C[16];
let tmp46_1 = R[17] + C[17];
R[8] = tmp46_0;
R[9] = tmp46_1;
/* inst#47 op:0x42 */
SAM[1]!(R[12], R[13], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#48 op:0x42 */
SAM[0]!(R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#49 op:0x02 */
let tmp49_0 = R[12] + C[57];
R[8] = tmp49_0;
/* inst#50 op:0x05 */
let tmp50_0 = R[8] * C[58];
R[8] = sat(tmp50_0);
/* inst#51 op:0x04 */
let tmp51_1 = R[8] * C[60] + C[61];
R[9] = tmp51_1;
/* inst#52 op:0x05 */
let tmp52_0 = R[8] * R[8];
R[8] = tmp52_0;
/* inst#53 op:0x05 */
let tmp53_3 = R[9] * R[8];
R[15] = tmp53_3;
/* inst#54 op:0x05 */
let tmp54_0 = R[15] * C[36];
let tmp54_1 = R[15] * C[37];
let tmp54_2 = R[15] * C[38];
R[12] = tmp54_0;
R[13] = tmp54_1;
R[14] = tmp54_2;
/* inst#55 op:0x05 */
let tmp55_0 = R[12] * C[59];
let tmp55_1 = R[13] * C[59];
let tmp55_2 = R[14] * C[59];
let tmp55_3 = R[15] * C[59];
R[12] = tmp55_0;
R[13] = tmp55_1;
R[14] = tmp55_2;
R[15] = tmp55_3;
/* inst#56 op:0x02 */
let tmp56_0 = R[1] + R[0];
R[0] = tmp56_0;
/* inst#57 op:0x02 */
let tmp57_0 = R[2] + R[0];
R[0] = tmp57_0;
/* inst#58 op:0x01 */
let tmp58_3 = R[3];
R[7] = tmp58_3;
/* inst#59 op:0x04 */
let tmp59_0 = R[0] * (-C[62]) + R[11];
R[0] = tmp59_0;
/* inst#60 op:0x05 */
let tmp60_0 = R[12] * R[0];
let tmp60_1 = R[13] * R[0];
let tmp60_2 = R[14] * R[0];
let tmp60_3 = R[15] * R[0];
R[8] = tmp60_0;
R[9] = tmp60_1;
R[10] = tmp60_2;
R[11] = tmp60_3;
/* inst#61 op:0x58 */
let tmp61_0 = R[0] >= 0 ? R[8] : C[63];
let tmp61_1 = R[0] >= 0 ? R[9] : C[63];
let tmp61_2 = R[0] >= 0 ? R[10] : C[63];
let tmp61_3 = R[0] >= 0 ? R[11] : C[63];
R[0] = tmp61_0;
R[1] = tmp61_1;
R[2] = tmp61_2;
R[3] = tmp61_3;
/* inst#62 op:0x02 */
let tmp62_0 = R[4] + R[0];
let tmp62_1 = R[5] + R[1];
let tmp62_2 = R[6] + R[2];
let tmp62_3 = R[7] + R[3];
R[0] = tmp62_0;
R[1] = tmp62_1;
R[2] = tmp62_2;
R[3] = tmp62_3;
/* inst#63 op:0x05 */
let tmp63_0 = R[0] * V[3];
let tmp63_1 = R[1] * V[3];
let tmp63_2 = R[2] * V[3];
let tmp63_3 = R[3] * V[3];
R[0] = tmp63_0;
R[1] = tmp63_1;
R[2] = tmp63_2;
R[3] = tmp63_3;
/* inst#64 op:0x01 */
let tmp64_0 = R[0];
let tmp64_1 = R[1];
let tmp64_2 = R[2];
let tmp64_3 = R[3];
O[0] = tmp64_0;
O[1] = tmp64_1;
O[2] = tmp64_2;
O[3] = tmp64_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

