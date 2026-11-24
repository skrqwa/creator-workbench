import { createHash, createHmac, randomUUID } from 'node:crypto';
import { MiB, PlatformError, apiError, endpoint, escapeHtml, expectCode, fileForm, localFile, paragraphs, publicUrl, request, requiredId, requireInput } from './common.mjs';

const base = 'https://member.bilibili.com/arcopen/fn/';
const picture = { types: ['image/jpeg', 'image/png'], maxBytes: 5 * MiB };

function signedHeaders(credentials, body) {
  const { clientId, clientSecret, accessToken } = credentials;
  // 平台签名示例中，GET、空正文和 multipart 使用空串摘要；JSON 按实际传输字节计算。
  const headers = {
    'x-bili-accesskeyid': clientId,
    'x-bili-content-md5': createHash('md5').update(typeof body === 'string' ? body : '').digest('hex'),
    'x-bili-signature-method': 'HMAC-SHA256',
    'x-bili-signature-nonce': randomUUID(),
    'x-bili-signature-version': '2.0',
    'x-bili-timestamp': String(Math.floor(Date.now() / 1000))
  };
  const message = Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n');
  return {
    ...headers, accept: 'application/json', 'access-token': accessToken,
    authorization: createHmac('sha256', clientSecret).update(message).digest('hex'),
    ...(body instanceof FormData ? {} : { 'content-type': 'application/json' })
  };
}

function unpack(value, step, committed) {
  if (!expectCode(value.code, 0, step, committed)) {
    if (committed && [4004, 4010, 4011, 123002, 123015, 129000].includes(value.code)) apiError(step, value.code, 'B站报告重复请求、同名投稿或服务异常，请先核对创作中心。', 'unknown');
    if ([127005, 127006, 127007, 127011].includes(value.code)) apiError(step, value.code, '请检查 B站开放平台的应用认证、接口权限及该用户的授权范围。');
    if ([123009, 123012, 123013, 123014, 123016].includes(value.code)) apiError(step, value.code, '请检查稿件的分区、标签、标题、简介与转载来源。');
    apiError(step, value.code, '请检查该账号的授权范围、投稿参数、账号状态和平台额度。');
  }
  return value.data ?? {};
}

async function call(ctx, path, step, { method = 'POST', payload, params, committed = false } = {}) {
  const body = payload instanceof FormData ? payload : JSON.stringify(payload);
  const value = await request(ctx, step, endpoint(base + path, params), { method, body, headers: signedHeaders(ctx.credentials, body) }, committed);
  return unpack(value, step, committed);
}

async function verifyAccount(ctx) {
  const { clientId, clientSecret, accessToken, openId } = ctx.credentials;
  requireInput(clientId && clientSecret && accessToken && openId, '请配置 B站应用凭据、账号 OpenID 和该用户授权的 Access Token。');
  const data = await call(ctx, 'user/account/info', '核对 B站账号（USER_INFO）', { method: 'GET' });
  requireInput(data.openid === openId, 'B站授权用户的 OpenID 与所选账号不符，请重新绑定授权。');
}

async function uploadPicture(ctx, path, file) {
  const result = await call(ctx, path, '上传 B站图片', { payload: fileForm('file', file) });
  const url = publicUrl(result.url);
  if (!url) throw new PlatformError('failed', 'B站未返回图片地址。');
  return url;
}

async function sendVideo(ctx) {
  const { content, credentials } = ctx;
  const tid = Number(content.biliTid || credentials.biliTid);
  const tag = String(content.biliTag || credentials.biliTag || '').trim();
  const copyright = Number(content.biliCopyright || credentials.biliCopyright);
  const source = String(content.biliSource || credentials.biliSource || '').trim();
  requireInput(Number.isSafeInteger(tid) && tid > 0, '请填写 B站视频分区 ID。');
  requireInput(tag && [...tag].length < 200, '请填写 B站视频标签，用英文逗号分隔，总长度须小于 200 字。');
  requireInput([1, 2].includes(copyright) && (copyright !== 2 || source), '请选择原创（1）或转载（2），转载须填写来源。');
  requireInput(content.title?.trim() && [...content.title].length < 80 && [...(content.body || '')].length < 250, 'B站视频标题须为 1 至 79 字，简介须少于 250 字。');
  const video = await localFile(content.video, 'B站视频', { maxBytes: 4096 * MiB });
  const cover = content.cover ? await localFile(content.cover, 'B站视频封面', picture) : null;
  await verifyAccount(ctx);
  const small = video.blob.size <= 100 * MiB;
  const data = await call(ctx, 'archive/video/init', '初始化 B站视频上传', { payload: { name: video.name, utype: small ? '1' : '0' } });
  const uploadToken = requiredId(data.upload_token, '初始化 B站视频上传');
  const chunk = small ? video.blob.size : 10 * MiB;
  for (let offset = 0; offset < video.blob.size; offset += chunk) {
    const query = { upload_token: uploadToken };
    if (!small) query.part_number = offset / chunk + 1;
    const url = endpoint('https://openupos.bilivideo.com/video/v2/' + (small ? 'upload' : 'part/upload'), query);
    const value = await request(ctx, '上传 B站视频文件', url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: video.blob.slice(offset, offset + chunk) });
    unpack(value, '上传 B站视频文件', false);
  }
  const params = { upload_token: uploadToken };
  if (!small) await call(ctx, 'archive/video/complete', '合并 B站视频分片', { params });
  const payload = { title: content.title, tid, tag, copyright, desc: content.body || '' };
  if (copyright === 2) payload.source = source;
  if (cover) payload.cover = await uploadPicture(ctx, 'archive/cover/upload', cover);
  const result = await call(ctx, 'archive/add-by-utoken', '提交 B站视频', { payload, params, committed: true });
  return { kind: 'bili-video', remoteId: requiredId(result.resource_id, '提交 B站视频', true), status: 'submitted', detail: 'B站已接收视频，可查询后续审核。' };
}

async function sendArticle(ctx) {
  const { content, credentials } = ctx;
  const paths = content.images || [];
  const category = Number(content.biliCategory || credentials.biliCategory);
  const body = content.body || '';
  const summary = String(content.biliSummary || [...body].slice(0, 200).join(''));
  requireInput(content.title?.trim() && [...content.title].length <= 40, 'B站专栏标题须填写且不超过 40 字。');
  requireInput(Number.isSafeInteger(category) && category > 0, '请填写 B站专栏子分类 ID。');
  requireInput([...summary].length >= 200, 'B站要求专栏简介至少 200 字，请补充简介或正文。');
  requireInput(([...body].length >= 200 || paths.length >= 3) && [...body].length <= 40000, 'B站专栏正文须 200 至 40000 字，少于 200 字时至少需 3 张配图。');
  const uniquePaths = [...new Set([...paths, ...(content.cover ? [content.cover] : [])])];
  const files = await Promise.all(uniquePaths.map(p => localFile(p, 'B站专栏配图', picture)));
  await verifyAccount(ctx);
  const urls = new Map();
  for (const file of files) urls.set(file.path, await uploadPicture(ctx, 'article/upload/image', file));
  const html = paragraphs(body) + paths.map(p => `<figure class="img-box" contenteditable="false"><img src="${escapeHtml(urls.get(p))}"><figcaption class="caption" contenteditable=""></figcaption></figure>`).join('');
  const form = new FormData();
  for (const [key, value] of Object.entries({ title: content.title, category, template_id: content.cover ? 4 : 5, summary, content: html })) {
    form.set(key, String(value));
  }
  if (content.cover) form.set('image_urls', urls.get(content.cover));
  const result = await call(ctx, 'article/add', '提交 B站专栏', { payload: form, committed: true });
  return { kind: 'bili-article', remoteId: requiredId(result.id, '提交 B站专栏', true), status: 'submitted', detail: 'B站已接收专栏，可查询后续审核。' };
}

export async function sendBilibili(ctx) {
  requireInput(['video', 'article'].includes(ctx.content.type), 'B站官方渠道支持视频和专栏文章。');
  return ctx.content.type === 'video' ? sendVideo(ctx) : sendArticle(ctx);
}

export async function checkBilibili(ctx, receipt) {
  await verifyAccount(ctx);
  if (receipt.kind === 'bili-video') {
    const data = await call(ctx, 'archive/view', '查询 B站视频', { method: 'GET', params: { resource_id: receipt.remoteId } });
    if (data.resource_id !== receipt.remoteId) throw new PlatformError('unknown', 'B站返回的视频稿件编号与回执不符。');
    const { state, state_desc: desc = '' } = data.addit_info || {};
    if (state === 0) return { ...receipt, status: 'published', url: publicUrl(data.video_info?.share_url), detail: 'B站视频已开放浏览。' };
    if (/打回|退回|锁定|违规|不通过|失败|删除|封禁/.test(desc)) return { ...receipt, status: 'failed', detail: 'B站未开放该稿件，请到创作中心查看审核原因。' };
    if (/审核|待审|转码|处理中|待发布/.test(desc)) return { ...receipt, status: 'reviewing', detail: 'B站正在处理或审核该视频。' };
    return { ...receipt, status: 'unknown', detail: 'B站返回的状态尚不能确认是否公开。' };
  }
  requireInput(receipt.kind === 'bili-article', '缺少可查询的 B站回执类型。');
  const form = new FormData();
  form.set('id', receipt.remoteId);
  const data = await call(ctx, 'article/detail', '查询 B站专栏', { method: 'GET', payload: form });
  if (String(data.id) !== receipt.remoteId) throw new PlatformError('unknown', 'B站返回的专栏编号与回执不符。');
  if ([0, 7, 9, 13].includes(data.state)) return { ...receipt, status: 'published', url: 'https://www.bilibili.com/read/cv' + encodeURIComponent(receipt.remoteId), detail: 'B站专栏已开放浏览。' };
  if ([-11, -10, -3, 3, 6, -14].includes(data.state)) return { ...receipt, status: 'failed', detail: 'B站专栏已打回或锁定，请在创作中心查看原因。' };
  if ([-8, -9, -1, -2, 2, 4, 5, -13, -12, 12, 14].includes(data.state)) return { ...receipt, status: 'reviewing', detail: 'B站专栏正在处理或等待发布，请检查创作中心。' };
  return { ...receipt, status: 'unknown', detail: 'B站返回了未识别的专栏状态。' };
}
