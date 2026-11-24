import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Code2,
  ExternalLink,
  FileSearch,
  FolderOpen,
  Inbox,
  Link2,
  Mic,
  MonitorPlay,
  Plus,
  RefreshCw,
  Repeat2,
  Rss,
  Save,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Button, call, Empty, Field, IconButton, kindLabels, Modal, shortDate } from './shared'
import './topics-tools.css'

const sources = {
  all: { label: '全部' },
  feed: { label: '订阅源', icon: Rss },
  release: { label: '开源动态', icon: Code2 },
  manual: { label: '手工记', icon: Bookmark },
}

function topicSource(topic) {
  let origin
  try {
    origin = new URL(topic.url)
  } catch {
    // 旧记录可能没有有效链接，仍可用原标题立项。
  }
  const github = origin?.hostname === 'github.com'
  const kind = topic.source === '手工收藏' ? 'manual' : github ? 'release' : 'feed'
  const segments = origin?.pathname.split('/').filter(Boolean) || []
  const site = github ? [origin.hostname, ...segments.slice(0, 2)].join('/') : origin?.hostname
  return { kind, site, canOpen: origin?.protocol === 'https:' || origin?.protocol === 'http:' }
}

function titleKey(title) {
  return (title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function titlePairs(value) {
  const pairs = new Set()
  for (let i = 1; i < value.length; i++) pairs.add(value.slice(i - 1, i + 1))
  return pairs
}

function similarWork(title, works) {
  const key = titleKey(title)
  if (!key) return null
  const exact = works.find((w) => w.key === key)
  if (exact) return exact.name
  if (key.length < 4) return null
  const pairs = titlePairs(key)
  let best = null
  let bestScore = 0
  // 工程索引只有作品名，按标题包含关系与相邻字对比较，不推断是否已发布。
  for (const work of works) {
    if (work.key.length < 4) continue
    if (key.includes(work.key) || work.key.includes(key)) return work.name
    let overlap = 0
    for (const pair of pairs) if (work.pairs.has(pair)) overlap++
    const score = (2 * overlap) / (pairs.size + work.pairs.size)
    if (overlap >= 3 && score >= 0.65 && score > bestScore) {
      best = work.name
      bestScore = score
    }
  }
  return best
}

function CollectTopicDialog({ mode, lastInput, run, onClose, onCollected }) {
  const manual = mode === 'manual'
  const [address, setAddress] = useState(manual ? '' : lastInput)
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setPending(true)
    try {
      await run(manual ? '正在保存选题' : '正在读取选题来源', async () => {
        const input = address.trim()
        const items = manual
          ? await call('topics.add', { title: title.trim(), url: input })
          : await call('topics.fetch', { input })
        if (!Array.isArray(items)) throw new Error('没有收到可读取的选题清单。')
        onCollected(items, mode, input)
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal title={manual ? '随手记一条' : '拉取更新'} onClose={onClose} pending={pending}>
      <form className="stack" onSubmit={submit}>
        {manual && (
          <Field label="选题标题">
            <input
              required
              data-focus
              maxLength={500}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="你想讲什么？"
            />
          </Field>
        )}
        <Field
          label={manual ? '来源链接' : '订阅地址或仓库名'}
          hint={manual ? undefined : '可填写 RSS、Atom 地址，或用 作者名/仓库名 读取 GitHub 版本更新。'}
        >
          <input
            type={manual ? 'url' : 'text'}
            data-focus={manual ? undefined : true}
            maxLength={2400}
            required
            value={address}
            placeholder={manual ? 'https://…' : '订阅链接或作者名/仓库名'}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="submit"
            tone="primary"
            icon={manual ? Plus : RefreshCw}
            disabled={pending || !address.trim() || (manual && !title.trim())}
          >
            {manual ? '保存选题' : '读取选题'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const outlines = {
  tutorial: [
    ['先看成品', '让观众看到操作完成后的样子。'],
    ['演示关键步骤', '围绕一个任务录屏，指出每一步要点。'],
    ['核对结果', '说明怎样确认做对了，以及容易卡在哪里。'],
  ],
  brief: [
    ['先讲新变化', '用一句话说清发生了什么。'],
    ['展开事实', '从原文挑出最值得解释的一条信息。'],
    ['落到影响', '说清这件事和观众有什么关系。'],
  ],
}

export function TopicsPage({ topics, projects = [], setTopics, newFrom, run, notify }) {
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [kind, setKind] = useState('tutorial')
  const [dialog, setDialog] = useState('')
  const [lastInput, setLastInput] = useState('')
  const [syncedAt, setSyncedAt] = useState('')
  const detailHeading = useRef(null)
  const works = useMemo(
    () =>
      projects.map((p) => {
        const key = titleKey(p.name)
        return { name: p.name, key, pairs: titlePairs(key) }
      }),
    [projects],
  )
  const entries = useMemo(
    () =>
      topics.map((topic) => ({
        topic,
        ...topicSource(topic),
        match: similarWork(topic.title, works),
      })),
    [topics, works],
  )
  const counts = { all: topics.length, feed: 0, release: 0, manual: 0 }
  for (const item of entries) counts[item.kind]++
  const search = query.trim().toLowerCase()
  const filtered = entries.filter(
    ({ topic, kind: source }) =>
      (category === 'all' || category === source) &&
      [topic.title, topic.source, topic.url].some((value) => value?.toLowerCase().includes(search)),
  )
  const selected = filtered.find(({ topic }) => (topic.id || topic.url) === selectedId) || filtered[0]
  const idea = selected?.topic
  const date = idea?.publishedAt || idea?.addedAt
  const sourceDate =
    date && Number.isFinite(Date.parse(date))
      ? new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : ''
  const today = new Date().toDateString()
  const addedToday = topics.filter(
    (t) => t.addedAt && new Date(t.addedAt).toDateString() === today,
  ).length

  function collected(items, mode, input) {
    setTopics(items)
    setSelectedId(items[0]?.id || items[0]?.url || '')
    setQuery('')
    setCategory('all')
    if (mode === 'feed') {
      setLastInput(input)
      setSyncedAt(new Date().toISOString())
    }
    setDialog('')
    notify(mode === 'manual' ? '选题已保存' : '已更新选题列表，共 ' + items.length + ' 条')
  }
  function chooseIdea(topic) {
    setSelectedId(topic.id || topic.url)
    if (window.matchMedia('(max-width: 840px)').matches) {
      requestAnimationFrame(() => {
        detailHeading.current?.focus({ preventScroll: true })
        detailHeading.current?.scrollIntoView({ block: 'start' })
      })
    }
  }

  return (
    <div className="topics-desk">
      <section className="topics-feed-pane" aria-labelledby="topics-title">
        <span className="topics-eyebrow">
          <Sparkles size={13} aria-hidden="true" />
          选题收件箱 · 对照往期作品
        </span>
        <div className="topics-head">
          <div>
            <h1 id="topics-title">选题灵感</h1>
            <div className="topics-meta tabular-nums" role="status">
              <span>已收录 {topics.length} 条</span>
              <span>今日新增 {addedToday} 条</span>
              {syncedAt && (
                <span>
                  刚同步于{' '}
                  {new Date(syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
          <div className="topics-head-actions">
            <Button icon={RefreshCw} onClick={() => setDialog('feed')}>
              拉取更新
            </Button>
            <Button icon={Plus} tone="primary" onClick={() => setDialog('manual')}>
              随手记一条
            </Button>
          </div>
        </div>
        <div className="topics-toolbar">
          <div className="topics-filters" role="group" aria-label="按来源筛选选题">
            {Object.entries(sources).map(([key, info]) => (
              <button
                key={key}
                type="button"
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
              >
                {info.label}
                <span className="tabular-nums">{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="topics-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索选题"
              value={query}
              placeholder="搜索标题或来源…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {filtered.length ? (
          <ul className="topics-feed" aria-label="收录的选题">
            {filtered.map(({ topic, site, kind: source, match }) => {
              const SourceIcon = sources[source].icon
              const Similarity = match ? Repeat2 : works.length ? CheckCircle2 : ClipboardList
              const stamp = topic.publishedAt || topic.addedAt
              const current = topic === idea
              return (
                <li key={topic.id || topic.url}>
                  <button
                    type="button"
                    className="topic-choice"
                    aria-pressed={current}
                    aria-label={'查看选题策划，' + topic.title}
                    onClick={() => chooseIdea(topic)}
                  >
                    <span className="topic-choice-meta">
                      <span>
                        <SourceIcon size={14} aria-hidden="true" />
                        {topic.source || site || sources[source].label}
                      </span>
                      {stamp && (
                        <time className="tabular-nums" dateTime={stamp}>
                          {shortDate(stamp)}
                        </time>
                      )}
                    </span>
                    <strong>{topic.title || topic.url}</strong>
                    {(topic.summary || topic.description) && (
                      <span className="topic-summary">{topic.summary || topic.description}</span>
                    )}
                    {site && site !== topic.source && <span className="topic-site">{site}</span>}
                    <span className="topic-choice-foot">
                      <span className={match ? 'topic-similarity similar' : 'topic-similarity'}>
                        <Similarity size={13} aria-hidden="true" />
                        {match ? '有相近作品' : works.length ? '未见相近标题' : '暂无往期作品'}
                      </span>
                      {current && (
                        <span className="topic-plan-link">
                          查看策划
                          <ArrowRight size={13} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty
            icon={topics.length ? Search : Inbox}
            title={topics.length ? '没有匹配的选题' : '收下第一个选题'}
            action={
              topics.length ? (
                <Button
                  onClick={() => {
                    setQuery('')
                    setCategory('all')
                  }}
                >
                  清除筛选
                </Button>
              ) : (
                <Button icon={Link2} onClick={() => setDialog('feed')}>
                  添加订阅来源
                </Button>
              )
            }
          >
            {topics.length
              ? '换个关键词，或查看其他来源。'
              : '从订阅源收集更新，也可以随手保存一个原文链接。'}
          </Empty>
        )}
      </section>

      <section className="topics-plan-pane" aria-labelledby="topic-plan-title">
        {idea && (
          <div className="topic-source-line">
            {selected.canOpen && (
              <button
                type="button"
                title={idea.url}
                aria-label={'查看原文，' + (selected.site || idea.title)}
                onClick={() => run('正在打开原文', () => call('file.external', { url: idea.url }))}
              >
                <Link2 size={14} aria-hidden="true" />
                {selected.site || '查看原文'}
                <ExternalLink size={12} aria-hidden="true" />
              </button>
            )}
            {sourceDate && (
              <time dateTime={date} className="tabular-nums">
                {sourceDate}
              </time>
            )}
          </div>
        )}
        <h2 ref={detailHeading} tabIndex={-1} id="topic-plan-title">
          {idea?.title || '选题策划'}
        </h2>
        {idea ? (
          <article className="topic-info-card">
            <h3>选题资料</h3>
            {!!(idea.summary || idea.description) && <p>{idea.summary || idea.description}</p>}
            <dl>
              <dt>收录来源</dt>
              <dd>{idea.source || selected.site || sources[selected.kind].label}</dd>
              {idea.addedAt && (
                <>
                  <dt>收录时间</dt>
                  <dd className="tabular-nums">{shortDate(idea.addedAt)}</dd>
                </>
              )}
              <dt>往期对照</dt>
              <dd>
                {selected.match
                  ? '相近作品《' + selected.match + '》'
                  : works.length
                    ? '本机 ' + works.length + ' 个作品中未见相近标题'
                    : '作品库暂无可对照的标题'}
              </dd>
            </dl>
          </article>
        ) : (
          <div className="topic-plan-placeholder">
            <FileSearch size={22} strokeWidth={1.5} aria-hidden="true" />
            <p>选中一条灵感，在这里查看原文和相近作品。</p>
          </div>
        )}
        <div className="topic-outline-card">
          <h3>
            三段构思提纲<span>{kindLabels[kind]}参考</span>
          </h3>
          <ol>
            {outlines[kind].map(([label, prompt], i) => (
              <li key={label}>
                <span className="tabular-nums" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <strong>{label}</strong>
                  <p>{prompt}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="topic-template-row">
          <span>立项模板</span>
          <div className="segmented" role="group" aria-label="选择立项模板">
            {Object.entries(kindLabels).map(([key, title]) => {
              const Icon = key === 'tutorial' ? MonitorPlay : Mic
              return (
                <button type="button" aria-pressed={kind === key} key={key} onClick={() => setKind(key)}>
                  <Icon size={14} aria-hidden="true" />
                  {title}
                </button>
              )
            })}
          </div>
        </div>
        <Button
          tone="primary"
          className="topic-create"
          disabled={!idea}
          onClick={() => newFrom(idea, kind)}
        >
          用这个选题开始创作
          <ArrowRight size={15} aria-hidden="true" />
        </Button>
      </section>
      {dialog && (
        <CollectTopicDialog
          mode={dialog}
          lastInput={lastInput}
          run={run}
          onClose={() => setDialog('')}
          onCollected={collected}
        />
      )}
    </div>
  )
}

const toolFields = [
  { key: 'openScreenExe', label: 'OpenScreen 应用', placeholder: '选择本机 OpenScreen 应用' },
  { key: 'voicePython', label: '配音用 Python', placeholder: '选择配音环境中的 Python' },
  { key: 'voiceScript', label: '配音脚本', placeholder: '选择本地配音脚本' },
  { key: 'voiceTemplate', label: '音色模板', placeholder: '选择要使用的声音模板' },
]

export function ToolsPage({
  settings,
  onSettings,
  project,
  sceneId,
  setSceneId,
  section,
  persist,
  applySceneMedia,
  generateVoice,
  run,
  notify,
}) {
  const [draft, setDraft] = useState(settings || {})
  const [sources, setSources] = useState([])
  const [sourceId, setSourceId] = useState('')
  const [seconds, setSeconds] = useState(10)
  const [sourceLoaded, setSourceLoaded] = useState(false)
  const recordingHeading = useRef(null)
  const voiceHeading = useRef(null)
  const scene = project?.scenes?.find((s) => s.id === sceneId)
  const changed = toolFields.filter((f) => (draft[f.key] || '') !== (settings?.[f.key] || ''))
  const voiceConfigured = toolFields.slice(1).every((f) => draft[f.key]?.trim())
  const recordingConfigured = Boolean(draft.openScreenExe?.trim())

  useEffect(() => {
    setDraft(settings || {})
  }, [settings])
  useEffect(() => {
    const target =
      section === 'voice'
        ? voiceHeading.current
        : section === 'recording'
          ? recordingHeading.current
          : null
    if (target) {
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [section])

  function updatePath(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key === 'openScreenExe') {
      setSourceLoaded(false)
      setSources([])
      setSourceId('')
    }
  }
  async function saveSettings() {
    if (!changed.length) return
    const next = Object.fromEntries(changed.map(({ key }) => [key, draft[key] || '']))
    const saved = await call('settings.save', { settings: next })
    onSettings(saved)
  }
  function browse(key) {
    run('正在选择文件', async () => {
      const path = await call('tools.choose', { key })
      if (path) updatePath(key, path)
    })
  }
  function pathField(f) {
    return (
      <Field key={f.key} label={f.label}>
        <span className="tools-file-input">
          <input
            value={draft[f.key] || ''}
            onChange={(e) => updatePath(f.key, e.target.value)}
            placeholder={f.placeholder}
            spellCheck={false}
          />
          <IconButton label={'选择' + f.label} icon={FolderOpen} onClick={() => browse(f.key)} />
        </span>
      </Field>
    )
  }
  function chooseSources() {
    run('正在读取可录制的窗口', async () => {
      await saveSettings()
      const result = await call('tools.openscreen', { action: 'sources' })
      const list = result?.sources || []
      setSources(list)
      setSourceLoaded(true)
      setSourceId((prev) => (list.some((item) => item.id === prev) ? prev : list[0]?.id || ''))
    })
  }
  function capture(action) {
    run(action === 'record' ? '正在录制 ' + seconds + ' 秒' : '正在导入 OpenScreen 工程', async () => {
      await persist()
      await saveSettings()
      const result = await call('tools.openscreen', {
        action,
        sceneId,
        ...(action === 'record' ? { sourceId, duration: Number(seconds) } : {}),
      })
      if (result?.path) {
        await applySceneMedia(sceneId, result.path, result.openScreenProject)
        notify('已将画面保存到当前分镜')
      }
    })
  }
  return (
    <div className="tools-desk">
      <header className="tools-intro">
        <div>
          <h1>制作工具</h1>
          <p>把窗口录屏和本地配音写入当前分镜。</p>
        </div>
        <Button
          icon={Save}
          disabled={!changed.length}
          onClick={() =>
            run('正在保存工具设置', async () => {
              await saveSettings()
              notify('工具设置已保存')
            })
          }
        >
          保存工具设置
        </Button>
      </header>
      <div className="tools-target">
        <div className="tools-target-project">
          <ClipboardList size={18} aria-hidden="true" />
          <span>当前作品</span>
          <strong>{project?.name || '尚未打开作品'}</strong>
        </div>
        <ChevronRight size={15} aria-hidden="true" />
        <Field label="目标分镜">
          <select
            value={scene?.id || ''}
            onChange={(e) => setSceneId(e.target.value)}
            disabled={!project?.scenes?.length}
          >
            <option value="" disabled>
              请先创建作品并添加分镜
            </option>
            {(project?.scenes || []).map((s, i) => (
              <option key={s.id} value={s.id}>
                {String(i + 1).padStart(2, '0')} · {s.title || '未命名分镜'}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="tools-grid">
        <section className="tools-sheet" aria-labelledby="tools-recording-heading">
          <div className="tools-sheet-heading">
            <div className="tools-glyph">
              <MonitorPlay size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 id="tools-recording-heading" ref={recordingHeading} tabIndex={-1}>
                录屏与推镜
              </h2>
              <p>用 OpenScreen 录制单个窗口，或导入已有工程。</p>
            </div>
          </div>
          {pathField(toolFields[0])}
          <div className="tools-actions">
            <Button
              icon={ExternalLink}
              disabled={!recordingConfigured}
              onClick={() =>
                run('正在启动 OpenScreen', async () => {
                  await saveSettings()
                  await call('tools.openscreen', { action: 'launch' })
                  notify('已请求启动 OpenScreen')
                })
              }
            >
              启动 OpenScreen
            </Button>
            <Button
              icon={FolderOpen}
              disabled={!scene || !recordingConfigured}
              onClick={() => capture('import')}
            >
              导入 OpenScreen 工程
            </Button>
          </div>
          <div className="tools-record-controls">
            <div className="tools-subhead">
              <h3>录制到分镜</h3>
              <Button
                icon={RefreshCw}
                className="compact"
                disabled={!recordingConfigured}
                onClick={chooseSources}
              >
                {sourceLoaded ? '刷新窗口' : '读取窗口'}
              </Button>
            </div>
            <div className="tools-record-fields">
              <Field label="录制窗口">
                <select
                  value={sourceId}
                  disabled={!sources.length}
                  onChange={(e) =>
                    setSourceId(sources.find((s) => String(s.id) === e.target.value)?.id || '')
                  }
                >
                  {!sources.length && (
                    <option value="">
                      {sourceLoaded ? '未发现窗口，请检查录屏权限' : '先读取可录制的窗口'}
                    </option>
                  )}
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="时长（秒）">
                <input
                  className="tabular-nums"
                  type="number"
                  min={2}
                  max={300}
                  step={1}
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                />
              </Field>
            </div>
            <Button
              icon={CircleDot}
              tone="primary"
              disabled={
                !scene || !sourceId || !Number.isInteger(+seconds) || +seconds < 2 || +seconds > 300
              }
              onClick={() => capture('record')}
            >
              开始录制并导入
            </Button>
            {scene?.openScreenProject && (
              <Button
                icon={FolderOpen}
                onClick={() =>
                  run('正在定位可编辑录屏工程', () =>
                    call('file.show', { path: scene.openScreenProject }),
                  )
                }
              >
                定位可编辑录屏工程
              </Button>
            )}
          </div>
        </section>
        <section className="tools-sheet" aria-labelledby="tools-voice-heading">
          <div className="tools-sheet-heading">
            <div className="tools-glyph">
              <Mic size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 id="tools-voice-heading" ref={voiceHeading} tabIndex={-1}>
                分镜配音
              </h2>
              <p>选择本机 Qwen 配音环境和音色模板。</p>
            </div>
          </div>
          {toolFields.slice(1).map(pathField)}
          <div className="tools-voice-preview">
            <h3>本镜旁白</h3>
            {scene?.text ? (
              <blockquote>{scene.text}</blockquote>
            ) : (
              <p>{scene ? '先在内容创作页写下本镜旁白。' : '选择目标分镜后可在这里查看旁白。'}</p>
            )}
          </div>
          <div className="tools-actions">
            <Button
              icon={Wand2}
              tone="primary"
              disabled={!scene?.text?.trim() || !voiceConfigured}
              onClick={() => generateVoice(saveSettings)}
            >
              用当前旁白生成配音
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
