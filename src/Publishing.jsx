import React, { useEffect, useState } from 'react'
import {
  BookOpen,
  Eye,
  FileImage,
  FileText,
  Film,
  Images,
  Layers,
  MessageCircle,
  Music2,
  Newspaper,
  Plus,
  Radio,
  Send,
  Settings2,
  Share2,
  Tv,
  Users,
  Video,
  X,
} from 'lucide-react'
import { modesFor } from '../desktop/catalog.mjs'
import {
  asset,
  Button,
  call,
  channelLabels,
  Empty,
  ErrorLine,
  Field,
  fileName,
  IconButton,
  Modal,
  modeLabels,
  typeLabels,
} from './shared'

const platformIcons = {
  douyin: Music2,
  xiaohongshu: BookOpen,
  bilibili: Tv,
  channels: Radio,
  wechat: MessageCircle,
  kuaishou: Video,
  toutiao: Newspaper,
  zhihu: FileText,
}
export function PlatformMark({ id }) {
  const Icon = platformIcons[id] || Share2
  return (
    <span aria-hidden="true" className={`platform-mark platform-${id}`}>
      <Icon size={17} strokeWidth={1.9} />
    </span>
  )
}

function formContent(project, platform) {
  const variant = project.variants?.[platform.id] || {}
  const exports = project.exports || {}
  const type = variant.type || platform.types[0]
  const paragraphs = ['article', 'pin'].includes(type)
    ? [project.intro, ...project.scenes.map((s) => s.notes || s.text)]
    : project.scenes.map((s) => s.text)
  return {
    ...variant,
    type,
    title: variant.title || project.name,
    body: variant.body || paragraphs.filter(Boolean).join('\n\n'),
    cover: variant.cover || exports.cover || exports.cards?.[0] || '',
    video:
      variant.video ||
      (variant.videoVersion === 'full'
        ? exports.video
        : variant.videoVersion === 'short'
          ? exports.shortVideo
          : platform.id === 'bilibili'
            ? exports.video
            : exports.shortVideo) ||
      exports.video ||
      '',
    images: variant.images?.length
      ? variant.images
      : (['article', 'pin'].includes(type) ? exports.articleImages || exports.cards : exports.cards) || [],
  }
}

export function ContentPreview({ content, platform, compact = false }) {
  return (
    <article className={`content-preview ${compact ? 'compact-preview' : ''}`}>
      <div className="preview-publisher">
        <PlatformMark id={platform.id} />
        <strong>{platform.label}</strong>
        <span>{typeLabels[content.type] || content.type}</span>
      </div>
      {content.type === 'video' && content.video ? (
        <video
          key={content.video}
          controls
          playsInline
          preload="metadata"
          src={asset(content.video)}
          poster={asset(content.cover)}
          aria-label="待发布视频"
        />
      ) : content.cover || content.images?.[0] ? (
        <img className="variant-cover" src={asset(content.cover || content.images[0])} alt="待发布封面" />
      ) : null}
      <h3>{content.title || '未填写标题'}</h3>
      <p className="preview-body">{content.body || '未填写正文'}</p>
      {content.images?.length > 0 && content.type !== 'video' && (
        <div className="preview-gallery">
          {content.images.map((image, i) => (
            <img key={`${image}-${i}`} src={asset(image)} alt={`配图 ${i + 1}`} />
          ))}
        </div>
      )}
    </article>
  )
}

function PlatformOptions({ id, content, update }) {
  if (id !== 'bilibili' && id !== 'zhihu') return null
  if (id === 'bilibili')
    return (
      <details className="detail-row extra-options">
        <summary>B站投稿选项</summary>
        <div className="stack">
          {content.type === 'video' ? (
            <>
              <Field label="视频分区 ID">
                <input
                  inputMode="numeric"
                  value={content.biliTid || ''}
                  placeholder="平台分区 ID"
                  onChange={(e) => update({ biliTid: e.target.value })}
                />
              </Field>
              <Field label="投稿标签">
                <input
                  value={content.biliTag || ''}
                  placeholder="多个标签用逗号分隔"
                  onChange={(e) => update({ biliTag: e.target.value })}
                />
              </Field>
              <Field label="稿件类型">
                <select
                  value={content.biliCopyright || '1'}
                  onChange={(e) => update({ biliCopyright: e.target.value })}
                >
                  <option value="1">自制</option>
                  <option value="2">转载</option>
                </select>
              </Field>
              {String(content.biliCopyright) === '2' && (
                <Field label="转载来源">
                  <input
                    value={content.biliSource || ''}
                    onChange={(e) => update({ biliSource: e.target.value })}
                  />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="专栏子分类 ID">
                <input
                  value={content.biliCategory || ''}
                  inputMode="numeric"
                  onChange={(e) => update({ biliCategory: e.target.value })}
                />
              </Field>
              <Field label="专栏摘要">
                <textarea
                  rows={4}
                  value={content.biliSummary || ''}
                  placeholder="至少 200 字，可由正文生成"
                  onChange={(e) => update({ biliSummary: e.target.value })}
                />
              </Field>
            </>
          )}
        </div>
      </details>
    )
  const comments = {
    all: '所有人',
    nobody: '关闭评论',
    followee: '我关注的人',
    censor: '评论需审核',
    ...(content.type === 'pin' ? { follower_n_days: '关注一定天数的用户' } : { follower: '关注我的人' }),
  }
  return (
    <details className="detail-row extra-options">
      <summary>知乎发布选项</summary>
      <div className="stack">
        <Field label="谁可以评论">
          <select
            value={content.zhihuComment || 'all'}
            onChange={(e) => update({ zhihuComment: e.target.value })}
          >
            {Object.entries(comments).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="创作声明">
          <select
            value={content.zhihuStatement || ''}
            onChange={(e) => update({ zhihuStatement: e.target.value })}
          >
            <option value="">无附加声明</option>
            <option value="ai_creation">含 AI 创作内容</option>
            {content.type === 'article' && (
              <>
                <option value="spoiler">包含剧透</option>
                <option value="medical_advice">包含医学建议</option>
                <option value="fictional_creation">虚构创作</option>
                <option value="contain_finance">包含金融内容</option>
              </>
            )}
          </select>
        </Field>
        {content.type === 'article' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={Boolean(content.zhihuToc)}
              onChange={(e) => update({ zhihuToc: e.target.checked })}
            />
            生成文章目录
          </label>
        )}
      </div>
    </details>
  )
}

function VariantEditor({ project, platforms, platform, setPlatform, changeVariant, run, openSelection }) {
  const content = formContent(project, platform)
  const variant = project.variants?.[platform.id] || {}
  function update(patch) {
    changeVariant(platform.id, patch)
  }
  function choose(type, key) {
    run('正在导入平台素材', async () => {
      const result = await call('project.import', { type })
      if (result?.paths?.length)
        update({
          [key]: key === 'images' ? result.paths : result.paths[0],
          ...(key === 'video' ? { videoVersion: '' } : {}),
        })
    })
  }
  function setType(value) {
    const patch = { type: value }
    if (platform.id === 'zhihu') {
      if (value === 'pin' && !['ai_creation', ''].includes(variant.zhihuStatement || ''))
        patch.zhihuStatement = ''
      if (['follower', 'follower_n_days'].includes(variant.zhihuComment))
        patch.zhihuComment = value === 'pin' ? 'follower_n_days' : 'follower'
    }
    update(patch)
  }
  return (
    <>
      <div className="platform-tabs" role="group" aria-label="选择编辑的平台">
        {platforms.map((p) => (
          <button
            type="button"
            key={p.id}
            aria-pressed={p.id === platform.id}
            onClick={() => setPlatform(p.id)}
          >
            <PlatformMark id={p.id} />
            {p.label}
          </button>
        ))}
      </div>
      <div className="utility-grid variant-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>
              <Settings2 />
              {platform.label}稿件
            </h2>
            <span className="quiet-label">
              {project.variants?.[platform.id] ? '平台独立设置' : '沿用项目内容'}
            </span>
          </div>
          <div className="padded stack">
            <Field label="作品类型">
              <select value={content.type} onChange={(e) => setType(e.target.value)}>
                {platform.types.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type] || type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="平台标题">
              <input
                key={platform.id + '-title-' + project.revision}
                defaultValue={content.title}
                placeholder={project.name}
                onChange={(e) => update({ title: e.target.value })}
              />
            </Field>
            <Field label="平台正文">
              <textarea
                key={platform.id + '-body-' + content.type + project.revision}
                rows={5}
                defaultValue={content.body}
                placeholder="输入这个平台的正文"
                onChange={(e) => update({ body: e.target.value })}
              />
            </Field>
            <div className="variant-asset">
              <span>
                <FileImage size={16} />
                <strong>封面</strong>
                <small>{fileName(content.cover) || '尚未选择'}</small>
              </span>
              <div>
                <button type="button" className="text-btn" onClick={() => choose('image', 'cover')}>
                  选择图片
                </button>
                {variant.cover && (
                  <IconButton icon={X} label="恢复项目封面" onClick={() => update({ cover: '' })} />
                )}
              </div>
            </div>
            {content.type === 'video' && (
              <div className="stack small-gap">
                <Field label="视频版本">
                  <select
                    value={variant.video ? 'file' : variant.videoVersion || ''}
                    onChange={(e) => {
                      if (e.target.value !== 'file') update({ video: '', videoVersion: e.target.value })
                    }}
                  >
                    <option value="">使用平台默认视频</option>
                    <option value="full">项目横屏完整版</option>
                    <option value="short">项目竖屏精简版</option>
                    {variant.video && <option value="file">{fileName(variant.video)}</option>}
                  </select>
                </Field>
                <div className="variant-asset">
                  <span>
                    <Film size={16} />
                    <small>{fileName(content.video) || '请导出作品或导入视频'}</small>
                  </span>
                  <button type="button" className="text-btn" onClick={() => choose('video', 'video')}>
                    导入视频
                  </button>
                </div>
              </div>
            )}
            {content.type !== 'video' && (
              <div className="stack small-gap">
                <div className="variant-asset">
                  <span>
                    <Images size={16} />
                    <strong>配图</strong>
                    <small>{content.images.length} 张</small>
                  </span>
                  <div>
                    <button type="button" className="text-btn" onClick={() => choose('images', 'images')}>
                      选择图集
                    </button>
                    {variant.images?.length > 0 && (
                      <IconButton icon={X} label="恢复项目配图" onClick={() => update({ images: [] })} />
                    )}
                  </div>
                </div>
                {content.images.length > 0 && (
                  <ol className="asset-list">
                    {content.images.map((img, i) => (
                      <li key={`${img}-${i}`}>{fileName(img)}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <PlatformOptions id={platform.id} content={content} update={update} />
          </div>
        </section>
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <h2>
                <Eye />
                稿件预览
              </h2>
            </div>
            <ContentPreview platform={platform} content={content} />
          </section>
          <Button tone="primary" icon={Users} onClick={openSelection}>
            选择发布账号
          </Button>
        </div>
      </div>
    </>
  )
}

export function PublishPage({
  project,
  platforms,
  accounts,
  changeVariant,
  run,
  persist,
  publishGroups,
  openAccounts,
}) {
  const [tab, setTab] = useState('variants')
  const [platformId, setPlatform] = useState(platforms[0]?.id)
  const [selection, setSelection] = useState({})
  const [confirmation, setConfirmation] = useState(null)
  const platform = platforms.find((p) => p.id === platformId) || platforms[0]
  const selected = accounts.filter((a) => {
    const p = platforms.find((item) => item.id === a.platform)
    return p && selection[a.id] && modesFor(a, formContent(project, p).type).includes(selection[a.id])
  })
  const setAccount = (id, mode) => setSelection((prev) => ({ ...prev, [id]: mode }))
  function confirm() {
    run('正在核对待发布稿件', async () => {
      const saved = await persist()
      const previews = {}
      const errors = {}
      for (const target of new Set(selected.map((a) => a.platform))) {
        try {
          previews[target] = await call('publish.preview', { platform: target })
        } catch (error) {
          errors[target] = error.message || String(error)
        }
      }
      setConfirmation({
        targets: selected.map((a) => ({ account: a, mode: selection[a.id] })),
        previews,
        errors,
        revision: saved.revision,
      })
    })
  }
  const confirmedTargets =
    confirmation?.targets.filter((t) => !confirmation.errors[t.account.platform]) || []
  if (!platform)
    return (
      <Empty icon={Share2} title="没有可用的平台">
        请重新打开工作台后重试。
      </Empty>
    )
  return (
    <div>
      <div className="page-intro">
        <div className="page-mark">
          <Share2 size={18} />
        </div>
        <h1>多平台发布</h1>
        <p>{project.name}</p>
      </div>
      <div className="page-tabs" role="group" aria-label="发布流程">
        <button type="button" aria-pressed={tab === 'variants'} onClick={() => setTab('variants')}>
          <Layers size={16} />
          内容适配
        </button>
        <button type="button" aria-pressed={tab === 'accounts'} onClick={() => setTab('accounts')}>
          <Users size={16} />
          账号与提交
        </button>
      </div>
      {tab === 'variants' ? (
        <VariantEditor
          project={project}
          platforms={platforms}
          platform={platform}
          setPlatform={setPlatform}
          changeVariant={changeVariant}
          run={run}
          openSelection={() => setTab('accounts')}
        />
      ) : (
        <section className="panel">
          <div className="panel-header">
            <h2>
              <Users />
              目标账号 <span className="count">{selected.length}</span>
            </h2>
            <Button icon={Settings2} className="compact" onClick={openAccounts}>
              管理账号
            </Button>
          </div>
          {!accounts.length ? (
            <Empty
              icon={Users}
              title="还没有发布账号"
              action={
                <Button icon={Plus} tone="primary" onClick={openAccounts}>
                  添加账号
                </Button>
              }
            >
              连接平台账号后，即可为每个账号选择发布方式。
            </Empty>
          ) : (
            <>
              <div className="account-targets">
                {accounts.map((a) => {
                  const p = platforms.find((item) => item.id === a.platform)
                  if (!p) return null
                  const allowed = modesFor(a, formContent(project, p).type)
                  const mode = allowed.includes(selection[a.id]) ? selection[a.id] : ''
                  return (
                    <div className="target-row" key={a.id}>
                      <label className="target-label">
                        <input
                          type="checkbox"
                          checked={Boolean(mode)}
                          disabled={!allowed.length}
                          onChange={(e) => setAccount(a.id, e.target.checked ? allowed[0] : '')}
                        />
                        <PlatformMark id={p.id} />
                        <span>
                          <strong>{a.name}</strong>
                          <small>
                            {p.label} · {channelLabels[a.channel] || a.channel}
                          </small>
                        </span>
                      </label>
                      <select
                        aria-label={`${a.name}的发布方式`}
                        disabled={!mode}
                        value={mode || allowed[0] || ''}
                        onChange={(e) => setAccount(a.id, e.target.value)}
                      >
                        {allowed.length ? (
                          allowed.map((key) => (
                            <option key={key} value={key}>
                              {modeLabels[key]}
                            </option>
                          ))
                        ) : (
                          <option value="">当前类型不可用</option>
                        )}
                      </select>
                    </div>
                  )
                })}
              </div>
              <div className="selection-foot">
                <span>
                  已选择 <b>{selected.length}</b> 个账号
                </span>
                <Button icon={Eye} tone="primary" disabled={!selected.length} onClick={confirm}>
                  核对并提交
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {confirmation && (
        <Modal
          title="确认本次发布"
          subtitle={`共 ${confirmation.targets.length} 个账号，按下方方式处理。`}
          wide
          onClose={() => setConfirmation(null)}
        >
          <div className="confirm-list">
            {Object.keys({ ...confirmation.previews, ...confirmation.errors }).map((id) => {
              const p = platforms.find((item) => item.id === id)
              return (
                <section className="confirm-group" key={id}>
                  <div className="confirm-targets">
                    {confirmation.targets
                      .filter((t) => t.account.platform === id)
                      .map((t) => (
                        <div key={t.account.id}>
                          <PlatformMark id={id} />
                          <strong>{t.account.name}</strong>
                          <span className={`mode-tag ${t.mode}`}>{modeLabels[t.mode]}</span>
                        </div>
                      ))}
                  </div>
                  {confirmation.errors[id] ? (
                    <ErrorLine message={confirmation.errors[id]} />
                  ) : (
                    <ContentPreview platform={p} content={confirmation.previews[id]} compact />
                  )}
                </section>
              )
            })}
          </div>
          <p className="dialog-note">
            {confirmation.targets.some((t) => t.mode === 'submit')
              ? '标为「直接提交」的账号会立即向平台发起投稿，平台回执会记录提交和审核状态。'
              : '工作台会为每个账号准备稿件。后续操作和平台返回的信息会显示在发布记录。'}
          </p>
          {confirmedTargets.length !== confirmation.targets.length && (
            <p className="inline-note">本次跳过无法生成预览的账号。可以返回修改稿件，再重新核对。</p>
          )}
          <div className="dialog-actions">
            <Button onClick={() => setConfirmation(null)}>返回修改</Button>
            <Button
              icon={Send}
              tone="primary"
              disabled={!confirmedTargets.length}
              onClick={() => {
                const { revision } = confirmation
                setConfirmation(null)
                publishGroups(confirmedTargets, revision)
              }}
            >
              确认处理 {confirmedTargets.length} 个账号
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
