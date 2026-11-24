import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { PlatformError, officialFetch, requireInput } from './common.mjs';
import { checkWechat, sendWechat } from './wechat.mjs';
import { checkBilibili, sendBilibili } from './bilibili.mjs';
import { checkKuaishou, sendKuaishou } from './kuaishou.mjs';
import { checkZhihu, sendZhihu } from './zhihu.mjs';
import { checkDouyin, sendDouyin } from './douyin.mjs';

export const providerFields = {
  wechat: [
    { key: 'appId', label: '该公众号的 AppID' }, { key: 'appSecret', label: '该公众号的 AppSecret', secret: true }
  ],
  bilibili: [
    { key: 'clientId', label: '开放平台 Client ID' }, { key: 'clientSecret', label: '应用 App Secret', secret: true },
    { key: 'openId', label: '目标用户 OpenID' }, { key: 'accessToken', label: '用户 Access Token', secret: true },
    { key: 'biliTid', label: '默认视频分区 ID（可选）' }, { key: 'biliTag', label: '默认视频标签（可选）' },
    { key: 'biliCopyright', label: '默认版权（可选，1 原创、2 转载）' }, { key: 'biliSource', label: '默认转载来源（可选）' },
    { key: 'biliCategory', label: '默认专栏子分类 ID（可选）' }
  ],
  kuaishou: [
    { key: 'appId', label: '快手开放平台 App ID' }, { key: 'openId', label: '目标用户 OpenID' },
    { key: 'oauthGrant', label: '同一用户的 OAuth 回包 JSON（含 open_id、access_token）', secret: true },
    { key: 'uploadProtocol', label: '文件网关协议（默认 HTTPS）', hint: '快手文档示例使用 HTTP。选择 HTTP 时，视频和临时上传令牌将以明文传输。' }
  ],
  zhihu: [
    { key: 'appKey', label: '目标知乎账号 App Key（主页 URLToken）' }, { key: 'appSecret', label: '知乎定向 OpenAPI App Secret', secret: true }
  ],
  douyin: [
    { key: 'openId', label: '目标抖音账号 OpenID' }, { key: 'accessToken', label: '该用户的 Access Token', secret: true }
  ]
};

const adapters = new Map([
  ['wechat', { send: sendWechat, check: checkWechat, types: ['article', 'cards'], identity: ['appId'] }],
  ['bilibili', { send: sendBilibili, check: checkBilibili, types: ['video', 'article'], identity: ['clientId', 'openId'] }],
  ['kuaishou', { send: sendKuaishou, check: checkKuaishou, types: ['video'], identity: ['appId', 'openId'] }],
  ['zhihu', { send: sendZhihu, check: checkZhihu, types: ['article', 'pin'], identity: ['appKey'] }],
  ['douyin', { send: sendDouyin, check: checkDouyin, types: ['video'], identity: ['openId'] }]
]);

function context(options) {
  const adapter = adapters.get(options.platform);
  requireInput(adapter, '该平台没有接入官方发布接口，请使用创作者网页。');
  const credentials = options.credentials || {};
  const identity = adapter.identity.map(k => credentials[k]);
  const accountKey = identity.every(v => typeof v === 'string' && v.trim())
    ? createHash('sha256').update(JSON.stringify([options.platform, ...identity])).digest('hex') : null;
  return { ...options, adapter, credentials, accountKey, fetchImpl: options.fetchImpl || officialFetch };
}

function errorResult(e) {
  return e instanceof PlatformError ? { status: e.status, detail: e.message }
    : { status: 'failed', detail: '官方渠道无法准备本次请求，请检查账号设置、素材和运行依赖。' };
}

async function draftKey(content) {
  const paths = [content.cover, ...(content.images || [])].filter(Boolean);
  const files = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    files.push([path, info?.size, info?.mtimeMs]);
  }
  return createHash('sha256').update(JSON.stringify([content.type, content.title, content.body, files])).digest('hex');
}

export async function sendOfficial(options) {
  let ctx;
  try {
    ctx = context(options);
    requireInput(['review', 'submit'].includes(ctx.mode), '未知的提交方式。');
    requireInput(ctx.adapter.types.includes(ctx.content?.type), '该平台的官方渠道不接受当前内容类型。');
    if (ctx.mode === 'review' && ctx.platform !== 'wechat') {
      return { status: 'needs_action', detail: '稿件已准备本地预览。该接口没有远端草稿箱，请核对目标账号与内容后提交。' };
    }
    const fingerprint = ctx.platform === 'wechat' ? await draftKey(ctx.content) : undefined;
    if (ctx.receipt) {
      requireInput(ctx.platform === 'wechat' && ctx.receipt.kind === 'wechat-draft' && ctx.receipt.status === 'draft'
        && ctx.accountKey && ctx.receipt.accountKey === ctx.accountKey && ctx.receipt.draftKey === fingerprint,
      '原回执的账号、稿件或状态与本次提交不匹配，请先核对原记录。');
    }
    const result = await ctx.adapter.send(ctx);
    return { ...result, ...(ctx.accountKey && { accountKey: ctx.accountKey }), ...(fingerprint && { draftKey: fingerprint }) };
  } catch (e) {
    return { ...errorResult(e), ...(ctx?.accountKey && { accountKey: ctx.accountKey }) };
  }
}

export async function checkOfficial(options) {
  const { receipt } = options;
  try {
    const ctx = context(options);
    requireInput(receipt?.remoteId && ctx.accountKey && receipt.accountKey === ctx.accountKey, '回执缺少作品编号，或与所选账号不匹配，请在原账号核对。');
    return await ctx.adapter.check(ctx, receipt);
  } catch (e) {
    // 查询请求失败不能推翻上一次平台回执，更不能解除稿件去重保护。
    const issue = errorResult(e);
    const status = ['draft', 'submitted', 'reviewing', 'published', 'unknown'].includes(receipt?.status) ? receipt.status : issue.status;
    return { ...receipt, status, checkStatus: issue.status, detail: issue.detail };
  }
}
