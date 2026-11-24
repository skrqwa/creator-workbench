import React, { useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bookmark,
  Check,
  CheckCircle2,
  CircleDashed,
  Eye,
  FileImage,
  FileText,
  Film,
  Grid2X2,
  Image as ImageIcon,
  Images,
  MonitorPlay,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  SquarePen,
  Star,
  Users,
} from 'lucide-react'
import { modesFor } from '../desktop/catalog.mjs'
import { getPlatformContent, getPlatformReadiness } from './publish-readiness'
import {
  asset,
  Button,
  call,
  channelLabels,
  duration,
  Empty,
  ErrorLine,
  Field,
  fileName,
  isVideo,
  kindLabels,
  Modal,
  modeLabels,
  typeLabels,
} from './shared'
import './publishing.css'

const marks = {
  douyin: '抖',
  xiaohongshu: '红',
  bilibili: 'B',
  channels: '视',
  wechat: '公',
  kuaishou: '快',
  toutiao: '头',
  zhihu: '知',
}
export function PlatformMark({ id }) {
  return (
    <span aria-hidden="true" className={'platform-mark platform-' + id}>
      {marks[id] || '稿'}
    </span>
  )
}

export function ContentPreview({ content, platform }) {
  return (
    <article className="publication-proof">
      <div className="proof-byline">
        <PlatformMark id={platform.id} />
        <strong>{platform.label}</strong>
        <span>{typeLabels[content.type]}</span>
      </div>
      <h3>{content.title || '未填写标题'}</h3>
      {content.cover && (
        <figure>
          <img src={asset(content.cover)} alt="待发布封面" />
          <figcaption>作品封面</figcaption>
        </figure>
      )}
      {content.type === 'video' && content.video && (
        <video
          key={content.video}
          controls
          playsInline
          preload="metadata"
          src={asset(content.video)}
          poster={asset(content.cover)}
          aria-label="待发布视频"
        />
      )}
      <p>{content.body || '未填写正文'}</p>
      {content.type !== 'video' && !!content.images?.length && (
        <div className="proof-gallery">
          {content.images.map((image, i) => (
            <img key={image + i} loading="lazy" src={asset(image)} alt={'配图 ' + (i + 1)} />
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
              <Field label="视频分区编号">
                <input
                  inputMode="numeric"
                  value={content.biliTid || ''}
                  placeholder="平台分区编号"
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
                  value={content.biliCopyright || ''}
                  onChange={(e) => update({ biliCopyright: e.target.value })}
                >
                  <option value="">沿用账号设置</option>
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
              <Field label="专栏子分类编号">
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

const shapes = {
  full: { label: '横屏完整版', icon: MonitorPlay },
  short: { label: '竖屏精简版', icon: Smartphone },
  cards: { label: '图文合集', icon: Images },
  article: { label: '图文长文', icon: FileText },
  pin: { label: '带图想法', icon: SquarePen },
  file: { label: '自选视频', icon: Film },
}

function shapeFor(content, platform, project) {
  if (content.type !== 'video') return content.type
  if (project.variants?.[platform.id]?.video) return 'file'
  if (content.video && content.video === project.exports?.video) return 'full'
  return (content.videoVersion ? content.videoVersion === 'full' : platform.id === 'bilibili')
    ? 'full'
    : 'short'
}

function PlatformRail({ project, platforms, entries, current, onSelect }) {
  const count = entries.filter((entry) => entry.ready).length
  return (
    <aside className="publish-rail" aria-label="平台版本">
      <div className="publish-project">
        <small>当前分发 · {kindLabels[project.kind] || '作品'}</small>
        <h2>{project.name}</h2>
        <div className="publish-meter tabular-nums">
          <progress aria-label="本地稿件就绪平台数" max={platforms.length} value={count} />
          <span>
            {count} / {platforms.length} 就绪
          </span>
        </div>
      </div>
      <div className="publish-platforms" role="group" aria-label="选择编辑的平台">
        {entries.map(({ platform, content, ready, label }) => {
          const shape = shapeFor(content, platform, project)
          const Status = ready ? CheckCircle2 : label.includes('账号') ? CircleDashed : AlertCircle
          return (
            <button
              type="button"
              key={platform.id}
              className="publish-platform"
              aria-pressed={platform.id === current.id}
              onClick={() => onSelect(platform.id)}
            >
              <PlatformMark id={platform.id} />
              <span className="publish-platform-name">
                <strong>{platform.label}</strong>
                <small>{shapes[shape]?.label || typeLabels[content.type]}</small>
              </span>
              <span
                className={'publish-status ' + (ready ? 'ready' : label.includes('账号') ? '' : 'missing')}
              >
                <Status size={13} aria-hidden="true" />
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function AccountPicker({ accounts, target, choose, openAccounts }) {
  if (!target)
    return (
      <Button icon={Plus} className="publish-add-account" onClick={openAccounts}>
        添加目标账号
      </Button>
    )
  return (
    <label className="publish-account">
      <span aria-hidden="true">{[...target.name][0]}</span>
      <select aria-label="目标账号" value={target.id} onChange={(event) => choose(event.target.value)}>
        {accounts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {channelLabels[item.channel]}
          </option>
        ))}
      </select>
    </label>
  )
}

function DraftField({ label, value, onChange, multiline = false }) {
  const id = useId()
  const [editing, setEditing] = useState(null)
  const text = editing ?? value
  const control = {
    id,
    value: text,
    autoComplete: 'off',
    onFocus: () => setEditing(value),
    onChange: (event) => {
      const next = event.target.value
      setEditing(next)
      onChange(next)
    },
    // 空覆盖值沿用主稿。失焦后呈现将用于正式核对的实际文案。
    onBlur: () => setEditing(null),
  }
  return (
    <div className="publish-field">
      <label htmlFor={id}>{label}</label>
      <span className="tabular-nums">{multiline ? '本平台独立保存' : [...text].length + ' 字'}</span>
      {multiline ? (
        <textarea {...control} rows={3} maxLength={150000} />
      ) : (
        <input {...control} type="text" maxLength={400} />
      )}
    </div>
  )
}

function hashtags(text) {
  return [...new Set(Array.from(text.matchAll(/(?:^|\s)#([\p{L}\p{M}\p{N}_-]+)/gu), (match) => match[1]))]
}

function TopicChips({ text, update }) {
  const [input, setInput] = useState(null)
  const [problem, setProblem] = useState('')
  const tags = hashtags(text)
  function add(event) {
    event.preventDefault()
    const tag = input.trim().replace(/^#+/, '')
    if (!tag) return
    if (!tags.includes(tag)) {
      const body = (text.trimEnd() + '\n\n#' + tag).trimStart()
      if (body.length > 150000) {
        setProblem('正文已达到工程字数上限，请缩短正文后再添加话题。')
        return
      }
      update({ body })
    }
    setProblem('')
    setInput(null)
  }
  return (
    <div className="publish-hashtags">
      {tags.map((tag) => (
        <span key={tag}>#{tag}</span>
      ))}
      {input === null ? (
        <button
          type="button"
          onClick={() => {
            setProblem('')
            setInput('')
          }}
        >
          <Plus size={12} aria-hidden="true" />
          添加话题
        </button>
      ) : (
        <form onSubmit={add}>
          <label>
            话题名称
            <input
              type="text"
              autoFocus
              value={input}
              required
              pattern="#?[\p{L}\p{M}\p{N}_\-]+"
              title="输入一个话题词"
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <Button type="submit" className="compact">
            添加
          </Button>
          <Button className="compact" onClick={() => setInput(null)}>
            取消
          </Button>
          {problem && <ErrorLine message={problem} />}
        </form>
      )}
    </div>
  )
}

function firstSceneImage(project, shape) {
  const scene = project.scenes.find(
    (item) =>
      (shape !== 'short' || item.short !== false) && (item.poster || (item.media && !isVideo(item.media))),
  )
  return scene?.poster || scene?.media || ''
}

function MediaCard({ project, platform, content, shape, info, choose, update }) {
  const variant = project.variants?.[platform.id] || {}
  const thumbnail = content.cover || firstSceneImage(project, shape)
  const video = content.type === 'video'
  const assetLabel = video ? '成片' : '配图'
  let material = video ? fileName(content.video) : content.images.length + ' 张配图'
  if (video && !content.video) material = '导出项目或导入视频'
  return (
    <section className="publish-card publish-media" aria-label="封面与素材">
      <div className="publish-cover">
        {thumbnail ? (
          <img src={asset(thumbnail)} alt={content.cover ? '本平台封面' : '工程分镜示意图'} />
        ) : (
          <FileImage size={26} aria-hidden="true" />
        )}
        <span>{content.cover ? '作品封面' : thumbnail ? '分镜示意' : '待选封面'}</span>
      </div>
      <div className="publish-media-text">
        <h2>
          {shapes[shape]?.label || typeLabels[content.type]} · 封面与{assetLabel}
        </h2>
        <p>
          {content.cover ? '封面 · ' + fileName(content.cover) : '选择单独的封面，或沿用导出的项目封面。'}
        </p>
        <p className="tabular-nums">
          {assetLabel} · {material}
        </p>
        {info && (
          <p className="tabular-nums">
            {info.width} × {info.height}
            {Number.isFinite(info.seconds) && ' · ' + duration(info.seconds)}
          </p>
        )}
      </div>
      <div className="publish-media-actions">
        <Button className="compact" onClick={() => choose('image', 'cover')}>
          {content.cover ? '更换封面' : '选择封面'}
        </Button>
        <Button
          className="compact"
          onClick={() => (video ? choose('video', 'video') : choose('images', 'images'))}
        >
          {video ? '导入视频' : '选择图集'}
        </Button>
      </div>
      {(variant.cover || variant.video || variant.videoVersion || !!content.images.length) && (
        <details className="publish-asset-detail">
          <summary>素材明细</summary>
          <div>
            {!!content.images.length && (
              <ol>
                {content.images.map((path, i) => (
                  <li key={path + i}>{fileName(path)}</li>
                ))}
              </ol>
            )}
            <div className="publish-asset-resets">
              {variant.cover && (
                <Button className="compact" onClick={() => update({ cover: '' })}>
                  恢复项目封面
                </Button>
              )}
              {video && (variant.video || variant.videoVersion) && (
                <Button className="compact" onClick={() => update({ video: '', videoVersion: '' })}>
                  使用平台默认视频
                </Button>
              )}
              {!!variant.images?.length && (
                <Button className="compact" onClick={() => update({ images: [] })}>
                  恢复项目配图
                </Button>
              )}
            </div>
          </div>
        </details>
      )}
    </section>
  )
}

function Checks({ checks }) {
  const passed = checks.filter(({ ok }) => ok).length
  return (
    <section className="publish-checks" aria-label="发前本地检查">
      <h2>
        <ShieldCheck size={16} aria-hidden="true" />
        <span className="tabular-nums">
          {passed} / {checks.length} 项就绪
        </span>
      </h2>
      <ul>
        {checks.map(({ ok, yes, no }) => (
          <li key={yes} className={ok ? '' : 'missing'}>
            {ok ? <Check size={13} aria-hidden="true" /> : <CircleDashed size={13} aria-hidden="true" />}
            {ok ? yes : no}
          </li>
        ))}
      </ul>
    </section>
  )
}

function VariantEditor({
  project,
  platform,
  content,
  shape,
  info,
  checks,
  accounts,
  target,
  chooseAccount,
  openAccounts,
  changeVariant,
  run,
}) {
  const [sync, setSync] = useState(false)
  const variant = project.variants?.[platform.id] || {}
  const hasOverride = !!(
    variant.title ||
    variant.body ||
    variant.cover ||
    variant.video ||
    variant.images?.length
  )
  const options = platform.types.flatMap((type) =>
    type === 'video' ? ['full', 'short', ...(variant.video ? ['file'] : [])] : [type],
  )
  const update = (patch) => changeVariant(platform.id, patch)

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
  function setShape(next) {
    const video = ['file', 'full', 'short'].includes(next)
    const type = video ? 'video' : next
    const patch = { type }
    if (video && next !== 'file') Object.assign(patch, { video: '', videoVersion: next })
    if (platform.id === 'zhihu') {
      if (type === 'pin' && !['ai_creation', ''].includes(variant.zhihuStatement || ''))
        patch.zhihuStatement = ''
      if (['follower', 'follower_n_days'].includes(variant.zhihuComment))
        patch.zhihuComment = type === 'pin' ? 'follower_n_days' : 'follower'
    }
    update(patch)
  }
  return (
    <section className="publish-editor" aria-label={platform.label + '稿件设置'}>
      <div className="publish-heading">
        <div>
          <span className="publish-edition">
            <Send size={13} aria-hidden="true" />
            平台独立稿
          </span>
          <h1>{platform.label} · 发布版本</h1>
        </div>
        <AccountPicker
          accounts={accounts}
          target={target}
          choose={chooseAccount}
          openAccounts={openAccounts}
        />
      </div>
      <div className="publish-format-row">
        <div className="publish-formats" role="group" aria-label={platform.label + '内容形态'}>
          {options.map((option) => {
            const { icon: Icon, label } = shapes[option]
            return (
              <button
                key={option}
                type="button"
                aria-pressed={shape === option}
                onClick={() => setShape(option)}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
        <button
          className="publish-sync"
          type="button"
          disabled={!hasOverride}
          onClick={() => setSync(true)}
        >
          <RotateCcw size={13} aria-hidden="true" />
          从主稿重新同步
        </button>
      </div>
      <div className="publish-card publish-copy">
        <DraftField label="作品标题" value={content.title} onChange={(title) => update({ title })} />
        <DraftField
          multiline
          label="发布文案与话题"
          value={content.body}
          onChange={(body) => update({ body })}
        />
        <TopicChips text={content.body} update={update} />
      </div>
      <MediaCard
        project={project}
        platform={platform}
        content={content}
        shape={shape}
        info={info}
        update={update}
        choose={choose}
      />
      <PlatformOptions id={platform.id} content={content} update={update} />
      <Checks checks={checks} />
      {sync && (
        <Modal title={'重新同步' + platform.label + '稿件'} onClose={() => setSync(false)}>
          <p className="dialog-note">标题、正文、封面和媒体将重新沿用主稿。保留当前内容形态与投稿选项。</p>
          <div className="dialog-actions">
            <Button onClick={() => setSync(false)}>取消</Button>
            <Button
              icon={RotateCcw}
              tone="primary"
              onClick={() => {
                update({ title: '', body: '', cover: '', video: '', images: [] })
                setSync(false)
              }}
            >
              重新同步
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function PhonePreview({ project, platform, content, shape, target, safe, videoRatio, measureVideo }) {
  const tags = hashtags(content.body)
  const [imageIndex, setImageIndex] = useState(0)
  const player = useRef(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const videoMode = content.type === 'video'
  const index = Math.min(imageIndex, Math.max(0, content.images.length - 1))
  const picture = videoMode
    ? content.cover || firstSceneImage(project, shape)
    : content.images[index] || content.cover || firstSceneImage(project, shape)
  const name = target?.name || '待选账号'
  const article = content.type === 'article' || content.type === 'pin'
  const prepared = videoMode ? content.video : content.images.length > 0
  return (
    <div
      className={'publish-phone ' + (article ? 'reading' : '')}
      aria-label={platform.label + '稿件版式预览'}
    >
      <div className="publish-phone-screen">
        <i className="phone-speaker" aria-hidden="true" />
        <div className="phone-header">
          <PlatformMark id={platform.id} />
          <strong>{platform.label}</strong>
          <span>{typeLabels[content.type]}</span>
        </div>
        {article ? (
          <article className="phone-article" tabIndex={0} aria-label="阅读稿件预览">
            <p>{name}</p>
            <h2>{content.title}</h2>
            {content.cover && <img src={asset(content.cover)} alt="文章封面" />}
            <div>{content.body}</div>
            {content.images.map((pic, i) => (
              <img key={pic + i} loading="lazy" src={asset(pic)} alt={'正文配图 ' + (i + 1)} />
            ))}
          </article>
        ) : (
          <>
            <div className={'phone-visual' + (playing ? ' playing' : '')}>
              <div
                className={'phone-shot' + (content.video ? ' has-media' : '')}
                style={{ '--video-ratio': videoRatio }}
              >
                {videoMode && content.video ? (
                  <>
                    <video
                      ref={player}
                      controls={started}
                      playsInline
                      preload="metadata"
                      aria-label="本平台成片预览"
                      src={asset(content.video)}
                      poster={asset(content.cover)}
                      onLoadedMetadata={measureVideo}
                      onPlay={() => {
                        setStarted(true)
                        setPlaying(true)
                        setMediaError('')
                      }}
                      onPause={() => setPlaying(false)}
                      onEnded={() => {
                        setPlaying(false)
                        setStarted(false)
                      }}
                    />
                    {!started && (
                      <button
                        type="button"
                        className="phone-play"
                        aria-label="播放本平台成片"
                        onClick={async () => {
                          const video = player.current
                          if (video.ended) video.currentTime = 0
                          try {
                            await video.play()
                          } catch (error) {
                            if (error.name !== 'AbortError') setMediaError('无法播放，请检查当前成片。')
                          }
                        }}
                      >
                        <Play size={20} aria-hidden="true" />
                      </button>
                    )}
                    {mediaError && <span className="phone-media-error" role="status">{mediaError}</span>}
                  </>
                ) : (
                  <div className="phone-composition">
                    <div className="phone-title-card">
                      <small>{prepared ? shapes[shape].label : '工程分镜预览'}</small>
                      <h2>{content.title || project.name}</h2>
                    </div>
                    {picture ? (
                      <img src={asset(picture)} alt={prepared ? '图卡预览' : '当前工程分镜画面'} />
                    ) : (
                      <ImageIcon size={32} aria-hidden="true" />
                    )}
                    {!prepared && (
                      <span className="phone-pending">{videoMode ? '待导出成片' : '待选发布配图'}</span>
                    )}
                    {!videoMode && content.images.length > 1 && (
                      <div className="phone-gallery-nav">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => setImageIndex(index - 1)}
                          aria-label="上一张图卡"
                        >
                          ‹
                        </button>
                        <span className="tabular-nums">
                          {index + 1} / {content.images.length}
                        </span>
                        <button
                          type="button"
                          disabled={index === content.images.length - 1}
                          onClick={() => setImageIndex(index + 1)}
                          aria-label="下一张图卡"
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {safe && (
                  <div className="phone-safe-area" aria-hidden="true">
                    <span>安全区</span>
                  </div>
                )}
              </div>
              <div className="phone-side" aria-hidden="true">
                <span>
                  <Star size={16} />
                </span>
                <span>
                  <Bookmark size={15} />
                </span>
                <span>
                  <Send size={14} />
                </span>
              </div>
            </div>
            <div className="phone-caption">
              <strong>{target ? '@' + name : name}</strong>
              <p>{content.title}</p>
              {tags.length > 0 && <small>{tags.map((tag) => '#' + tag).join(' ')}</small>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PublishPreview({ project, platform, content, shape, info, onMeasure, target, checkTarget }) {
  const [guides, setGuides] = useState(true)
  const videoRatio = info ? info.width / info.height : shape === 'short' ? 9 / 16 : 16 / 9
  const short = content.type === 'video' && videoRatio < 1
  function measureVideo(event) {
    const media = event.currentTarget
    if (media.videoWidth && media.videoHeight)
      onMeasure({
        file: content.video,
        width: media.videoWidth,
        height: media.videoHeight,
        seconds: media.duration,
      })
  }
  const allowed = target ? modesFor(target, content.type) : []
  const needsTarget = !target
  return (
    <section className="publish-theatre" aria-label="实景预览与发布">
      <div className="publish-preview-head">
        <h2>实景预览</h2>
        {short && (
          <button
            type="button"
            aria-pressed={guides}
            className="publish-guides"
            onClick={() => setGuides(!guides)}
          >
            <Grid2X2 size={13} aria-hidden="true" />
            安全区参考线 · {guides ? '开' : '关'}
          </button>
        )}
      </div>
      <div className="publish-device-stage">
        <PhonePreview
          key={[platform.id, content.type, content.video, content.images.join('|')].join(':')}
          project={project}
          platform={platform}
          content={content}
          shape={shape}
          target={target}
          safe={short && guides}
          videoRatio={videoRatio}
          measureVideo={measureVideo}
        />
      </div>
      <div className="publish-launch">
        <div>
          <Button icon={Eye} disabled={!allowed.includes('review')} onClick={() => checkTarget('review')}>
            去{platform.label}复核
          </Button>
          <Button
            icon={Send}
            tone="primary"
            disabled={!allowed.includes('submit')}
            onClick={() => checkTarget('submit')}
          >
            确认并提交
          </Button>
        </div>
        <p>
          {needsTarget
            ? '添加目标账号后，可以核对这份稿件。'
            : !allowed.length
              ? '当前账号的连接方式不支持这种稿件。'
              : !allowed.includes('submit')
                ? '此账号支持去平台复核，发表由作者在平台完成。'
                : '每个账号单独保存稿件编号与审核状态。'}
        </p>
      </div>
    </section>
  )
}

function TargetSelection({
  accounts,
  entries,
  selection,
  onSelect,
  selected,
  openAccounts,
  onClose,
  confirm,
}) {
  return (
    <Modal title="批量核对" subtitle="选择目标账号和发布方式，再逐个平台预览稿件。" onClose={onClose}>
      {accounts.length ? (
        <>
          <div className="publish-target-list">
            {accounts.map((account) => {
              const entry = entries.find(({ platform }) => platform.id === account.platform)
              if (!entry) return null
              const allowed = modesFor(account, entry.content.type)
              const mode = allowed.includes(selection[account.id]) ? selection[account.id] : ''
              return (
                <div className="publish-target" key={account.id}>
                  <label className="publish-target-info">
                    <input
                      type="checkbox"
                      checked={!!mode}
                      disabled={!allowed.length}
                      onChange={(event) => onSelect(account.id, event.target.checked ? allowed[0] : '')}
                    />
                    <PlatformMark id={entry.platform.id} />
                    <span>
                      <strong>{account.name}</strong>
                      <small>
                        {entry.platform.label} · {channelLabels[account.channel]}
                      </small>
                    </span>
                  </label>
                  <label>
                    <select
                      aria-label={account.name + '的发布方式'}
                      disabled={!mode}
                      value={mode || allowed[0] || ''}
                      onChange={(event) => onSelect(account.id, event.target.value)}
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
                  </label>
                </div>
              )
            })}
          </div>
          <div className="dialog-actions">
            <Button icon={Settings2} onClick={openAccounts}>
              管理账号
            </Button>
            <Button tone="primary" icon={Eye} disabled={!selected.length} onClick={confirm}>
              核对所选账号（{selected.length}）
            </Button>
          </div>
        </>
      ) : (
        <Empty
          icon={Users}
          title="还没有发布账号"
          action={
            <Button icon={Plus} tone="primary" onClick={openAccounts}>
              添加发布账号
            </Button>
          }
        >
          在本机工具添加一个账号，即可核对它能发布的作品。
        </Empty>
      )}
    </Modal>
  )
}

function ConfirmPublication({ confirmation, platforms, onClose, publishGroups }) {
  const { targets, previews, errors, revision } = confirmation
  const approved = targets.filter(({ account }) => previews[account.platform] && !errors[account.platform])
  const ids = [...new Set(targets.map(({ account }) => account.platform))]
  return (
    <Modal
      title="确认本次发布"
      subtitle={'共 ' + targets.length + ' 个账号，请核对稿件与各账号的处理方式。'}
      onClose={onClose}
      wide
    >
      <div className="publish-confirm-list">
        {ids.map((id) => (
          <section className="publish-confirm-group" key={id}>
            {targets
              .filter(({ account }) => account.platform === id)
              .map(({ account, mode }) => (
                <div className="publish-confirm-account" key={account.id}>
                  <PlatformMark id={id} />
                  <strong>{account.name}</strong>
                  <span>{modeLabels[mode]}</span>
                </div>
              ))}
            {errors[id] ? (
              <ErrorLine message={errors[id]} />
            ) : (
              <ContentPreview content={previews[id]} platform={platforms.find((p) => id === p.id)} />
            )}
          </section>
        ))}
      </div>
      <p className="dialog-note">
        {targets.some((target) => target.mode === 'submit')
          ? '确认后，标为直接提交的账号将向平台发起投稿。你可以到发布记录回查结果。'
          : '确认后，工作台会为选中的账号准备稿件。请到对应平台继续复核。'}
      </p>
      {approved.length < targets.length && (
        <p className="dialog-note">只处理已生成预览的账号。其余稿件可修改后再次核对。</p>
      )}
      <div className="dialog-actions">
        <Button onClick={onClose}>返回修改</Button>
        <Button
          icon={Send}
          tone="primary"
          disabled={!approved.length}
          onClick={() => {
            onClose()
            publishGroups(approved, revision)
          }}
        >
          确认处理 {approved.length} 个账号
        </Button>
      </div>
    </Modal>
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
  const [platformId, setPlatform] = useState(platforms[0]?.id)
  const [targetsByPlatform, setTargets] = useState({})
  const [showSelection, setShowSelection] = useState(false)
  const [selection, setSelection] = useState({})
  const [confirmation, setConfirmation] = useState(null)
  const [measured, setMeasured] = useState(null)
  const entries = useMemo(
    () =>
      platforms.map((platform) => {
        const content = getPlatformContent(project, platform)
        return { platform, content, ...getPlatformReadiness(project, platform, accounts, content) }
      }),
    [project, platforms, accounts],
  )
  const entry = entries.find(({ platform }) => platform.id === platformId) || entries[0]
  if (!entry) return <Empty title="没有可用的平台">请重新打开工作台后重试。</Empty>
  const { platform, content } = entry
  const shape = shapeFor(content, platform, project)
  const mediaInfo = measured?.file === content.video ? measured : null
  const targetAccounts = accounts.filter((account) => account.platform === platform.id)
  const target =
    targetAccounts.find((item) => item.id === targetsByPlatform[platform.id]) || targetAccounts[0]
  const selected = accounts
    .filter((account) => {
      const item = entries.find((row) => row.platform.id === account.platform)
      return (
        selection[account.id] &&
        item &&
        modesFor(account, item.content.type).includes(selection[account.id])
      )
    })
    .map((account) => ({ account, mode: selection[account.id] }))

  function check(targets) {
    if (!targets.length) return
    run('正在核对待发布稿件', async () => {
      const saved = await persist()
      const previews = {}
      const errors = {}
      for (const id of new Set(targets.map(({ account }) => account.platform))) {
        try {
          previews[id] = await call('publish.preview', { platform: id })
        } catch (error) {
          const message = String(error?.message || error)
          errors[id] = /\bENOENT\b/.test(message)
            ? '找不到工程中的素材文件，请重新选择后核对。'
            : message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
        }
      }
      setShowSelection(false)
      setConfirmation({ targets, previews, errors, revision: saved.revision })
    })
  }

  return (
    <div className="publish-workspace">
      <form
        id="publish-review-form"
        hidden
        onSubmit={(event) => {
          event.preventDefault()
          setShowSelection(true)
        }}
      />
      <PlatformRail
        project={project}
        platforms={platforms}
        entries={entries}
        current={platform}
        onSelect={setPlatform}
      />
      <VariantEditor
        key={platform.id}
        project={project}
        platform={platform}
        content={content}
        shape={shape}
        info={mediaInfo}
        checks={getPlatformReadiness(project, platform, target ? [target] : [], content).checks}
        accounts={targetAccounts}
        target={target}
        openAccounts={openAccounts}
        chooseAccount={(id) => setTargets((previous) => ({ ...previous, [platform.id]: id }))}
        run={run}
        changeVariant={changeVariant}
      />
      <PublishPreview
        key={platform.id + ':' + shape + ':' + content.video}
        project={project}
        platform={platform}
        content={content}
        shape={shape}
        info={mediaInfo}
        onMeasure={setMeasured}
        target={target}
        checkTarget={(mode) => {
          if (target && modesFor(target, content.type).includes(mode)) check([{ account: target, mode }])
        }}
      />
      {showSelection && (
        <TargetSelection
          accounts={accounts}
          entries={entries}
          selection={selection}
          selected={selected}
          onSelect={(id, mode) => setSelection((previous) => ({ ...previous, [id]: mode }))}
          openAccounts={openAccounts}
          onClose={() => setShowSelection(false)}
          confirm={() => check(selected)}
        />
      )}
      {confirmation && (
        <ConfirmPublication
          confirmation={confirmation}
          platforms={platforms}
          onClose={() => setConfirmation(null)}
          publishGroups={publishGroups}
        />
      )}
    </div>
  )
}
