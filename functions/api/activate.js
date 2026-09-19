// POST /api/activate  { phone, code }
// 校验授权码 → 调 CF API 开通独立子系统 → 注入 schoolMeta → 返回 URL
import {
  json, readKV, writeKV, expireIso,
  cfCreateKV, cfCreatePages, cfBindKV, cfDeploy, cfPollDeploy, cfPutSchoolMeta
} from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch (e) { return json(400, { success: false, message: '请求格式错误' }); }

  const phone = (body.phone || '').trim();
  const code = (body.code || '').trim();
  if (!phone || !code) return json(400, { success: false, message: '手机号和授权码必填' });

  let schools = await readKV(env, 'schools');
  const school = schools.find(s => s.phone === phone && !s.active);
  if (!school) return json(404, { success: false, message: '未找到待激活的学校 (请先注册)' });

  let codes = await readKV(env, 'inviteCodes');
  const c = codes.find(x => x.code === code && !x.used);
  if (!c) return json(400, { success: false, message: '授权码无效或已使用' });

  try {
    const schoolId = school.schoolId;
    const kvId = await cfCreateKV(env, schoolId);
    const projName = 'school-substitute-' + schoolId;
    const pages = await cfCreatePages(env, projName);
    await cfBindKV(env, projName, kvId);
    const depId = await cfDeploy(env, projName);
    const deployed = await cfPollDeploy(env, projName, depId);

    await cfPutSchoolMeta(env, kvId, {
      schoolName: school.schoolName,
      adminPwd: school.adminPwd,
      principalPwd: 'principal888',
      adminName: school.phone,
      contact: school.phone,
      createdAt: new Date().toISOString(),
      plan: 'trial',
      expiresAt: expireIso(365)
    });

    school.active = true;
    school.kvNamespaceId = kvId;
    school.pagesProjectId = pages.id;
    school.url = 'https://' + projName + '.pages.dev';
    school.expiresAt = expireIso(365);
    await writeKV(env, 'schools', schools);

    c.used = true;
    c.schoolId = schoolId;
    c.usedAt = new Date().toISOString();
    await writeKV(env, 'inviteCodes', codes);

    return json(200, {
      success: true,
      url: school.url,
      adminPwd: school.adminPwd,
      expiresAt: school.expiresAt,
      deployed: deployed,
      message: deployed ? '激活成功, 子系统已开通!' : '已开通, 部署中, 请 1 分钟后访问'
    });
  } catch (e) {
    // 开通失败: 标记码未用 (允许重试), 学校保持待激活
    return json(500, { success: false, message: '开通失败: ' + e.message + ' (授权码仍有效, 可重试)' });
  }
}
