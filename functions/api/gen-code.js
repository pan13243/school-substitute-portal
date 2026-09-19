// POST /api/gen-code  (需主系统密码 x-admin-pwd)
// 生成授权码, 存 inviteCodes
import { json, readKV, writeKV, genCode } from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = request.headers.get('x-admin-pwd');
  if (!auth || auth !== env.ADMIN_PWD) {
    return json(401, { success: false, message: '主系统密码错误' });
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const count = Math.min(Math.max(parseInt(body.count) || 1, 1), 50);
  let codes = await readKV(env, 'inviteCodes');

  const newCodes = [];
  for (let i = 0; i < count; i++) {
    const code = genCode(8);
    codes.push({ code, used: false, createdAt: new Date().toISOString(), schoolId: null, usedAt: null });
    newCodes.push(code);
  }
  await writeKV(env, 'inviteCodes', codes);

  return json(200, { success: true, codes: newCodes, message: '已生成 ' + count + ' 个授权码' });
}
