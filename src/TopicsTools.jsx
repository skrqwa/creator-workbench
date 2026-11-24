import React, { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  CircleDot,
  Clapperboard,
  ExternalLink,
  FolderOpen,
  Inbox,
  Link2,
  Mic,
  Monitor,
  MonitorPlay,
  Plus,
  RefreshCw,
  Rss,
  Save,
  Search,
  Settings2,
  SquarePen,
  Wand2,
} from 'lucide-react'
import { Button, call, Empty, Field, IconButton, shortDate } from './shared'

export function TopicsPage({ topics, setTopics, newFrom, run, notify }) {
  const [input, setInput] = useState('')
  const [manualTitle, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState('feed')
  const items = topics.filter((t) =>
    [t.title, t.source, t.url].filter(Boolean).join(' ').toLowerCase().includes(filter.toLowerCase()),
  )
  const fetchItems = (e) => {
    e.preventDefault()
    run('正在读取选题来源', async () => {
      const result = await call('topics.fetch', { input: input.trim() })
      if (!Array.isArray(result)) throw new Error('选题来源未返回可读取的列表。')
      setTopics(result)
      notify(`已更新选题列表，共 ${result.length} 条`)
    })
  }
  const add = (e) => {
    e.preventDefault()
    run('正在保存选题', async () => {
      const result = await call('topics.add', { title: manualTitle.trim(), url: url.trim() })
      setTopics(result)
      setTitle('')
      setUrl('')
      notify('手工选题已保存')
    })
  }
  return (
    <div>
      <div className="page-intro">
        <div className="page-mark">
          <Inbox size={18} />
        </div>
        <h1>选题收件箱</h1>
        <p>收集来源，把选好的题目带入新项目。</p>
      </div>
      <div className="utility-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>
              <Inbox />
              已收集的选题 <span className="count">{topics.length}</span>
            </h2>
          </div>
          <div className="list-filter">
            <label className="search-input">
              <Search size={16} />
              <input
                value={filter}
                placeholder="按标题或来源搜索"
                aria-label="搜索选题"
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
          </div>
          {items.length ? (
            <div className="topic-list">
              {items.map((t, i) => (
                <article className="topic-item" key={t.id || `${t.url}-${i}`}>
                  <div className="topic-item-head">
                    <span className="source-chip">{t.source || '手动录入'}</span>
                    <time>{shortDate(t.publishedAt || t.addedAt)}</time>
                  </div>
                  <h3>{t.title || t.url}</h3>
                  {t.url && (
                    <button
                      type="button"
                      className="source-link"
                      title={t.url}
                      onClick={() => run('正在打开来源', () => call('file.external', { url: t.url }))}
                    >
                      <Link2 size={13} />
                      <span>{t.url}</span>
                      <ExternalLink size={12} />
                    </button>
                  )}
                  <div className="topic-actions">
                    <Button icon={Plus} className="compact" onClick={() => newFrom(t)}>
                      用此题创作
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty icon={filter ? Search : Inbox} title={filter ? '没有匹配的选题' : '收下第一个选题'}>
              {filter ? '试试其他标题或来源关键词。' : '添加 RSS、GitHub 仓库或手动填写题目。'}
            </Empty>
          )}
        </section>
        <section className="panel tool-panel">
          <div className="panel-header">
            <h2>
              <Plus />
              添加来源
            </h2>
          </div>
          <div className="padded stack">
            <div className="segmented" role="group" aria-label="添加来源方式">
              <button type="button" aria-pressed={tab === 'feed'} onClick={() => setTab('feed')}>
                <Rss size={14} />
                订阅源
              </button>
              <button type="button" aria-pressed={tab === 'manual'} onClick={() => setTab('manual')}>
                <SquarePen size={14} />
                手动录入
              </button>
            </div>
            {tab === 'feed' ? (
              <form className="stack" onSubmit={fetchItems}>
                <Field label="RSS 地址或 GitHub 仓库" hint="支持 RSS / Atom 链接和 GitHub 的 owner/repo。">
                  <input
                    required
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="https://… 或 owner/repo"
                  />
                </Field>
                <Button type="submit" tone="primary" icon={ArrowDownToLine} disabled={!input.trim()}>
                  读取选题
                </Button>
              </form>
            ) : (
              <form className="stack" onSubmit={add}>
                <Field label="选题标题">
                  <input
                    required
                    value={manualTitle}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="想讲什么？"
                  />
                </Field>
                <Field label="来源链接">
                  <input
                    required
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
                <Button
                  type="submit"
                  tone="primary"
                  icon={Plus}
                  disabled={!manualTitle.trim() || !url.trim()}
                >
                  保存选题
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const toolFields = [
  { key: 'openScreenExe', label: 'OpenScreen 应用', placeholder: '选择 OpenScreen 可执行文件' },
  { key: 'voicePython', label: '配音用 Python', placeholder: '选择本地 Python 可执行文件' },
  { key: 'voiceScript', label: '配音脚本', placeholder: '选择配音脚本文件' },
  { key: 'voiceTemplate', label: '声音模板', placeholder: '选择本地声音模板文件' },
]

export function ToolsPage({
  settings,
  onSettings,
  project,
  sceneId,
  setSceneId,
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
  const scene = project?.scenes?.find((s) => s.id === sceneId)
  const changed = toolFields.some((f) => (draft[f.key] || '') !== (settings?.[f.key] || ''))
  useEffect(() => {
    setDraft(settings || {})
  }, [settings])
  async function saveSettings() {
    if (!changed) return
    const result = await call('settings.save', { settings: draft })
    onSettings(
      result?.settings ||
        (result && typeof result === 'object' && 'openScreenExe' in result ? result : draft),
    )
  }
  function browse(key) {
    run('正在选择文件', async () => {
      const result = await call('tools.choose', { key })
      if (result) setDraft((d) => ({ ...d, [key]: result }))
    })
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
    run(action === 'record' ? `正在录制 ${seconds} 秒` : '正在导入 OpenScreen 工程', async () => {
      await persist()
      await saveSettings()
      const result = await call('tools.openscreen', {
        action,
        sceneId,
        ...(action === 'record' ? { sourceId, duration: seconds } : {}),
      })
      if (result?.path) {
        await applySceneMedia(sceneId, result.path, result.openScreenProject)
        notify('已将画面保存到当前分镜')
      }
    })
  }
  return (
    <div>
      <div className="page-intro">
        <div className="page-mark">
          <Settings2 size={18} />
        </div>
        <h1>制作工具</h1>
        <p>为当前分镜录制画面、导入工程或生成旁白。</p>
      </div>
      <div className="utility-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <h2>
                <Clapperboard />
                当前分镜
              </h2>
            </div>
            <div className="padded stack">
              <Field label="选择要写入的分镜">
                <select
                  value={scene?.id || ''}
                  onChange={(e) => setSceneId(e.target.value)}
                  disabled={!project?.scenes?.length}
                >
                  <option value="" disabled>
                    请先创建项目并添加分镜
                  </option>
                  {(project?.scenes || []).map((s, i) => (
                    <option key={s.id} value={s.id}>
                      {String(i + 1).padStart(2, '0')} · {s.title || '未命名分镜'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>
                <MonitorPlay />
                录屏与 OpenScreen
              </h2>
            </div>
            <div className="padded stack">
              <div className="tool-actions">
                <Button
                  icon={ExternalLink}
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
                <Button icon={FolderOpen} disabled={!scene} onClick={() => capture('import')}>
                  导入 OpenScreen 工程
                </Button>
              </div>
              <div className="subsection">
                <h3>
                  <Monitor size={15} />
                  录制屏幕或窗口
                </h3>
                <Button className="compact" icon={RefreshCw} onClick={chooseSources}>
                  {sourceLoaded ? '刷新来源' : '选择录制来源'}
                </Button>
              </div>
              {sourceLoaded && !sources.length && (
                <p className="inline-note">未发现可录制的来源。请检查系统录屏权限并刷新。</p>
              )}
              {sources.length > 0 && (
                <Field label="录制来源">
                  <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="录制时长（秒）">
                <input
                  type="number"
                  min="2"
                  max="300"
                  step="1"
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                />
              </Field>
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
          <section className="panel">
            <div className="panel-header">
              <h2>
                <Mic />
                分镜配音
              </h2>
            </div>
            <div className="padded stack">
              {scene?.text && <blockquote className="excerpt">{scene.text}</blockquote>}
              <Button
                icon={Wand2}
                tone="voice"
                disabled={!scene?.text?.trim()}
                onClick={() => generateVoice(saveSettings)}
              >
                用当前旁白生成配音
              </Button>
            </div>
          </section>
        </div>
        <section className="panel tool-panel">
          <div className="panel-header">
            <h2>
              <Settings2 />
              工具路径
            </h2>
          </div>
          <div className="padded stack">
            {toolFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <span className="file-input">
                  <input
                    value={draft[f.key] || ''}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                  <IconButton label={`选择${f.label}`} icon={FolderOpen} onClick={() => browse(f.key)} />
                </span>
              </Field>
            ))}
            <Button
              icon={Save}
              disabled={!changed}
              onClick={() =>
                run('正在保存工具设置', async () => {
                  await saveSettings()
                  notify('工具设置已保存')
                })
              }
            >
              保存工具设置
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
