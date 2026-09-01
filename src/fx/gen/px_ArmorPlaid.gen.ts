/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=207, 实指令=39,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorPlaid(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#6 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#7 op:0x01 */
let tmp7_0 = C[4];
let tmp7_1 = C[5];
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x04 */
let tmp8_1 = T[0] * R[4] + (-C[0]);
let tmp8_2 = T[1] * R[5] + (-C[1]);
R[5] = tmp8_1;
R[6] = tmp8_2;
/* inst#9 op:0x04 */
let tmp9_2 = R[6] * C[17] + C[18];
R[6] = tmp9_2;
/* inst#10 op:0x04 */
let tmp10_0 = R[5] * R[4] + (-C[0]);
R[4] = tmp10_0;
/* inst#11 op:0x05 */
let tmp11_0 = R[4] * C[8];
R[4] = sat(tmp11_0);
/* inst#12 op:0x13 */
let tmp12_1 = R[6] - Math.floor(R[6]);
R[5] = tmp12_1;
/* inst#13 op:0x04 */
let tmp13_1 = R[5] * C[20] + C[21];
R[5] = tmp13_1;
/* inst#14 op:0x25 */
R[8] = Math.cos(R[5]);
/* inst#15 op:0x04 */
let tmp15_1 = R[8] * C[18] + C[19];
R[5] = tmp15_1;
/* inst#16 op:0x05 */
let tmp16_1 = R[5] * C[16];
R[5] = sat(tmp16_1);
/* inst#17 op:0x04 */
let tmp17_2 = R[5] * C[12] + C[13];
R[6] = tmp17_2;
/* inst#18 op:0x05 */
let tmp18_1 = R[5] * R[5];
R[5] = tmp18_1;
/* inst#19 op:0x05 */
let tmp19_1 = R[6] * R[5];
R[5] = tmp19_1;
/* inst#20 op:0x05 */
let tmp20_1 = R[5] * C[14];
R[9] = tmp20_1;
/* inst#21 op:0x04 */
let tmp21_1 = R[4] * C[12] + C[13];
R[5] = tmp21_1;
/* inst#22 op:0x05 */
let tmp22_0 = R[4] * R[4];
R[4] = tmp22_0;
/* inst#23 op:0x05 */
let tmp23_0 = R[5] * R[4];
R[4] = tmp23_0;
/* inst#24 op:0x25 */
R[13] = Math.sin(R[4]);
/* inst#25 op:0x04 */
let tmp25_0 = R[13] * C[14] + C[15];
R[4] = tmp25_0;
/* inst#26 op:0x05 */
let tmp26_0 = R[4] * C[16];
R[4] = sat(tmp26_0);
/* inst#27 op:0x04 */
let tmp27_1 = R[4] * C[12] + C[13];
R[5] = tmp27_1;
/* inst#28 op:0x05 */
let tmp28_0 = R[4] * R[4];
R[4] = tmp28_0;
/* inst#29 op:0x04 */
let tmp29_0 = R[5] * R[4] + (-R[9]);
R[8] = tmp29_0;
/* inst#30 op:0x06 */
let tmp30_0 = 1 / R[3];
R[4] = tmp30_0;
/* inst#31 op:0x05 */
let tmp31_0 = R[0] * R[4];
let tmp31_1 = R[1] * R[4];
R[0] = tmp31_0;
R[1] = tmp31_1;
/* inst#32 op:0x02 */
let tmp32_0 = R[1] + R[0];
R[0] = tmp32_0;
/* inst#33 op:0x04 */
let tmp33_0 = R[2] * R[4] + R[0];
R[0] = tmp33_0;
/* inst#34 op:0x05 */
let tmp34_0 = R[0] * C[22];
let tmp34_1 = R[0] * C[22];
R[0] = tmp34_0;
R[1] = tmp34_1;
/* inst#35 op:0x05 */
let tmp35_0 = R[8] * R[0];
let tmp35_1 = R[9] * R[1];
R[4] = tmp35_0;
R[5] = tmp35_1;
/* inst#36 op:0x01 */
let tmp36_3 = C[23];
R[7] = tmp36_3;
/* inst#37 op:0x01 */
let tmp37_0 = V[0];
let tmp37_1 = V[1];
R[0] = tmp37_0;
R[1] = tmp37_1;
/* inst#38 op:0x01 */
let tmp38_2 = V[3];
R[2] = tmp38_2;
/* inst#39 op:0x05 */
let tmp39_0 = R[4] * R[0];
let tmp39_1 = R[5] * R[1];
R[4] = tmp39_0;
R[5] = tmp39_1;
/* inst#40 op:0x05 */
let tmp40_2 = R[7] * R[2];
R[6] = tmp40_2;
/* inst#41 op:0x05 */
let tmp41_0 = R[3] * R[4];
let tmp41_1 = R[3] * R[5];
R[8] = tmp41_0;
R[9] = tmp41_1;
/* inst#42 op:0x05 */
let tmp42_3 = R[3] * R[6];
R[11] = tmp42_3;
/* inst#43 op:0x01 */
let tmp43_2 = C[24];
R[10] = tmp43_2;
/* inst#44 op:0x01 */
let tmp44_0 = R[8];
let tmp44_1 = R[9];
let tmp44_2 = R[10];
let tmp44_3 = R[11];
O[0] = tmp44_0;
O[1] = tmp44_1;
O[2] = tmp44_2;
O[3] = tmp44_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

