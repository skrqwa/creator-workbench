import { MiB, PlatformError, apiError, endpoint, escapeHtml, fileForm, jsonPost, localFile, paragraphs, publicUrl, request, requiredId, requireInput } from './common.mjs';

const api = 'https://api.weixin.qq.com/cgi-bin/';
const images = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];
const hints = {
  40001: '请核对所选公众号的 AppID、AppSecret 或重新获取授权。',
  40125: '请核对所选公众号的 AppSecret。',
  40164: '请在微信公众平台将本机的公网出口 IP 加入接口白名单。',
  40007: '该素材或草稿已失效，请在公众平台核对。',
  42001: '调用凭据已过期，请重新获取授权。',
  48001: '该公众号没有此接口权限，请到公众平台查看接口权限。',
  53503: '草稿未通过微信发布检查，请到草稿箱修改。',
  53504: '微信要求到公众平台官网使用该草稿。',
  53505: '微信要求先在公众平台手动保存草稿再发表。'
};

async function call(ctx, token, path, options, step, params = {}, committed = false) {
  const url = endpoint(api + path, token ? { access_token: token, ...params } : params);
  const value = await request(ctx, step, url, options, committed);
  if (value.errcode !== undefined && value.errcode !== 0) {
    if (committed && value.errcode === -1) apiError(step, value.errcode, '微信返回系统繁忙，请先核对公众平台的提交记录。', 'unknown');
    apiError(step, value.errcode, hints[value.errcode] || '请检查账号授权、素材和微信接口额度。');
  }
  return value;
}

async function tokenFor(ctx) {
  const { appId, appSecret } = ctx.credentials;
  requireInput(appId && appSecret, '请配置所选公众号的 AppID、AppSecret，并在公众平台设置出口 IP 白名单。');
  const value = await call(ctx, null, 'stable_token', jsonPost({
    grant_type: 'client_credential', appid: appId, secret: appSecret, force_refresh: false
  }), '获取微信调用凭据');
  return requiredId(value.access_token, '获取微信调用凭据');
}

async function makeDraft(ctx, token, content) {
  const isCards = content.type === 'cards';
  const paths = content.images || [];
  const article = { title: content.title, article_type: isCards ? 'newspic' : 'news' };
  const permanent = async file => {
    const value = await call(ctx, token, 'material/add_material', { method: 'POST', body: fileForm('media', file) }, '上传微信永久图片', { type: 'image' });
    return requiredId(value.media_id, '上传微信永久图片');
  };
  if (isCards) {
    requireInput(paths.length > 0 && paths.length <= 20, '微信图片消息需要 1 至 20 张图片，首张用作封面。');
    const files = await Promise.all(paths.map(p => localFile(p, '图卡', { types: images, maxBytes: 10 * MiB })));
    article.image_info = { image_list: [] };
    article.content = content.body || '';
    for (const file of files) article.image_info.image_list.push({ image_media_id: await permanent(file) });
  } else {
    requireInput(content.body?.trim() || paths.length > 0, '请填写微信图文正文或选择正文图片。');
    const cover = await localFile(content.cover || paths[0], '微信图文封面', { types: images, maxBytes: 10 * MiB });
    const files = await Promise.all(paths.map(p => localFile(p, '微信正文图片', { types: ['image/png', 'image/jpeg'], maxBytes: MiB - 1 })));
    const fragments = [paragraphs(content.body)];
    article.thumb_media_id = await permanent(cover);
    for (const file of files) {
      const value = await call(ctx, token, 'media/uploadimg', { method: 'POST', body: fileForm('media', file) }, '上传微信正文图片');
      const imageUrl = publicUrl(value.url);
      if (!imageUrl) throw new PlatformError('failed', '微信没有返回可用的正文图片地址。');
      fragments.push(`<p><img src="${escapeHtml(imageUrl)}" /></p>`);
    }
    article.content = fragments.join('');
    requireInput([...article.content].length < 20000 && Buffer.byteLength(article.content) < MiB, '微信图文正文须少于 2 万字符且小于 1 MiB。');
  }
  const result = await call(ctx, token, 'draft/add', jsonPost({ articles: [article] }), '创建微信远端草稿', {}, true);
  return requiredId(result.media_id, '创建微信远端草稿', true);
}

export async function sendWechat(ctx) {
  const { content, receipt } = ctx;
  requireInput(['article', 'cards'].includes(content.type), '公众号官方接口支持文章和图卡。');
  requireInput(content.title?.trim() && [...content.title].length <= 32, '微信标题须填写，且最多 32 个字。');
  const token = await tokenFor(ctx);
  const draftId = receipt?.kind === 'wechat-draft' ? requiredId(receipt.remoteId, '微信草稿') : await makeDraft(ctx, token, content);
  const draft = { kind: 'wechat-draft', draftId, remoteId: draftId };
  if (ctx.mode === 'review') return { ...draft, status: 'draft', detail: '微信已保存草稿，可在该公众号的草稿箱预览和修改。' };
  try {
    const value = await call(ctx, token, 'freepublish/submit', jsonPost({ media_id: draftId }), '微信提交发布', {}, true);
    if (value.errcode !== 0) throw new PlatformError('unknown', '微信未返回发布提交成功码，请到公众平台核对原草稿。');
    const id = requiredId(value.publish_id, '微信提交发布', true);
    return { kind: 'wechat-publish', draftId, remoteId: id, status: 'submitted', detail: '微信已受理发布任务，可用任务编号查询结果。' };
  } catch (e) {
    if (!(e instanceof PlatformError)) throw e;
    if (e.status === 'unknown') return { ...draft, kind: 'wechat-submit-unknown', status: 'unknown', detail: e.message };
    return { ...draft, status: 'draft', detail: `${e.message} 原草稿已保留，可登录公众平台处理。` };
  }
}

export async function checkWechat(ctx, receipt) {
  if (receipt.kind === 'wechat-submit-unknown') {
    return { ...receipt, status: 'unknown', detail: '微信未返回发布任务编号，请用已有草稿在公众平台核对发布记录。' };
  }
  const token = await tokenFor(ctx);
  if (receipt.kind === 'wechat-draft') {
    const value = await call(ctx, token, 'draft/get', jsonPost({ media_id: receipt.remoteId }), '查询微信草稿');
    if (!value.news_item?.length) throw new PlatformError('unknown', '微信未返回该草稿的内容。');
    return { ...receipt, status: 'draft', url: publicUrl(value.news_item[0].url), detail: '微信已回查到远端草稿。' };
  }
  requireInput(receipt.kind === 'wechat-publish', '此回执缺少可查询的微信发布任务类型。');
  const value = await call(ctx, token, 'freepublish/get', jsonPost({ publish_id: receipt.remoteId }), '查询微信发布状态');
  if (String(value.publish_id) !== receipt.remoteId) throw new PlatformError('unknown', '微信返回的发布任务编号与原回执不一致。');
  const status = value.publish_status;
  const details = ['微信已发布。', '微信正在处理发布任务。', '微信原创校验未通过。', '微信发布失败。', '微信平台审核未通过。', '发布后用户已删除全部文章。', '发布后微信已封禁全部文章。'];
  const state = Number.isInteger(status) && ({ 0: 'published', 1: 'reviewing', 2: 'failed', 3: 'failed', 4: 'failed', 5: 'failed', 6: 'failed' })[status];
  const result = { ...receipt, status: state || 'unknown', url: state === 'published' ? publicUrl(value.article_detail?.item?.[0]?.article_url) : undefined, detail: state ? details[status] : '微信返回了未识别的发布状态。' };
  if (status === 5 || status === 6) result.withdrawn = true;
  else delete result.withdrawn;
  return result;
}
