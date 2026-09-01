/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=237, 实指令=45,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_QueenSlime(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#6 op:0x01 */
let tmp6_0 = C[28];
let tmp6_1 = C[29];
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x04 */
let tmp7_1 = T[1] * R[1] + (-C[25]);
R[1] = tmp7_1;
/* inst#8 op:0x05 */
let tmp8_1 = R[1] * C[4];
R[1] = sat(tmp8_1);
/* inst#9 op:0x04 */
let tmp9_2 = R[1] * C[40] + C[41];
R[2] = tmp9_2;
/* inst#10 op:0x05 */
let tmp10_1 = R[1] * R[1];
R[1] = tmp10_1;
/* inst#11 op:0x05 */
let tmp11_3 = R[2] * R[1];
R[3] = tmp11_3;
/* inst#12 op:0x04 */
let tmp12_3 = R[3] * C[46] + C[47];
R[3] = tmp12_3;
/* inst#13 op:0x13 */
let tmp13_3 = R[3] - Math.floor(R[3]);
R[3] = tmp13_3;
/* inst#14 op:0x04 */
let tmp14_3 = R[3] * C[44] + C[45];
R[3] = tmp14_3;
/* inst#15 op:0x25 */
R[5] = Math.sin(R[3]);
/* inst#16 op:0x01 */
let tmp16_0 = C[36];
let tmp16_1 = C[37];
R[8] = tmp16_0;
R[9] = tmp16_1;
/* inst#17 op:0x04 */
let tmp17_3 = R[5] * R[8] + C[12];
R[3] = tmp17_3;
/* inst#18 op:0x04 */
let tmp18_1 = R[2] * R[1] + R[3];
R[5] = tmp18_1;
/* inst#19 op:0x04 */
let tmp19_0 = T[0] * R[0] + (-C[24]);
R[0] = tmp19_0;
/* inst#20 op:0x05 */
let tmp20_0 = R[0] * C[0];
R[0] = sat(tmp20_0);
/* inst#21 op:0x04 */
let tmp21_1 = R[0] * C[40] + C[41];
R[1] = tmp21_1;
/* inst#22 op:0x05 */
let tmp22_0 = R[0] * R[0];
R[0] = tmp22_0;
/* inst#23 op:0x05 */
let tmp23_0 = R[1] * R[0];
R[0] = tmp23_0;
/* inst#24 op:0x04 */
let tmp24_2 = R[0] * C[42] + C[43];
R[2] = tmp24_2;
/* inst#25 op:0x13 */
let tmp25_2 = R[2] - Math.floor(R[2]);
R[2] = tmp25_2;
/* inst#26 op:0x04 */
let tmp26_2 = R[2] * C[44] + C[45];
R[2] = tmp26_2;
/* inst#27 op:0x25 */
R[12] = Math.cos(R[2]);
/* inst#28 op:0x04 */
let tmp28_0 = R[12] * R[9] + C[16];
R[4] = tmp28_0;
/* inst#29 op:0x01 */
let tmp29_1 = C[38];
R[1] = tmp29_1;
/* inst#30 op:0x02 */
let tmp30_0 = R[4] + R[0];
let tmp30_1 = R[5] + R[1];
R[0] = tmp30_0;
R[1] = tmp30_1;
/* inst#31 op:0x05 */
let tmp31_0 = R[0] * C[43];
let tmp31_1 = R[1] * C[43];
R[0] = tmp31_0;
R[1] = tmp31_1;
/* inst#32 op:0x42 */
SAM[2](R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#33 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#34 op:0x02 */
let tmp34_1 = R[4] + C[20];
R[1] = tmp34_1;
/* inst#35 op:0x02 */
let tmp35_0 = (-R[0]) + R[1];
R[0] = tmp35_0;
/* inst#36 op:0x02 */
let tmp36_0 = R[0] + C[39];
R[0] = tmp36_0;
/* inst#37 op:0x58 */
let tmp37_1 = R[0] >= 0 ? C[32] : C[33];
R[1] = tmp37_1;
/* inst#38 op:0x05 */
let tmp38_0 = R[0] * R[1];
R[0] = tmp38_0;
/* inst#39 op:0x13 */
let tmp39_0 = R[0] - Math.floor(R[0]);
R[0] = tmp39_0;
/* inst#40 op:0x05 */
let tmp40_0 = R[1] * R[0];
R[0] = tmp40_0;
/* inst#41 op:0x01 */
let tmp41_1 = C[34];
R[1] = tmp41_1;
/* inst#42 op:0x42 */
SAM[1](R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#43 op:0x01 */
let tmp43_3 = C[39];
R[11] = tmp43_3;
/* inst#44 op:0x01 */
let tmp44_0 = R[4];
let tmp44_1 = R[4];
let tmp44_2 = R[4];
R[8] = tmp44_0;
R[9] = tmp44_1;
R[10] = tmp44_2;
/* inst#45 op:0x02 */
let tmp45_0 = R[0] + (-R[10]);
let tmp45_1 = R[1] + (-R[10]);
let tmp45_2 = R[2] + (-R[10]);
R[12] = tmp45_0;
R[13] = tmp45_1;
R[14] = tmp45_2;
/* inst#46 op:0x02 */
let tmp46_3 = R[3] + (-R[11]);
R[15] = tmp46_3;
/* inst#47 op:0x04 */
let tmp47_0 = R[5] * R[12] + R[8];
let tmp47_1 = R[5] * R[13] + R[9];
let tmp47_2 = R[5] * R[14] + R[10];
let tmp47_3 = R[5] * R[15] + R[11];
R[0] = tmp47_0;
R[1] = tmp47_1;
R[2] = tmp47_2;
R[3] = tmp47_3;
/* inst#48 op:0x05 */
let tmp48_3 = R[7] * R[3];
R[3] = tmp48_3;
/* inst#49 op:0x05 */
let tmp49_0 = R[0] * V[0];
let tmp49_1 = R[1] * V[1];
let tmp49_2 = R[2] * V[2];
let tmp49_3 = R[3] * V[3];
R[0] = tmp49_0;
R[1] = tmp49_1;
R[2] = tmp49_2;
R[3] = tmp49_3;
/* inst#50 op:0x01 */
let tmp50_0 = R[0];
let tmp50_1 = R[1];
let tmp50_2 = R[2];
let tmp50_3 = R[3];
O[0] = tmp50_0;
O[1] = tmp50_1;
O[2] = tmp50_2;
O[3] = tmp50_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

