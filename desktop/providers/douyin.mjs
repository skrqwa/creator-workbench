import { MiB, apiError, caption, endpoint, expectCode, fileForm, localFile, request, requiredId, requireInput } from './common.mjs';

const base = 'https://open.douyin.com/api/douyin/v1/video/';

async function call(ctx, path, step, { body, params, committed = false } = {}) {
  const { openId, accessToken } = ctx.credentials;
  requireInput(openId && accessToken, '请配置获准应用的用户 Access Token 及同一授权返回的 OpenID。');
  const headers = { 'access-token': accessToken };
  if (!(body instanceof FormData)) headers['content-type'] = 'application/json';
  const value = await request(ctx, step, endpoint(base + path + '/', { open_id: openId, ...params }), {
    method: 'POST', headers, body: body instanceof FormData ? body : JSON.stringify(body)
  }, committed);
  const code = value.data?.error_code ?? value.extra?.error_code;
  if (!expectCode(code, 0, step, committed) || (value.extra?.error_code !== undefined && value.extra.error_code !== 0)) {
    if (committed && [2100004, 28001005, 28001006].includes(code || value.extra?.error_code)) {
      apiError(step, code || value.extra?.error_code, '抖音返回系统或网络错误，请先在创作者中心核对。', 'unknown');
    }
    const hint = path === 'video_basic_info'
      ? '回查需要该用户授权 posting.behavior，缺少时请到抖音创作者中心核对原作品。'
      : '请核对该账号和应用的 video.create.bind 权限、授权有效期及视频要求。';
    apiError(step, code || value.extra?.error_code, hint);
  }
  return value.data ?? {};
}

async function uploadVideo(ctx, file) {
  if (file.blob.size <= 50 * MiB) {
    const result = await call(ctx, 'upload_video', '上传抖音视频', { body: fileForm('video', file) });
    return requiredId(result.video?.video_id, '上传抖音视频');
  }
  const init = await call(ctx, 'init_video_part_upload', '初始化抖音分片');
  const uploadId = requiredId(init.upload_id, '初始化抖音分片');
  // 均分可避免最后一片小于平台规定的 5 MiB，不需要加载整段视频。
  const count = Math.ceil(file.blob.size / (20 * MiB));
  const size = Math.ceil(file.blob.size / count);
  for (let i = 0; i < count; i++) {
    const part = file.blob.slice(i * size, (i + 1) * size, file.blob.type);
    await call(ctx, 'upload_video_part', '上传抖音视频分片', {
      params: { upload_id: uploadId, part_number: i + 1 }, body: fileForm('video', file, part)
    });
  }
  const result = await call(ctx, 'complete_video_part_upload', '合并抖音分片', { params: { upload_id: uploadId } });
  return requiredId(result.video?.video_id, '合并抖音分片');
}

export async function sendDouyin(ctx) {
  const { content } = ctx;
  requireInput(content.type === 'video', '抖音官方接口当前支持视频。');
  const file = await localFile(content.video, '抖音视频', { maxBytes: 4096 * MiB });
  const cover = content.cover ? await localFile(content.cover, '抖音封面', { maxBytes: 300 * MiB }) : null;
  const body = { video_id: await uploadVideo(ctx, file), text: caption(content) };
  if (cover) {
    const data = await call(ctx, 'upload_image', '上传抖音封面', { body: fileForm('image', cover) });
    body.custom_cover_image_url = requiredId(data.image?.image_id, '上传抖音封面');
  }
  const value = await call(ctx, 'create_video', '提交抖音视频', { body, committed: true });
  return { kind: 'douyin-video', remoteId: requiredId(value.item_id, '提交抖音视频', true), status: 'submitted', detail: '抖音已接收稿件，公开前仍需平台审核。' };
}

export async function checkDouyin(ctx, receipt) {
  requireInput(receipt.kind === 'douyin-video', '缺少可查询的抖音作品回执。');
  const data = await call(ctx, 'video_basic_info', '查询抖音作品', { body: { item_ids: [receipt.remoteId] } });
  const info = data.list?.find(item => item.item_id === receipt.remoteId);
  // 平台已公告收缩 video_status 的返回范围，无审核字段时不能从标题或封面推断公开。
  if (info?.video_status === 5) {
    const plainId = String(info.video_id || '');
    return { ...receipt, status: 'published', url: /^\d+$/.test(plainId) ? 'https://www.douyin.com/video/' + plainId : undefined, detail: '抖音返回该作品为公开视频。' };
  }
  if (info?.video_status === 4) return { ...receipt, status: 'reviewing', detail: '抖音正在审核该作品。' };
  if (info?.video_status === 2) return { ...receipt, status: 'failed', detail: '抖音标记该作品不适宜公开。' };
  return { ...receipt, status: 'unknown', detail: '抖音未返回可确认公开状态的字段，请在所选账号的创作者中心核对。' };
}
