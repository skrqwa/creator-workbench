import React, { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileImage,
  FileText,
  Film,
  FolderOpen,
  Images,
  Layers,
  Mic,
  MonitorPlay,
  Plus,
  Search,
  Subtitles,
  Video,
} from 'lucide-react'
import { asset, Button, call, Empty, Field, fileName, kindLabels, Modal, shortDate } from './shared'
import tutorial from '../examples/tutorial/project.json'
import brief from '../examples/brief/project.json'

const posters = import.meta.glob('../examples/*/assets/{capture,return}.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const templates = [
  {
    id: 'tutorial',
    title: '录屏教程',
    example: tutorial.name,
    poster: 'capture.png',
    icon: MonitorPlay,
    project: tutorial,
  },
  { id: 'brief', title: '热点口播', example: brief.name, poster: 'return.png', icon: Mic, project: brief },
]

export function ProjectHome({ create, openFolder }) {
  return (
    <div className="home-page">
      <div className="page-intro with-action">
        <div>
          <div className="project-type">
            <span className="type-symbol">
              <Layers size={12} />
            </span>
            本地项目
          </div>
          <h1>创作项目</h1>
          <p>选择一个示例开始编辑，或从磁盘打开已有工程。</p>
        </div>
        <Button icon={FolderOpen} onClick={openFolder}>
          打开工程目录
        </Button>
      </div>
      <div className="home-templates">
        {templates.map((t) => {
          const Icon = t.icon,
            poster = posters[`../examples/${t.id}/assets/${t.poster}`]
          const seconds = Math.round(t.project.scenes.reduce((n, scene) => n + scene.seconds, 0))
          return (
            <button
              type="button"
              key={t.id}
              className={`home-template home-${t.id}`}
              onClick={() => create({ kind: t.id })}
            >
              <span className="home-art">
                {poster ? <img src={poster} alt={t.example + '的作品画面'} /> : <Icon size={48} />}
              </span>
              <span className="home-card-info">
                <span className="home-kind">
                  <Icon size={14} />
                  {t.title}
                </span>
                <strong>{t.example}</strong>
                <span className="home-description">{t.project.intro}</span>
                <span className="home-card-foot">
                  <span>
                    <Layers size={13} />
                    {t.project.scenes.length} 个分镜
                    <i />约 {seconds} 秒
                  </span>
                  <b>
                    编辑示例 <ArrowUpRight size={14} />
                  </b>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function NewProject({
  source,
  initialKind = 'tutorial',
  initialName,
  initialBlank,
  onClose,
  create,
}) {
  const [kind, setKind] = useState(initialKind)
  const [name, setName] = useState(initialName ?? source?.title ?? '')
  const [blank, setBlank] = useState(initialBlank ?? Boolean(source))
  return (
    <Modal
      title="新建创作项目"
      subtitle={
        source
          ? '选择作品形式，从这个选题的空白分镜开始。'
          : '从一种作品形式开始，后续可以增删分镜和替换素材。'
      }
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          create({ kind, name: name.trim(), source, blank })
        }}
      >
        {source ? (
          <div className="segmented" role="group" aria-label="作品形式">
            {templates.map((t) => (
              <button key={t.id} type="button" aria-pressed={kind === t.id} onClick={() => setKind(t.id)}>
                <t.icon size={15} />
                {t.title}
              </button>
            ))}
          </div>
        ) : (
          <div className="template-grid" role="group" aria-label="项目模板">
            {templates.map((t) => {
              const Icon = t.icon,
                poster = posters[`../examples/${t.id}/assets/${t.poster}`]
              return (
                <button
                  type="button"
                  data-testid={`new-${t.id}`}
                  key={t.id}
                  aria-pressed={kind === t.id}
                  className={`template-card template-${t.id}`}
                  onClick={() => setKind(t.id)}
                >
                  <span className="template-image">
                    {poster ? <img src={poster} alt="" /> : <Icon size={32} strokeWidth={1.5} />}
                    <i>{kind === t.id && <Check size={12} />}</i>
                  </span>
                  <strong>{t.title}</strong>
                  <small>{t.example}</small>
                </button>
              )
            })}
          </div>
        )}
        <Field label="项目名称">
          <input
            value={name}
            maxLength={160}
            onChange={(e) => setName(e.target.value)}
            placeholder={source ? '输入项目名称' : blank ? '留空按作品形式命名' : '留空使用示例名称'}
          />
        </Field>
        {!source && (
          <label className="check-row">
            <input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} />
            从一个空白分镜开始
          </label>
        )}
        {source && (
          <div className="source-picked">
            <span>选题来源</span>
            <strong>{source.title}</strong>
          </div>
        )}
        <div className="dialog-actions">
          <Button onClick={onClose}>取消</Button>
          <Button icon={Plus} type="submit" tone="primary" data-testid="create-project">
            创建项目
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function LibraryDialog({ projects, current, open, openFolder, newProject, onClose }) {
  const [filter, setFilter] = useState('')
  const list = projects.filter((p) => p.name?.toLowerCase().includes(filter.toLowerCase()))
  return (
    <Modal title="项目库" onClose={onClose}>
      <div className="stack">
        <label className="search-input">
          <Search size={16} />
          <input
            data-focus
            placeholder="搜索最近项目"
            aria-label="搜索最近项目"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <div className="project-library">
          {list.length ? (
            list.map((p) => {
              const Icon = p.kind === 'brief' ? Mic : MonitorPlay
              return (
                <button type="button" className="library-row" key={p.id} onClick={() => open(p.id)}>
                  <span className={`library-icon ${p.kind}`}>
                    <Icon size={19} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {kindLabels[p.kind] || '项目'} · {shortDate(p.updatedAt)}
                    </small>
                  </span>
                  {p.id === current && <i>当前</i>}
                  <ChevronRight size={15} />
                </button>
              )
            })
          ) : (
            <Empty icon={FolderOpen} title="没有匹配的项目">
              可从磁盘打开已有工程目录。
            </Empty>
          )}
        </div>
        <div className="dialog-actions">
          <Button icon={FolderOpen} onClick={openFolder}>
            从文件夹打开
          </Button>
          <Button icon={Plus} tone="primary" onClick={newProject}>
            新建项目
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function ProjectInfo({ project, onClose, apply }) {
  const original =
    typeof project.source === 'string' ? { title: project.source, url: '' } : project.source || {}
  const [name, setName] = useState(project.name)
  const [intro, setIntro] = useState(project.intro || '')
  const [title, setTitle] = useState(original.title || '')
  const [url, setUrl] = useState(original.url || '')
  return (
    <Modal title="项目信息" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          apply({ name: name.trim(), intro, source: { ...original, title: title.trim(), url: url.trim() } })
        }}
      >
        <Field label="项目名称">
          <input
            data-focus
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="文章导语">
          <textarea value={intro} rows={3} onChange={(e) => setIntro(e.target.value)} />
        </Field>
        <Field label="来源标题">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="来源链接">
          <input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" tone="primary" icon={Check} disabled={!name.trim()}>
            应用修改
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const outputGroups = [
  ['video', '横屏完整版', 'MP4', Film],
  ['shortVideo', '竖屏精简版', 'MP4', Video],
  ['cards', '分镜图集', 'PNG', Images],
  ['cover', '作品封面', 'PNG', FileImage],
  ['article', '图文文章', 'HTML', FileText],
  ['markdown', '文章原稿', 'Markdown', FileText],
  ['subtitles', '横屏字幕', 'SRT', Subtitles],
  ['shortSubtitles', '竖屏字幕', 'SRT', Subtitles],
  ['script', '分镜脚本', 'Markdown', FileText],
  ['credits', '素材署名', 'Markdown', FileText],
]
export function ExportDialog({ project, onClose, render, run, busy, progress }) {
  const outputs = project.exports
  const rows = outputGroups.filter(([id]) =>
    outputs ? outputs[id] : ['video', 'shortVideo', 'cards', 'cover', 'article', 'markdown'].includes(id),
  )
  const show = (path) => run('正在显示导出文件', () => call('file.show', { path }))
  return (
    <Modal title="导出成品" subtitle={project.name} pending={busy} onClose={onClose}>
      <div className="stack">
        {outputs ? (
          <>
            <div className="export-done">
              <CheckCircle2 size={19} />
              <strong>此版本已导出</strong>
            </div>
            <div className="export-files">
              {rows.map(([id, title, format, Icon]) => {
                const value = outputs[id]
                if (!value) return null
                if (Array.isArray(value))
                  return (
                    <details key={id} className="export-gallery">
                      <summary>
                        <Icon size={17} />
                        <strong>{title}</strong>
                        <span>{value.length} 张</span>
                      </summary>
                      <div>
                        {value.map((path, i) => (
                          <button
                            type="button"
                            key={path}
                            onClick={() => show(path)}
                            title={fileName(path)}
                            aria-label={`在文件夹中显示图集第 ${i + 1} 张`}
                          >
                            <img src={asset(path)} alt="" />
                            <span>{String(i + 1).padStart(2, '0')}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )
                return (
                  <button
                    key={id}
                    type="button"
                    className="export-row"
                    onClick={() => show(value)}
                    title={`在文件夹中显示 ${fileName(value)}`}
                  >
                    <Icon size={17} />
                    <strong>{title}</strong>
                    <small>{format}</small>
                    <FolderOpen size={15} />
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <p className="dialog-note">从当前分镜一次生成以下文件，保存到此项目的导出目录。</p>
            <div className="export-plan">
              {rows.map(([id, title, format, Icon]) => (
                <div key={id}>
                  <Icon size={18} />
                  <span>{title}</span>
                  <small>{format}</small>
                </div>
              ))}
            </div>
          </>
        )}
        {busy && (
          <div className="export-progress" role="status">
            <div>
              <i />
            </div>
            <span>{progress || '正在准备素材…'}</span>
          </div>
        )}
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={busy}>
            {outputs ? '关闭' : '取消'}
          </Button>
          <Button
            icon={Download}
            tone="primary"
            data-testid="render-project"
            onClick={render}
            disabled={busy || !project.scenes?.length}
          >
            {outputs ? '重新导出' : '开始导出'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
