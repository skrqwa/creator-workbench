import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import https from 'node:https';
import { Readable } from 'node:stream';

export const MiB = 1024 * 1024;

export class PlatformError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

export function requireInput(ok, message) {
  if (!ok) throw new PlatformError('needs_action', message);
}

export function requiredId(value, step, committed = false) {
  if ((typeof value === 'string' && value.trim()) || (Number.isSafeInteger(value) && value > 0)) {
    return String(value);
  }
  throw new PlatformError(committed ? 'unknown' : 'failed', `${step}未返回有效编号。${committed ? '请先到创作者后台核对。' : ''}`);
}

export function endpoint(base, params = {}) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export function jsonPost(data) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
}

// 专栏详情文档指定 GET 携带 multipart 请求体，Fetch 标准禁止这种组合。
// 仅该平台地址使用原生 HTTPS，表单边界和长度来自同一次实际编码。
export async function officialFetch(url, options) {
  if (options.method !== 'GET' || !(options.body instanceof FormData)) return fetch(url, options);
  if (new URL(url).href !== 'https://member.bilibili.com/arcopen/fn/article/detail') {
    throw new Error('未识别的 GET 表单接口');
  }
  const form = new Response(options.body);
  const bytes = Buffer.from(await form.arrayBuffer());
  const headers = new Headers(options.headers);
  headers.set('content-type', form.headers.get('content-type'));
  headers.set('content-length', String(bytes.byteLength));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers: Object.fromEntries(headers), signal: options.signal }, res => {
      if ([204, 205, 304].includes(res.statusCode)) {
        res.resume();
        resolve(new Response(null, { status: res.statusCode }));
      } else {
        resolve(new Response(Readable.toWeb(res), { status: res.statusCode }));
      }
    });
    req.on('error', reject);
    req.end(bytes);
  });
}

// 发布请求一旦发出，断线、网关错误和不完整回包都不能证明平台没有收到稿件。
export async function request(ctx, step, url, options = {}, committed = false) {
  let response;
  let data;
  const uncertain = committed ? 'unknown' : 'failed';
  try {
    response = await ctx.fetchImpl(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(15 * 60 * 1000)
    });
    if (response.ok) {
      data = JSON.parse(await response.text(), (_key, value, source) => {
        if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
          return source.source;
        }
        return value;
      });
    }
  } catch {
    throw new PlatformError(uncertain, `${step}未取得完整回包。${committed ? '请先在创作者后台核对，避免重复提交。' : '请检查网络和素材后重试。'}`);
  }
  if (!response.ok) {
    const denied = [401, 403, 429].includes(response.status);
    await response.body?.cancel().catch(() => {});
    const status = denied ? 'needs_action' : response.status >= 500 || [408, 409].includes(response.status) ? uncertain : 'failed';
    throw new PlatformError(status, `${step}返回 HTTP ${response.status}。${denied ? '请检查该账号的接口授权、有效期和额度。' : status === 'unknown' ? '请先到创作者后台核对。' : ''}`);
  }
  if (!data || typeof data !== 'object') throw new PlatformError(uncertain, `${step}返回了无法判读的数据。`);
  return data;
}

export function apiError(step, code, hint, status = 'needs_action') {
  const printed = typeof code === 'number' && Number.isSafeInteger(code) ? String(code) : '未提供错误码';
  throw new PlatformError(status, `${step}（${printed}）。${hint}`);
}

export function expectCode(value, success, step, committed = false) {
  if (!Number.isSafeInteger(value)) {
    throw new PlatformError(committed ? 'unknown' : 'failed', `${step}的业务回包缺少状态码，请核对平台后台。`);
  }
  return value === success;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function paragraphs(body) {
  return String(body ?? '').replace(/\r\n?/g, '\n').split('\n').map(line => line ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>').join('');
}

export function caption(content) {
  return [content.title, content.body].filter(Boolean).join('\n');
}

export function publicUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return value;
  } catch {}
  return undefined;
}

const mime = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska'
};

export async function localFile(filePath, label, { maxBytes, types } = {}) {
  requireInput(typeof filePath === 'string' && isAbsolute(filePath), `请选择${label}的本地文件。`);
  let info;
  try { info = await stat(filePath); } catch {}
  requireInput(info?.isFile() && info.size > 0, `${label}不存在、为空或不可读。`);
  requireInput(!maxBytes || info.size <= maxBytes, `${label}超过平台上限（${Math.round(maxBytes / MiB)} MiB）。`);
  const type = mime[extname(filePath).toLowerCase()] || 'application/octet-stream';
  requireInput(!types || types.includes(type), `${label}格式应为 ${types?.join('、')}。`);
  return { path: filePath, name: basename(filePath), blob: await openAsBlob(filePath, { type }) };
}

export function fileForm(field, file, blob = file.blob) {
  const form = new FormData();
  form.append(field, blob, file.name);
  return form;
}
