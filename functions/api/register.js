// POST /api/register
// 注册: 存账户 (schools, active:false). 不开通子系统, 等授权码激活.
import { json, readKV, writeKV, rand, expireIso } from './_lib.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    let body;
    try { body = await request.json(); } catch (e) { return json(400, { success: false, message: '请求格式错误' }); }

    const schoolName = (body.schoolName || '').trim();
    const phone = (body.phone || '').trim();
    const adminPwd = (body.adminPwd || '').trim();

    if (!schoolName || !phone || !adminPwd) {
      return json(400, { success: false, message: '学校名称、手机号、密码都必填' });
    }
    if (!/^\d{6,20}$/.test(phone)) {
      return json(400, { success: false, message: '手机号格式错误 (6-20 位数字)' });
    }
    if (adminPwd.length < 6) {
      return json(400, { success: false, message: '密码至少 6 位' });
    }

    let schools = await readKV(env, 'schools');
    if (schools.some(s => s.phone === phone)) {
      return json(400, { success: false, message: '该手机号已注册, 请直接联系管理员获取授权码激活' });
    }

    const schoolId = 'school-' + phone.slice(-4) + '-' + rand(4);
    schools.push({
      schoolId,
      schoolName,
      phone,
      adminPwd,            // 明文存主系统 KV (内测). 后续可改哈希
      active: false,
      createdAt: new Date().toISOString(),
      kvNamespaceId: null,
      pagesProjectId: null,
      url: null,
      expiresAt: null
    });
    await writeKV(env, 'schools', schools);

    return json(200, {
      success: true,
      message: '注册成功! 请联系主系统管理员获取授权码, 然后在下方填写授权码激活',
      schoolId
    });
  } catch (e) {
    return json(500, { success: false, message: 'ERR: ' + (e && e.message), stack: e && e.stack });
  }
}
