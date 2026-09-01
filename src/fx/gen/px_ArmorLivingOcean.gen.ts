/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=167, 实指令=28,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorLivingOcean(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#7 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#8 op:0x01 */
let tmp8_3 = C[12];
R[7] = tmp8_3;
/* inst#9 op:0x04 */
let tmp9_0 = T[0] * R[7] + (-C[8]);
R[4] = tmp9_0;
/* inst#10 op:0x05 */
let tmp10_0 = R[4] * C[0];
R[4] = sat(tmp10_0);
/* inst#11 op:0x04 */
let tmp11_1 = R[4] * C[17] + C[18];
R[5] = tmp11_1;
/* inst#12 op:0x05 */
let tmp12_0 = R[4] * R[4];
R[4] = tmp12_0;
/* inst#13 op:0x04 */
let tmp13_0 = R[5] * R[4] + C[19];
R[4] = tmp13_0;
/* inst#14 op:0x02 */
let tmp14_1 = R[1] + R[0];
R[5] = tmp14_1;
/* inst#15 op:0x02 */
let tmp15_1 = R[2] + R[5];
R[5] = tmp15_1;
/* inst#16 op:0x05 */
let tmp16_1 = R[5] * C[16];
R[5] = tmp16_1;
/* inst#17 op:0x05 */
let tmp17_0 = R[4] * R[5];
R[4] = tmp17_0;
/* inst#18 op:0x01 */
let tmp18_3 = C[19];
R[7] = tmp18_3;
/* inst#19 op:0x04 */
let tmp19_0 = R[4] * (-R[7]) + C[4];
R[4] = tmp19_0;
/* inst#20 op:0x05 */
let tmp20_2 = R[4] * C[20];
R[6] = tmp20_2;
/* inst#21 op:0x23 */
let tmp21_2 = Math.abs(R[6]);
R[6] = tmp21_2;
/* inst#22 op:0x13 */
let tmp22_2 = R[6] - Math.floor(R[6]);
R[6] = tmp22_2;
/* inst#23 op:0x58 */
let tmp23_0 = R[4] >= 0 ? R[6] : (-R[6]);
R[4] = tmp23_0;
/* inst#24 op:0x04 */
let tmp24_0 = R[4] * C[21] + C[22];
R[4] = tmp24_0;
/* inst#25 op:0x13 */
let tmp25_0 = R[4] - Math.floor(R[4]);
R[4] = tmp25_0;
/* inst#26 op:0x04 */
let tmp26_0 = R[4] * C[28] + C[29];
R[4] = tmp26_0;
/* inst#27 op:0x25 */
R[8] = Math.cos(R[4]);
/* inst#28 op:0x04 */
let tmp28_0 = R[8] * (-C[30]) + C[31];
R[4] = tmp28_0;
/* inst#29 op:0x01 */
let tmp29_0 = C[32];
let tmp29_1 = C[33];
let tmp29_2 = C[34];
R[8] = tmp29_0;
R[9] = tmp29_1;
R[10] = tmp29_2;
/* inst#30 op:0x04 */
let tmp30_0 = R[4] * R[8] + C[24];
let tmp30_1 = R[4] * R[9] + C[25];
let tmp30_2 = R[4] * R[10] + C[26];
R[8] = tmp30_0;
R[9] = tmp30_1;
R[10] = tmp30_2;
/* inst#31 op:0x05 */
let tmp31_0 = R[5] * R[8];
let tmp31_1 = R[5] * R[9];
let tmp31_2 = R[5] * R[10];
R[4] = tmp31_0;
R[5] = tmp31_1;
R[6] = tmp31_2;
/* inst#32 op:0x05 */
let tmp32_0 = R[3] * R[4];
let tmp32_1 = R[3] * R[5];
let tmp32_2 = R[3] * R[6];
R[0] = tmp32_0;
R[1] = tmp32_1;
R[2] = tmp32_2;
/* inst#33 op:0x05 */
let tmp33_0 = R[0] * V[3];
let tmp33_1 = R[1] * V[3];
let tmp33_2 = R[2] * V[3];
let tmp33_3 = R[3] * V[3];
R[0] = tmp33_0;
R[1] = tmp33_1;
R[2] = tmp33_2;
R[3] = tmp33_3;
/* inst#34 op:0x01 */
let tmp34_0 = R[0];
let tmp34_1 = R[1];
let tmp34_2 = R[2];
let tmp34_3 = R[3];
O[0] = tmp34_0;
O[1] = tmp34_1;
O[2] = tmp34_2;
O[3] = tmp34_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

