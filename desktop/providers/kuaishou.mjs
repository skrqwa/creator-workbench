import { MiB, PlatformError, apiError, caption, endpoint, expectCode, fileForm, localFile, request, requiredId, requireInput } from './common.mjs';

const base = 'https://open.kuaishou.com/openapi/photo/';

function grantFor({ appId, openId, oauthGrant }, scope) {
  let grant;
  try { grant = JSON.parse(oauthGrant); } catch {}
  requireInput(appId && openId && (grant?.result === undefined || grant.result === 1) && typeof grant?.access_token === 'string' && grant.access_token, '请填写快手应用 ID、目标 OpenID 和该用户 OAuth 授权成功返回的 JSON。');
  requireInput(grant.open_id === openId, '快手授权回包中的 OpenID 与所选账号不符，请检查授权来源。');
  if (Array.isArray(grant.scopes)) requireInput(grant.scopes.includes(scope), `快手用户未授予 ${scope}，请在开放平台为该账号申请并重新授权。`);
  return { app_id: appId, access_token: grant.access_token };
}

function success(value, step, committed = false) {
  if (!expectCode(value.result, 1, step, committed)) {
    if (committed && value.result === 100200500) apiError(step, value.result, '快手返回内部错误，请先在创作者中心核对本次提交。', 'unknown');
    if ([100200108, 100200109, 100200110, 100200111].includes(value.result)) apiError(step, value.result, '该用户令牌已失效或授权已撤销，请更新所选用户的 OAuth 回包。');
    apiError(step, value.result, '请检查所选快手用户的授权范围、令牌有效期和发布额度。');
  }
  return value;
}

function uploadOrigin(value, protocol) {
  let url;
  try { url = new URL(String(value).includes('://') ? value : 'https://' + value); } catch {}
  const domains = /\.(?:kuaishou\.com|gifshow\.com|kuaishouzt\.com|ksapisrv\.com|kwaicdn\.com|kwai\.com|yximgs\.com)$/i;
  requireInput(url && ['https:', 'http:'].includes(url.protocol) && domains.test(url.hostname) && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash, '快手返回的上传网关地址无法识别，请在平台后台核对。');
  return protocol + '://' + url.hostname;
}

export async function sendKuaishou(ctx) {
  const { content } = ctx;
  requireInput(content.type === 'video' && content.title?.trim(), '快手官方发布需要视频和标题。');
  const auth = grantFor(ctx.credentials, 'user_video_publish');
  const protocol = (ctx.credentials.uploadProtocol || 'https').trim().toLowerCase();
  requireInput(['https', 'http'].includes(protocol), '快手文件网关协议请填写 HTTPS 或 HTTP。');
  const video = await localFile(content.video, '快手视频');
  const cover = await localFile(content.cover, '快手视频封面', { types: ['image/jpeg'], maxBytes: 10 * MiB - 1 });
  const info = success(await request(ctx, '初始化快手视频上传', endpoint(base + 'start_upload', auth), { method: 'POST' }), '初始化快手视频上传');
  const origin = uploadOrigin(info.endpoint, protocol);
  const token = requiredId(info.upload_token, '初始化快手视频上传');
  const fragmentSize = 8 * MiB;
  const multipart = video.blob.size >= 10 * MiB;
  const step = `向快手网关上传视频（${protocol.toUpperCase()}）`;
  const chunkSize = multipart ? fragmentSize : video.blob.size;
  for (let offset = 0; offset < video.blob.size; offset += chunkSize) {
    const params = { upload_token: token };
    if (multipart) params.fragment_id = offset / chunkSize;
    const blob = video.blob.slice(offset, offset + chunkSize);
    const url = endpoint(origin + (multipart ? '/api/upload/fragment' : '/api/upload'), params);
    const value = success(await request(ctx, step, url, { method: 'POST', body: blob, headers: { 'content-type': video.blob.type } }), step);
    if (value.size !== undefined && value.size !== blob.size) throw new PlatformError('failed', '快手返回的分片字节数与本地文件不符。');
  }
  if (multipart) {
    const params = { upload_token: token, fragment_count: Math.ceil(video.blob.size / fragmentSize) };
    success(await request(ctx, '合并快手视频分片', endpoint(origin + '/api/upload/complete', params), { method: 'POST' }), '合并快手视频分片');
  }
  const body = fileForm('cover', cover);
  body.set('caption', caption(content));
  const value = success(await request(ctx, '提交快手视频', endpoint(base + 'publish', { ...auth, upload_token: token }), { method: 'POST', body }, true), '提交快手视频', true);
  return { kind: 'kuaishou-video', remoteId: requiredId(value.video_info?.photo_id, '提交快手视频', true), status: 'submitted', detail: '快手已接收异步发布任务，可稍后查询作品。' };
}

export async function checkKuaishou(ctx, receipt) {
  requireInput(receipt.kind === 'kuaishou-video', '缺少可查询的快手视频回执。');
  const params = { ...grantFor(ctx.credentials, 'user_video_info'), photo_id: receipt.remoteId };
  const value = await request(ctx, '查询快手视频（user_video_info）', endpoint(base + 'info', params));
  if ([120001, 100120001, 120002, 100120002].includes(value.result)) {
    return { ...receipt, status: 'unknown', detail: '快手暂未查到该作品，可能仍在异步处理中，请稍后回查或核对创作者后台。' };
  }
  if ([120003, 100120003].includes(value.result)) return { ...receipt, status: 'failed', detail: '快手报告该视频发布失败。' };
  success(value, '查询快手视频（user_video_info）');
  const info = value.video_info;
  if (String(info?.photo_id) !== receipt.remoteId || typeof info.pending !== 'boolean') throw new PlatformError('unknown', '快手未返回与回执匹配的作品状态。');
  return info.pending
    ? { ...receipt, status: 'reviewing', detail: '快手正在处理作品。' }
    : { ...receipt, status: 'published', url: 'https://www.kuaishou.com/short-video/' + encodeURIComponent(receipt.remoteId), detail: '快手单条视频接口已查到作品，平台标记处理完成。' };
}
