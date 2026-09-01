/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=261, 实指令=52,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorHades(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x01 */
let tmp5_0 = C[44];
let tmp5_1 = C[45];
R[0] = tmp5_0;
R[1] = tmp5_1;
/* inst#6 op:0x04 */
let tmp6_0 = T[0] * R[0] + (-C[40]);
let tmp6_1 = T[1] * R[1] + (-C[41]);
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x02 */
let tmp7_0 = R[0] + (-C[16]);
let tmp7_1 = R[1] + (-C[17]);
R[0] = tmp7_0;
R[1] = tmp7_1;
/* inst#8 op:0x05 */
let tmp8_2 = R[1] * C[24];
R[2] = tmp8_2;
/* inst#9 op:0x04 */
let tmp9_0 = R[0] * C[20] + (-R[2]);
R[4] = tmp9_0;
/* inst#10 op:0x05 */
let tmp10_1 = R[1] * C[20];
R[1] = tmp10_1;
/* inst#11 op:0x04 */
let tmp11_1 = R[0] * C[24] + R[1];
R[5] = tmp11_1;
/* inst#12 op:0x02 */
let tmp12_0 = R[4] + C[16];
let tmp12_1 = R[5] + C[17];
R[0] = tmp12_0;
R[1] = tmp12_1;
/* inst#13 op:0x02 */
let tmp13_1 = R[1] + C[28];
R[1] = tmp13_1;
/* inst#14 op:0x04 */
let tmp14_0 = R[0] * C[53] + C[54];
R[0] = tmp14_0;
/* inst#15 op:0x13 */
let tmp15_0 = R[0] - Math.floor(R[0]);
R[0] = tmp15_0;
/* inst#16 op:0x04 */
let tmp16_0 = R[0] * C[48] + C[49];
R[0] = tmp16_0;
/* inst#17 op:0x25 */
R[5] = Math.sin(R[0]);
/* inst#18 op:0x04 */
let tmp18_0 = R[1] * C[53] + C[54];
R[0] = tmp18_0;
/* inst#19 op:0x13 */
let tmp19_0 = R[0] - Math.floor(R[0]);
R[0] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_0 = R[0] * C[48] + C[49];
R[0] = tmp20_0;
/* inst#21 op:0x25 */
R[9] = Math.sin(R[0]);
/* inst#22 op:0x02 */
let tmp22_0 = T[0] + C[4];
let tmp22_1 = T[1] + C[5];
R[0] = tmp22_0;
R[1] = tmp22_1;
/* inst#23 op:0x02 */
let tmp23_2 = R[1] + (-C[12]);
R[2] = tmp23_2;
/* inst#24 op:0x02 */
let tmp24_0 = T[0] + C[0];
let tmp24_1 = T[1] + C[1];
R[12] = tmp24_0;
R[13] = tmp24_1;
/* inst#25 op:0x42 */
SAM[0](R[0], R[1], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#26 op:0x42 */
SAM[0](R[12], R[13], sm2Scr);
R[20] = sm2Scr[0];
R[21] = sm2Scr[1];
R[22] = sm2Scr[2];
R[23] = sm2Scr[3];
/* inst#27 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[24] = sm2Scr[0];
R[25] = sm2Scr[1];
R[26] = sm2Scr[2];
R[27] = sm2Scr[3];
/* inst#28 op:0x02 */
let tmp28_0 = (-R[1]) + C[8];
R[0] = tmp28_0;
/* inst#29 op:0x58 */
let tmp29_1 = R[2] >= 0 ? R[19] : C[52];
R[1] = tmp29_1;
/* inst#30 op:0x58 */
let tmp30_0 = R[0] >= 0 ? R[1] : C[52];
R[0] = tmp30_0;
/* inst#31 op:0x04 */
let tmp31_3 = R[5] * R[9] + R[0];
R[7] = sat(tmp31_3);
/* inst#32 op:0x05 */
let tmp32_0 = R[7] * C[32];
let tmp32_1 = R[7] * C[33];
let tmp32_2 = R[7] * C[34];
R[4] = tmp32_0;
R[5] = tmp32_1;
R[6] = tmp32_2;
/* inst#33 op:0x02 */
let tmp33_1 = R[13] + (-C[12]);
R[1] = tmp33_1;
/* inst#34 op:0x02 */
let tmp34_2 = (-R[13]) + C[8];
R[2] = tmp34_2;
/* inst#35 op:0x58 */
let tmp35_1 = R[1] >= 0 ? R[23] : C[52];
R[1] = tmp35_1;
/* inst#36 op:0x58 */
let tmp36_1 = R[2] >= 0 ? R[1] : C[52];
R[1] = tmp36_1;
/* inst#37 op:0x0b */
let tmp37_0 = Math.max(R[1], R[0]);
R[8] = tmp37_0;
/* inst#38 op:0x02 */
let tmp38_0 = R[25] + R[24];
R[0] = tmp38_0;
/* inst#39 op:0x02 */
let tmp39_0 = R[26] + R[0];
R[0] = tmp39_0;
/* inst#40 op:0x04 */
let tmp40_1 = R[0] * (-C[50]) + R[8];
R[1] = tmp40_1;
/* inst#41 op:0x05 */
let tmp41_0 = R[0] * C[55];
R[0] = tmp41_0;
/* inst#42 op:0x05 */
let tmp42_0 = R[0] * C[36];
let tmp42_1 = R[0] * C[37];
let tmp42_2 = R[0] * C[38];
R[8] = tmp42_0;
R[9] = tmp42_1;
R[10] = tmp42_2;
/* inst#43 op:0x05 */
let tmp43_0 = R[4] * R[1];
let tmp43_1 = R[5] * R[1];
let tmp43_2 = R[6] * R[1];
let tmp43_3 = R[7] * R[1];
R[4] = tmp43_0;
R[5] = tmp43_1;
R[6] = tmp43_2;
R[7] = tmp43_3;
/* inst#44 op:0x04 */
let tmp44_0 = R[27] * (-C[56]) + C[57];
R[0] = tmp44_0;
/* inst#45 op:0x05 */
let tmp45_0 = R[4] * R[0];
let tmp45_1 = R[5] * R[0];
let tmp45_2 = R[6] * R[0];
let tmp45_3 = R[7] * R[0];
R[4] = tmp45_0;
R[5] = tmp45_1;
R[6] = tmp45_2;
R[7] = tmp45_3;
/* inst#46 op:0x05 */
let tmp46_0 = R[4] * C[58];
let tmp46_1 = R[5] * C[58];
let tmp46_2 = R[6] * C[58];
let tmp46_3 = R[7] * C[58];
R[4] = tmp46_0;
R[5] = tmp46_1;
R[6] = tmp46_2;
R[7] = tmp46_3;
/* inst#47 op:0x58 */
let tmp47_0 = R[1] >= 0 ? R[4] : C[52];
let tmp47_1 = R[1] >= 0 ? R[5] : C[52];
let tmp47_2 = R[1] >= 0 ? R[6] : C[52];
let tmp47_3 = R[1] >= 0 ? R[7] : C[52];
R[0] = tmp47_0;
R[1] = tmp47_1;
R[2] = tmp47_2;
R[3] = tmp47_3;
/* inst#48 op:0x01 */
let tmp48_3 = C[51];
R[11] = tmp48_3;
/* inst#49 op:0x04 */
let tmp49_0 = R[8] * R[27] + R[0];
let tmp49_1 = R[9] * R[27] + R[1];
let tmp49_2 = R[10] * R[27] + R[2];
let tmp49_3 = R[11] * R[27] + R[3];
R[0] = tmp49_0;
R[1] = tmp49_1;
R[2] = tmp49_2;
R[3] = tmp49_3;
/* inst#50 op:0x05 */
let tmp50_0 = R[0] * C[59];
let tmp50_1 = R[1] * C[59];
let tmp50_2 = R[2] * C[59];
let tmp50_3 = R[3] * C[59];
R[0] = tmp50_0;
R[1] = tmp50_1;
R[2] = tmp50_2;
R[3] = tmp50_3;
/* inst#51 op:0x0a */
let tmp51_0 = Math.min(R[0], C[51]);
let tmp51_1 = Math.min(R[1], C[51]);
let tmp51_2 = Math.min(R[2], C[51]);
let tmp51_3 = Math.min(R[3], C[51]);
R[4] = tmp51_0;
R[5] = tmp51_1;
R[6] = tmp51_2;
R[7] = tmp51_3;
/* inst#52 op:0x0b */
let tmp52_0 = Math.max(V[0], V[3]);
let tmp52_1 = Math.max(V[1], V[3]);
let tmp52_2 = Math.max(V[2], V[3]);
R[0] = tmp52_0;
R[1] = tmp52_1;
R[2] = tmp52_2;
/* inst#53 op:0x12 */
let tmp53_0 = C[54] * R[0] + (1 - C[54]) * V[0];
let tmp53_1 = C[54] * R[1] + (1 - C[54]) * V[1];
let tmp53_2 = C[54] * R[2] + (1 - C[54]) * V[2];
R[8] = tmp53_0;
R[9] = tmp53_1;
R[10] = tmp53_2;
/* inst#54 op:0x01 */
let tmp54_3 = V[3];
R[11] = tmp54_3;
/* inst#55 op:0x05 */
let tmp55_0 = R[4] * R[8];
let tmp55_1 = R[5] * R[9];
let tmp55_2 = R[6] * R[10];
let tmp55_3 = R[7] * R[11];
R[0] = tmp55_0;
R[1] = tmp55_1;
R[2] = tmp55_2;
R[3] = tmp55_3;
/* inst#56 op:0x01 */
let tmp56_0 = R[0];
let tmp56_1 = R[1];
let tmp56_2 = R[2];
let tmp56_3 = R[3];
O[0] = tmp56_0;
O[1] = tmp56_1;
O[2] = tmp56_2;
O[3] = tmp56_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

