// GET /api/schools  (需主系统密码 x-admin-pwd)
// 列出所有学校 + 授权码状态
import { json, readKV, readConfig } from './_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const cfg = await readConfig(env);
  const auth = request.headers.get('x-admin-pwd');
  if (!auth || auth !== cfg.ADMIN_PWD) {
    return json(401, { success: false, message: '主系统密码错误' });
  }
  const schools = await readKV(env, 'schools');
  const codes = await readKV(env, 'inviteCodes');
  return json(200, { success: true, schools, codes });
}
