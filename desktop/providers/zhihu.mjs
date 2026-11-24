import { createHmac, randomUUID } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { PlatformError, apiError, escapeHtml, expectCode, paragraphs, publicUrl, request, requiredId, requireInput } from './common.mjs';

const articleStatements = ['spoiler', 'medical_advice', 'fictional_creation', 'contain_finance', 'ai_creation'];

async function connectUploader(credentials) {
  const name = process.platform === 'win32' ? 'zhihu-mediacloud-uploader.exe' : 'zhihu-mediacloud-uploader';
  const paths = [join(homedir(), '.local', 'bin'), ...(process.env.PATH || '').split(delimiter)].filter(isAbsolute);
  let executable;
  for (const dir of paths) {
    const path = join(dir, name);
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) { executable = path; break; }
    } catch {}
  }
  requireInput(executable, '配图需要知乎官方 zhihu-mediacloud-uploader，请安装并将可执行程序加入 PATH 后重启工作台。');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({ name: 'creator-workbench', version: '1.0' });
  const transport = new StdioClientTransport({
    command: executable, args: [], stderr: 'ignore',
    env: {
      ZHIHU_OPENAPI_APP_KEY: credentials.appKey, ZHIHU_OPENAPI_APP_SECRET: credentials.appSecret,
      ZHIHU_MEDIACLOUD_BASE_URL: 'https://openapi.zhihu.com', ZHIHU_MEDIACLOUD_API_TIMEOUT: '30'
    }
  });
  try {
    await client.connect(transport, { timeout: 30_000 });
    return client;
  } catch {
    await client.close().catch(() => {});
    throw new PlatformError('needs_action', '无法启动知乎官方媒体工具，请核对安装及其依赖。');
  }
}

function imageResult(result) {
  let value = result.structuredContent;
  if (!value) {
    try { value = JSON.parse(result.content?.find(block => block.type === 'text')?.text); } catch {}
  }
  if (value?.error_type === 'validation_error') {
    throw new PlatformError('needs_action', '知乎媒体工具校验图片失败，请检查本地图片格式、尺寸和文件内容。');
  }
  if (result.isError || !value?.success || value.media_type !== 'image' || value.upload_result !== 'UPLOAD_SUCCESS') {
    throw new PlatformError('needs_action', '知乎媒体云未接受该图片，请检查图片格式、大小、账号授权和额度。');
  }
  const original = publicUrl(value.media_url?.primary);
  const watermarked = publicUrl(value.extra?.watermark_image_url?.primary);
  if (!original && !watermarked) throw new PlatformError('failed', '知乎媒体工具没有返回可用的图片地址。');
  return { original, watermarked, width: value.media_meta?.width, height: value.media_meta?.height };
}

function embedImage(image) {
  const url = image.original || image.watermarked;
  const attrs = {
    src: url, 'data-caption': '', 'data-size': image.width && image.width < 343 ? 'small' : 'normal',
    'data-original-src': url, 'data-watermark-src': image.watermarked || ''
  };
  if (Number.isInteger(image.width) && Number.isInteger(image.height)) {
    attrs['data-rawwidth'] = image.width;
    attrs['data-rawheight'] = image.height;
  }
  return '<img ' + Object.entries(attrs).map(([key, val]) => `${key}="${escapeHtml(val)}"`).join(' ') + ' />';
}

async function uploadImages(ctx, paths, scene) {
  if (!paths.length) return [];
  for (const filePath of paths) {
    let info;
    if (typeof filePath === 'string' && isAbsolute(filePath)) {
      try { info = await stat(filePath); } catch {}
    }
    requireInput(info?.isFile() && info.size > 0, '请选择可读取的知乎本地图片。');
  }
  const client = await (ctx.createMediaClient || connectUploader)(ctx.credentials);
  try {
    const images = [];
    for (const filePath of paths) {
      const result = await client.callTool({ name: 'upload_image', arguments: { scene_name: scene, file_path: filePath } }, undefined, { timeout: 300_000 });
      images.push(imageResult(result));
    }
    return images;
  } catch (e) {
    if (e instanceof PlatformError) throw e;
    throw new PlatformError('needs_action', '知乎官方媒体工具未完成上传，请检查安装、网络和图片授权。');
  } finally {
    await client.close().catch(() => {});
  }
}

export async function sendZhihu(ctx) {
  const { content, credentials } = ctx;
  const article = content.type === 'article';
  requireInput((article || content.type === 'pin') && !content.video, '知乎官方通道支持文章和想法，请移除视频后提交。');
  requireInput(credentials.appKey && credentials.appSecret, '请在知乎同步助手取得该账号的定向 OpenAPI App Key 和 App Secret。');
  requireInput(content.body?.trim() && (!article || content.title?.trim()), '知乎要求非空正文，文章还须填写标题。');
  const title = content.title || '';
  const bodyLength = [...content.body.trim()].length;
  requireInput(!/[\r\n]/.test(title) && [...title].length <= (article ? 100 : 50), article ? '知乎文章标题须在一行内且最多 100 字。' : '知乎想法标题须在一行内且最多 50 字。');
  if (article) requireInput(bodyLength >= 9 && bodyLength <= 100000, '知乎文章正文须为 9 至 100000 字。');
  const paths = content.images || [];
  requireInput(article || (paths.length <= 18 && bodyLength <= 2000), '知乎想法正文限 2000 字，独立配图最多 18 张。');
  const comment = content.zhihuComment || 'all';
  const comments = ['all', 'nobody', 'followee', 'censor', article ? 'follower' : 'follower_n_days'];
  requireInput(comments.includes(comment), '请为当前知乎作品选择有效的评论权限。');
  const statement = content.zhihuStatement;
  requireInput(!statement || (article ? articleStatements : ['ai_creation']).includes(statement), '当前知乎作品不支持所选创作声明。');
  const images = await uploadImages(ctx, paths, content.type);
  const fields = { html: paragraphs(content.body), comment_permission: comment };
  if (content.title?.trim()) fields.title = content.title;
  if (statement) fields.creation_statement = statement;
  if (article) {
    fields.table_of_contents_enabled = content.zhihuToc === true;
    fields.html += images.map(embedImage).join('');
  } else if (images.length) {
    fields.images = images.map(image => ({ url: image.watermarked || image.original }));
  }
  const ts = String(Math.floor(Date.now() / 1000));
  const logId = randomUUID();
  const message = `app_key:${credentials.appKey}|ts:${ts}|logid:${logId}|extra_info:`;
  const headers = {
    'content-type': 'application/json', 'x-app-key': credentials.appKey, 'x-timestamp': ts, 'x-log-id': logId,
    'x-extra-info': '', 'x-sign': createHmac('sha256', credentials.appSecret).update(message).digest('base64')
  };
  const body = JSON.stringify({ type: content.type, confirmed: true, confirm_note: 'confirmed by user after local preview', content: fields });
  const value = await request(ctx, '知乎提交发布', 'https://openapi.zhihu.com/openapi/publish', { method: 'POST', headers, body }, true);
  if (!expectCode(value.status, 0, '知乎提交发布', true)) apiError('知乎提交发布', value.status, '请检查该创作者的定向发布资格、素材要求及当日额度。');
  const id = requiredId(value.data?.content_token, '知乎提交发布', true);
  const url = publicUrl(value.data?.url);
  if (value.data?.type !== content.type || !url || !/(^|\.)zhihu\.com$/i.test(new URL(url).hostname)) {
    return { status: 'unknown', kind: 'zhihu-content', remoteId: id, detail: '知乎回包的内容类型或作品链接无法核对，请在个人主页确认。' };
  }
  return { status: 'published', kind: 'zhihu-content', remoteId: id, url, detail: '知乎发布接口已返回成功、作品编号和链接。' };
}

export async function checkZhihu(_ctx, receipt) {
  requireInput(receipt.kind === 'zhihu-content', '缺少知乎官方发布回执。');
  return { ...receipt, checkStatus: 'receipt_only', detail: '此处显示知乎提交时的官方回执，作品当前状态可在回执链接中核对。' };
}
