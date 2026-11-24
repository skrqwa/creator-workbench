import { modesFor } from '../desktop/catalog.mjs'

// 编辑中的路径相对工程目录；正式核对仍由 publish.preview 检查磁盘文件及保存版本。
export function getPlatformContent(project, platform) {
  const variant = project.variants?.[platform.id] || {}
  const outputs = project.exports || {}
  const type = variant.type || platform.types[0]
  const article = type === 'article' || type === 'pin'
  const full = variant.videoVersion ? variant.videoVersion === 'full' : platform.id === 'bilibili'
  const defaults = article && outputs.articleImages?.length ? outputs.articleImages : outputs.cards
  const pictures = Array.isArray(variant.images) && variant.images.length ? variant.images : defaults || []
  const cover = variant.cover || outputs.cover || pictures[0] || ''
  let images = type === 'video' ? [] : pictures
  if (type === 'cards' && variant.cover) images = [cover, ...images.filter((path) => path !== cover)]
  const scenes = project.scenes
  const body =
    variant.body ||
    (article
      ? [project.intro, ...scenes.map((scene) => scene.notes || scene.text)]
      : scenes.map((scene) => scene.text)
    )
      .filter(Boolean)
      .join('\n\n')
  return {
    ...variant,
    type,
    title: variant.title || project.name || '',
    body,
    cover,
    video:
      type === 'video'
        ? variant.video || (full ? outputs.video : outputs.shortVideo) || outputs.video || ''
        : '',
    images,
  }
}

export function getPlatformReadiness(
  project,
  platform,
  accounts,
  content = getPlatformContent(project, platform),
) {
  const targets = accounts.filter((account) => account.platform === platform.id)
  const accountReady = targets.some((account) => {
    if (!modesFor(account, content.type).includes('review')) return false
    // 公众号的接口复核也会写入草稿箱，必须先配置本账号的凭据。
    return (
      account.channel !== 'api' ||
      platform.id !== 'wechat' ||
      ['appId', 'appSecret'].every((key) => account.credentialKeys?.includes(key))
    )
  })
  const checks = [
    { ok: !!content.title.trim(), yes: '标题已填写', no: '待填标题' },
    { ok: !!content.body.trim(), yes: '正文已填写', no: '待填正文' },
    { ok: !!content.cover, yes: '封面已选', no: '待选封面' },
  ]
  if (content.type === 'video') checks.push({ ok: !!content.video, yes: '成片已选', no: '待选成片' })
  if (content.type === 'cards')
    checks.push({ ok: content.images.length > 0, yes: '图集已选', no: '待选图集' })
  checks.push({ ok: accountReady, yes: '账号已配置', no: targets.length ? '待配账号' : '待绑账号' })
  const missing = checks.find((item) => !item.ok)
  const label = !targets.length ? '待绑账号' : !accountReady ? '待配账号' : missing?.no || '就绪'
  return { ready: !missing, label, checks }
}
