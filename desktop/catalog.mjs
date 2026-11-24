export const platforms = [
  { id: 'douyin', label: '抖音', types: ['video', 'cards'], channels: ['browser', 'plugin', 'api'], creator: 'https://creator.douyin.com/creator-micro/content/upload', hosts: ['creator.douyin.com'], publicHosts: ['douyin.com'] },
  { id: 'xiaohongshu', label: '小红书', types: ['cards', 'video'], channels: ['browser', 'plugin'], creator: 'https://creator.xiaohongshu.com/publish/publish', hosts: ['creator.xiaohongshu.com'], publicHosts: ['xiaohongshu.com', 'xhslink.com'] },
  { id: 'bilibili', label: 'B站', types: ['video', 'article'], channels: ['browser', 'api'], creator: 'https://member.bilibili.com/platform/upload/video/frame', article: 'https://member.bilibili.com/platform/upload/text/edit', hosts: ['member.bilibili.com'], publicHosts: ['bilibili.com', 'b23.tv'] },
  { id: 'channels', label: '微信视频号', types: ['video'], channels: ['browser', 'plugin'], creator: 'https://channels.weixin.qq.com/platform/post/create', hosts: ['channels.weixin.qq.com'], publicHosts: ['weixin.qq.com'] },
  { id: 'wechat', label: '微信公众号', types: ['article'], channels: ['browser', 'api'], creator: 'https://mp.weixin.qq.com/', hosts: ['mp.weixin.qq.com'], publicHosts: ['mp.weixin.qq.com'] },
  { id: 'kuaishou', label: '快手', types: ['video'], channels: ['browser', 'api'], creator: 'https://cp.kuaishou.com/article/publish/video', hosts: ['cp.kuaishou.com'], publicHosts: ['kuaishou.com'] },
  { id: 'toutiao', label: '今日头条', types: ['article', 'video'], channels: ['browser'], creator: 'https://mp.toutiao.com/profile_v4/xigua/upload-video', article: 'https://mp.toutiao.com/profile_v4/graphic/publish', hosts: ['mp.toutiao.com'], publicHosts: ['toutiao.com'] },
  { id: 'zhihu', label: '知乎', types: ['article', 'pin'], channels: ['browser', 'api'], creator: 'https://zhuanlan.zhihu.com/write', pin: 'https://www.zhihu.com/pin/write', hosts: ['zhuanlan.zhihu.com', 'www.zhihu.com'], publicHosts: ['zhihu.com'] }
];

export const platformById = Object.fromEntries(platforms.map(item => [item.id, item]));

export function creatorUrl(platform, type) {
  const p = platformById[platform];
  if (!p || !p.types.includes(type)) throw new Error('该平台尚未适配此作品类型');
  if (platform === 'xiaohongshu') return p.creator + (type === 'cards' ? '?target=image' : '?target=video');
  return p[type] || p.creator;
}

export function modesFor(account, type) {
  const p = platformById[account.platform];
  if (!p?.types.includes(type) || !p.channels.includes(account.channel)) return [];
  const modes = ['review'];
  if (!account.capabilities?.includes('submit') || p.id==='wechat' && account.subject!=='institution') return modes;
  if (account.channel === 'plugin' || (account.channel === 'browser' && account.platform === 'toutiao' && type === 'article')
      || (account.channel === 'api' && (account.platform !== 'douyin' || type === 'video'))) modes.push('submit');
  return modes;
}

export function publicUrl(platform, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return platformById[platform]?.publicHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) ? url.href : '';
  } catch { return ''; }
}
