/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=332, 实指令=70,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorGel(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#6 op:0x02 */
let tmp6_0 = T[0] + C[20];
let tmp6_1 = T[1] + C[21];
R[4] = tmp6_0;
R[5] = tmp6_1;
/* inst#7 op:0x0b */
let tmp7_0 = Math.max(R[4], C[24]);
let tmp7_1 = Math.max(R[5], C[25]);
R[8] = tmp7_0;
R[9] = tmp7_1;
/* inst#8 op:0x0a */
let tmp8_0 = Math.min(C[28], R[8]);
let tmp8_1 = Math.min(C[29], R[9]);
R[4] = tmp8_0;
R[5] = tmp8_1;
/* inst#9 op:0x02 */
let tmp9_2 = T[1] + C[33];
let tmp9_3 = T[0] + C[32];
R[6] = tmp9_2;
R[7] = tmp9_3;
/* inst#10 op:0x0b */
let tmp10_0 = Math.max(R[7], C[24]);
let tmp10_1 = Math.max(R[6], C[25]);
R[8] = tmp10_0;
R[9] = tmp10_1;
/* inst#11 op:0x0a */
let tmp11_0 = Math.min(C[28], R[8]);
let tmp11_1 = Math.min(C[29], R[9]);
R[12] = tmp11_0;
R[13] = tmp11_1;
/* inst#12 op:0x02 */
let tmp12_2 = T[1] + C[37];
let tmp12_3 = T[0] + C[36];
R[6] = tmp12_2;
R[7] = tmp12_3;
/* inst#13 op:0x0b */
let tmp13_0 = Math.max(R[7], C[24]);
let tmp13_1 = Math.max(R[6], C[25]);
R[8] = tmp13_0;
R[9] = tmp13_1;
/* inst#14 op:0x0a */
let tmp14_0 = Math.min(C[28], R[8]);
let tmp14_1 = Math.min(C[29], R[9]);
R[16] = tmp14_0;
R[17] = tmp14_1;
/* inst#15 op:0x02 */
let tmp15_2 = T[1] + C[41];
let tmp15_3 = T[0] + C[40];
R[6] = tmp15_2;
R[7] = tmp15_3;
/* inst#16 op:0x0b */
let tmp16_0 = Math.max(R[7], C[24]);
let tmp16_1 = Math.max(R[6], C[25]);
R[8] = tmp16_0;
R[9] = tmp16_1;
/* inst#17 op:0x0a */
let tmp17_0 = Math.min(C[28], R[8]);
let tmp17_1 = Math.min(C[29], R[9]);
R[20] = tmp17_0;
R[21] = tmp17_1;
/* inst#18 op:0x01 */
let tmp18_0 = C[60];
let tmp18_1 = C[61];
R[8] = tmp18_0;
R[9] = tmp18_1;
/* inst#19 op:0x04 */
let tmp19_2 = T[1] * R[9] + (-C[57]);
let tmp19_3 = T[0] * R[8] + (-C[56]);
R[6] = tmp19_2;
R[7] = tmp19_3;
/* inst#20 op:0x02 */
let tmp20_2 = R[6] + (-C[1]);
let tmp20_3 = R[7] + (-C[0]);
R[6] = tmp20_2;
R[7] = tmp20_3;
/* inst#21 op:0x05 */
let tmp21_0 = R[6] * C[8];
R[8] = tmp21_0;
/* inst#22 op:0x04 */
let tmp22_0 = R[7] * C[4] + (-R[8]);
R[8] = tmp22_0;
/* inst#23 op:0x05 */
let tmp23_2 = R[6] * C[4];
R[6] = tmp23_2;
/* inst#24 op:0x04 */
let tmp24_1 = R[7] * C[8] + R[6];
R[9] = tmp24_1;
/* inst#25 op:0x02 */
let tmp25_2 = R[9] + C[1];
let tmp25_3 = R[8] + C[0];
R[6] = tmp25_2;
R[7] = tmp25_3;
/* inst#26 op:0x01 */
let tmp26_0 = C[64];
R[8] = tmp26_0;
/* inst#27 op:0x01 */
let tmp27_1 = (-C[12]);
R[9] = tmp27_1;
/* inst#28 op:0x04 */
let tmp28_2 = R[6] * C[65] + R[9];
let tmp28_3 = R[7] * C[65] + R[8];
R[6] = tmp28_2;
R[7] = tmp28_3;
/* inst#29 op:0x01 */
let tmp29_1 = (-C[64]);
R[9] = tmp29_1;
/* inst#30 op:0x02 */
let tmp30_2 = R[1] + R[0];
R[10] = tmp30_2;
/* inst#31 op:0x02 */
let tmp31_2 = R[2] + R[10];
R[10] = tmp31_2;
/* inst#32 op:0x05 */
let tmp32_3 = R[10] * C[66];
R[11] = tmp32_3;
/* inst#33 op:0x05 */
let tmp33_2 = R[11] * C[16];
R[14] = tmp33_2;
/* inst#34 op:0x05 */
let tmp34_0 = R[14] * C[67];
R[8] = tmp34_0;
/* inst#35 op:0x02 */
let tmp35_0 = R[7] + R[8];
let tmp35_1 = R[6] + R[9];
R[8] = tmp35_0;
R[9] = tmp35_1;
/* inst#36 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#37 op:0x42 */
SAM[0](R[12], R[13], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#38 op:0x42 */
SAM[0](R[16], R[17], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#39 op:0x42 */
SAM[0](R[20], R[21], sm2Scr);
R[20] = sm2Scr[0];
R[21] = sm2Scr[1];
R[22] = sm2Scr[2];
R[23] = sm2Scr[3];
/* inst#40 op:0x42 */
SAM[1](R[8], R[9], sm2Scr);
R[24] = sm2Scr[0];
R[25] = sm2Scr[1];
R[26] = sm2Scr[2];
R[27] = sm2Scr[3];
/* inst#41 op:0x0b */
let tmp41_0 = Math.max(R[23], R[3]);
R[4] = tmp41_0;
/* inst#42 op:0x0b */
let tmp42_0 = Math.max(R[19], R[4]);
R[8] = tmp42_0;
/* inst#43 op:0x0b */
let tmp43_1 = Math.max(R[15], R[8]);
R[5] = tmp43_1;
/* inst#44 op:0x0b */
let tmp44_1 = Math.max(R[7], R[5]);
R[9] = tmp44_1;
/* inst#45 op:0x05 */
let tmp45_1 = R[5] * C[68];
R[5] = tmp45_1;
/* inst#46 op:0x04 */
let tmp46_1 = R[9] * C[69] + R[5];
R[5] = tmp46_1;
/* inst#47 op:0x04 */
let tmp47_1 = R[8] * C[70] + R[5];
R[5] = tmp47_1;
/* inst#48 op:0x04 */
let tmp48_0 = R[4] * C[71] + R[5];
R[4] = tmp48_0;
/* inst#49 op:0x05 */
let tmp49_0 = R[11] * C[48];
let tmp49_1 = R[11] * C[49];
let tmp49_2 = R[11] * C[50];
R[0] = tmp49_0;
R[1] = tmp49_1;
R[2] = tmp49_2;
/* inst#50 op:0x05 */
let tmp50_0 = R[24] * R[4];
R[4] = tmp50_0;
/* inst#51 op:0x04 */
let tmp51_1 = R[4] * C[68] + R[3];
R[5] = tmp51_1;
/* inst#52 op:0x05 */
let tmp52_0 = R[4] * C[68];
R[4] = tmp52_0;
/* inst#53 op:0x04 */
let tmp53_0 = R[3] * C[68] + R[4];
R[4] = tmp53_0;
/* inst#54 op:0x02 */
let tmp54_0 = R[4] + C[79];
R[4] = tmp54_0;
/* inst#55 op:0x05 */
let tmp55_0 = R[4] * C[72];
R[4] = sat(tmp55_0);
/* inst#56 op:0x02 */
let tmp56_1 = R[5] + C[76];
R[5] = tmp56_1;
/* inst#57 op:0x58 */
let tmp57_1 = R[5] >= 0 ? C[77] : C[78];
R[5] = tmp57_1;
/* inst#58 op:0x05 */
let tmp58_1 = R[24] * R[5];
R[5] = tmp58_1;
/* inst#59 op:0x01 */
let tmp59_0 = C[44];
let tmp59_1 = C[45];
let tmp59_2 = C[46];
R[12] = tmp59_0;
R[13] = tmp59_1;
R[14] = tmp59_2;
/* inst#60 op:0x04 */
let tmp60_0 = R[5] * R[12] + C[52];
let tmp60_1 = R[5] * R[13] + C[53];
let tmp60_2 = R[5] * R[14] + C[54];
R[12] = tmp60_0;
R[13] = tmp60_1;
R[14] = tmp60_2;
/* inst#61 op:0x04 */
let tmp61_1 = R[4] * C[73] + C[74];
R[5] = tmp61_1;
/* inst#62 op:0x05 */
let tmp62_0 = R[4] * R[4];
R[4] = tmp62_0;
/* inst#63 op:0x05 */
let tmp63_0 = R[5] * R[4];
R[4] = tmp63_0;
/* inst#64 op:0x01 */
let tmp64_3 = C[77];
R[15] = tmp64_3;
/* inst#65 op:0x05 */
let tmp65_0 = R[12] * R[4];
let tmp65_1 = R[13] * R[4];
let tmp65_2 = R[14] * R[4];
let tmp65_3 = R[15] * R[4];
R[4] = tmp65_0;
R[5] = tmp65_1;
R[6] = tmp65_2;
R[7] = tmp65_3;
/* inst#66 op:0x05 */
let tmp66_0 = R[9] * R[4];
let tmp66_1 = R[9] * R[5];
let tmp66_2 = R[9] * R[6];
let tmp66_3 = R[9] * R[7];
R[4] = tmp66_0;
R[5] = tmp66_1;
R[6] = tmp66_2;
R[7] = tmp66_3;
/* inst#67 op:0x05 */
let tmp67_0 = R[7] * C[75];
R[8] = tmp67_0;
/* inst#68 op:0x04 */
let tmp68_0 = R[10] * (-C[80]) + R[8];
R[8] = tmp68_0;
/* inst#69 op:0x04 */
let tmp69_0 = R[4] * C[75] + (-R[0]);
let tmp69_1 = R[5] * C[75] + (-R[1]);
let tmp69_2 = R[6] * C[75] + (-R[2]);
let tmp69_3 = R[7] * C[75] + (-R[3]);
R[4] = tmp69_0;
R[5] = tmp69_1;
R[6] = tmp69_2;
R[7] = tmp69_3;
/* inst#70 op:0x04 */
let tmp70_0 = R[8] * R[4] + R[0];
let tmp70_1 = R[8] * R[5] + R[1];
let tmp70_2 = R[8] * R[6] + R[2];
let tmp70_3 = R[8] * R[7] + R[3];
R[12] = tmp70_0;
R[13] = tmp70_1;
R[14] = tmp70_2;
R[15] = tmp70_3;
/* inst#71 op:0x05 */
let tmp71_0 = R[8] * R[7];
R[0] = tmp71_0;
/* inst#72 op:0x58 */
let tmp72_3 = R[0] >= 0 ? R[15] : R[3];
R[15] = tmp72_3;
/* inst#73 op:0x05 */
let tmp73_0 = R[12] * V[0];
let tmp73_1 = R[13] * V[1];
let tmp73_2 = R[14] * V[2];
let tmp73_3 = R[15] * V[3];
R[0] = tmp73_0;
R[1] = tmp73_1;
R[2] = tmp73_2;
R[3] = tmp73_3;
/* inst#74 op:0x01 */
let tmp74_0 = R[0];
let tmp74_1 = R[1];
let tmp74_2 = R[2];
let tmp74_3 = R[3];
O[0] = tmp74_0;
O[1] = tmp74_1;
O[2] = tmp74_2;
O[3] = tmp74_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

