// 共享库: CF API 调用 + KV 读写 + 工具函数
// 注意: _ 前缀文件不会被路由 (不是 /api/_lib)
// 配置从 master KV 的 'config' key 读取 (CF_TOKEN/CF_ACCOUNT_ID/ADMIN_PWD/MASTER_KV_ID)

export function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  });
}

async function getConfig(env) {
  const v = await env.MASTER_KV.get('config');
  if (!v) return {};
  try { return JSON.parse(v); } catch (e) { return {}; }
}

export async function readKV(env, key) {
  const v = await env.MASTER_KV.get(key);
  if (!v) return [];
  try { return JSON.parse(v); } catch (e) { return []; }
}

export async function writeKV(env, key, val) {
  await env.MASTER_KV.put(key, JSON.stringify(val));
}

export async function readConfig(env) {
  return getConfig(env);
}

export function rand(n) {
  let s = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function genCode(n) {
  let s = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符 I O 0 1
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function expireIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function cfFetch(env, method, path, body) {
  const cfg = await getConfig(env);
  const opts = {
    method,
    headers: { 'Authorization': 'Bearer ' + cfg.CF_TOKEN, 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, opts);
  let j = null;
  try { j = await res.json(); } catch (e) { j = { success: false, raw: await res.text() }; }
  return { status: res.status, body: j };
}

export async function cfCreateKV(env, schoolId) {
  const cfg = await getConfig(env);
  const r = await cfFetch(env, 'POST', '/accounts/' + cfg.CF_ACCOUNT_ID + '/storage/kv/namespaces',
    { title: 'school-substitute-' + schoolId + '-SCHOOL_SUB' });
  if (!r.body || !r.body.success) throw new Error('建 KV 失败: ' + JSON.stringify(r.body));
  return r.body.result.id;
}

export async function cfCreatePages(env, projName) {
  const cfg = await getConfig(env);
  const r = await cfFetch(env, 'POST', '/accounts/' + cfg.CF_ACCOUNT_ID + '/pages/projects', {
    name: projName,
    source: {
      type: 'github',
      config: { owner: 'pan13243', repo_name: 'school-substitute-template', production_branch: 'feature/multi-tenant' }
    }
  });
  if (!r.body || !r.body.success) throw new Error('建 Pages 失败: ' + JSON.stringify(r.body));
  return r.body.result;
}

export async function cfBindKV(env, projName, kvId) {
  const cfg = await getConfig(env);
  const bindings = {
    production: { kv_namespaces: { 'SCHOOL_SUB': { namespace_id: kvId } } },
    preview: { kv_namespaces: { 'SCHOOL_SUB': { namespace_id: kvId } } }
  };
  const r = await cfFetch(env, 'PATCH', '/accounts/' + cfg.CF_ACCOUNT_ID + '/pages/projects/' + projName,
    { deployment_configs: bindings });
  if (!r.body || !r.body.success) throw new Error('绑 KV 失败: ' + JSON.stringify(r.body));
}

export async function cfDeploy(env, projName) {
  const cfg = await getConfig(env);
  const r = await cfFetch(env, 'POST', '/accounts/' + cfg.CF_ACCOUNT_ID + '/pages/projects/' + projName + '/deployments',
    { branch: 'feature/multi-tenant' });
  if (!r.body || !r.body.success) throw new Error('触发部署失败: ' + JSON.stringify(r.body));
  return r.body.result.id;
}

// 轮询部署, 最多 40s (覆盖绝大多数 10-20s 部署). 超时返回 false (资源已建, 仅部署慢)
export async function cfPollDeploy(env, projName, depId) {
  const cfg = await getConfig(env);
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    const r = await cfFetch(env, 'GET', '/accounts/' + cfg.CF_ACCOUNT_ID + '/pages/projects/' + projName + '/deployments/' + depId);
    const d = r.body && r.body.result;
    const stageOk = d && d.latest_stage && d.latest_stage.status === 'success';
    const stageFail = d && d.latest_stage && d.latest_stage.status === 'failed';
    if (stageOk) return true;
    if (stageFail) throw new Error('部署失败');
  }
  return false;
}

export async function cfPutSchoolMeta(env, kvId, meta) {
  const cfg = await getConfig(env);
  const r = await cfFetch(env, 'PUT', '/accounts/' + cfg.CF_ACCOUNT_ID + '/storage/kv/namespaces/' + kvId + '/values/schoolMeta', meta);
  if (!r.body || !r.body.success) throw new Error('写 schoolMeta 失败: ' + JSON.stringify(r.body));
}
