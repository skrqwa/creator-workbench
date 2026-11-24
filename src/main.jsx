import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  ClipboardCheck,
  FolderOpen,
  HardDrive,
  Inbox,
  LoaderCircle,
  Menu,
  Mic,
  MonitorPlay,
  PanelLeft,
  Plus,
  Save,
  Share2,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import { AccountsPage, ReceiptsPage } from './AccountsReceipts'
import Editor from './Editor'
import { ExportDialog, LibraryDialog, NewProject, ProjectHome, ProjectInfo } from './ProjectDialogs'
import { PublishPage } from './Publishing'
import { TopicsPage, ToolsPage } from './TopicsTools'
import { Brand, Button, call, IconButton, kindLabels, Modal } from './shared'
import './style.css'

const menu = [
  { id: 'editor', title: '分镜编辑', icon: Clapperboard },
  { id: 'topics', title: '选题收件箱', icon: Inbox },
  { id: 'publish', title: '多平台发布', icon: Share2 },
  { id: 'receipts', title: '发布记录', icon: ClipboardCheck },
]
const utilities = [
  { id: 'tools', title: '制作工具', icon: SlidersHorizontal },
  { id: 'accounts', title: '发布账号', icon: Users },
]
const navItems = [...menu, ...utilities]
const recoveryKey = (id) => `creator-workbench.draft.${id}`
function dropRecovery(id) {
  try {
    localStorage.removeItem(recoveryKey(id))
  } catch {
    /* 工程仍可手动保存到磁盘。 */
  }
}
function readRecovery(doc) {
  try {
    const draft = JSON.parse(localStorage.getItem(recoveryKey(doc.id)) || 'null')
    return draft?.id === doc.id && Number.isInteger(draft.revision) && Array.isArray(draft.scenes)
      ? draft
      : null
  } catch {
    return null
  }
}
function newScene() {
  return {
    id: crypto.randomUUID(),
    title: '新分镜',
    text: '',
    notes: '',
    media: '',
    audio: '',
    seconds: 5,
    zoom: 1,
    short: true,
  }
}
function messageOf(error) {
  return String(error?.message || error || '操作未完成').replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  )
}

function Sidebar({ page, navigate, projects, project, open, library, newProject, drawer, close }) {
  const nav = (item) => (
    <button
      key={item.id}
      type="button"
      className={`nav-link ${page === item.id ? 'active' : ''}`}
      aria-current={page === item.id ? 'page' : undefined}
      aria-label={item.title}
      title={item.title}
      onClick={() => navigate(item.id)}
    >
      <item.icon size={18} strokeWidth={1.7} />
      <span>{item.title}</span>
    </button>
  )
  return (
    <>
      {drawer && <button type="button" className="drawer-shade" aria-label="关闭导航" onClick={close} />}
      <aside className={`sidebar ${drawer ? 'drawer-open' : ''}`}>
        <Brand />
        <div className="sidebar-scroll">
          <div className="side-group">
            <h2>工作空间</h2>
            <nav aria-label="工作空间">{menu.map(nav)}</nav>
          </div>
          <div className="side-group project-group">
            <div className="side-group-title">
              <h2>最近项目</h2>
              <IconButton icon={Plus} label="新建项目" onClick={newProject} />
            </div>
            <div>
              {projects.slice(0, 4).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`recent ${p.id === project?.id ? 'current' : ''}`}
                  title={p.name}
                  onClick={() => open(p.id)}
                >
                  <span className={`recent-icon ${p.kind}`}>
                    {p.kind === 'brief' ? <Mic size={15} /> : <MonitorPlay size={15} />}
                  </span>
                  <span>{p.name || '未命名项目'}</span>
                  {p.id === project?.id && <i />}
                </button>
              ))}
              <button type="button" className="recent more-projects" title="打开项目" onClick={library}>
                <FolderOpen size={16} />
                <span>打开项目</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
        <div className="side-bottom">
          <div className="side-group">
            <h2>工具与连接</h2>
            <nav aria-label="工具与连接">{utilities.map(nav)}</nav>
          </div>
          <div className="local-space">
            <span>
              <HardDrive size={16} />
            </span>
            <strong>本地工作区</strong>
            <i title="本机项目存储" />
          </div>
        </div>
      </aside>
    </>
  )
}

function App() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState('')
  const [bootCycle, setBootCycle] = useState(0)
  const [project, setProject] = useState(null)
  const projectRef = useRef(null)
  const dirtyRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [projects, setProjects] = useState([])
  const [accounts, setAccounts] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [settings, setSettings] = useState({})
  const [topics, setTopics] = useState([])
  const [receipts, setReceipts] = useState([])
  const [page, setPage] = useState('editor')
  const [drawer, setDrawer] = useState(false)
  const [sceneId, setSceneId] = useState('')
  const [modal, setModal] = useState(null)
  const [pendingSwitch, setPendingSwitch] = useState(null)
  const [diverged, setDiverged] = useState(null)
  const [busy, setBusy] = useState('')
  const busyRef = useRef(false)
  const [progress, setProgress] = useState('')
  const [toast, setToast] = useState('')
  const [problem, setProblem] = useState('')
  const [toastCount, setToastCount] = useState(0)
  const mainRef = useRef(null)

  const notify = useCallback((value) => {
    setToast(value)
    setToastCount((n) => n + 1)
  }, [])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4300)
    return () => clearTimeout(id)
  }, [toast, toastCount])
  function put(doc, modified) {
    projectRef.current = doc
    dirtyRef.current = modified
    setProject(doc)
    setDirty(modified)
    if (!doc) return
    if (modified) {
      try {
        localStorage.setItem(recoveryKey(doc.id), JSON.stringify(doc))
      } catch {
        /* 用户仍可通过保存项目写入工程文件。 */
      }
    } else dropRecovery(doc.id)
  }
  function remember(doc) {
    setProjects((list) => [
      { id: doc.id, name: doc.name, kind: doc.kind, updatedAt: doc.updatedAt },
      ...list.filter((p) => p.id !== doc.id),
    ])
  }
  function opened(doc, recover = true) {
    const draft = recover ? readRecovery(doc) : null
    if (draft && draft.revision !== doc.revision) {
      // 保留两个版本，等作者决定载入哪份内容后再清理恢复记录。
      projectRef.current = doc
      dirtyRef.current = false
      setProject(doc)
      setDirty(false)
      remember(doc)
      setSceneId(doc.scenes[0]?.id || '')
      setDiverged({ disk: doc, draft })
      return
    }
    put(draft || doc, Boolean(draft))
    remember(doc)
    setSceneId((draft || doc).scenes?.[0]?.id || '')
    if (draft) notify('已恢复这个项目未保存的编辑')
  }
  function resolveDraft(useDraft) {
    const { disk, draft } = diverged
    const chosen = useDraft ? { ...draft, revision: disk.revision, updatedAt: disk.updatedAt } : disk
    put(chosen, useDraft)
    setSceneId(chosen.scenes[0]?.id || '')
    setDiverged(null)
  }
  useEffect(() => {
    let active = true
    setBootError('')
    call('bootstrap')
      .then((data) => {
        if (!active) return
        setProjects(data.projects || [])
        setAccounts(data.accounts || [])
        setPlatforms(data.platforms || [])
        setReceipts(data.receipts || [])
        setTopics(data.topics || [])
        setSettings(data.settings || {})
        if (data.project) opened(data.project)
        setReady(true)
      })
      .catch((e) => {
        if (active) setBootError(messageOf(e))
      })
    return () => {
      active = false
    }
  }, [bootCycle])
  useEffect(() => {
    const off = window.studio?.onProgress?.((event) => {
      if (typeof event === 'string') {
        setProgress(event)
        return
      }
      if (event?.type === 'receipt' || event?.stage === 'receipt') {
        const id = projectRef.current?.id
        if (id && (!event.projectId || event.projectId === id))
          call('receipts.list')
            .then((rows) => {
              if (id === projectRef.current?.id) setReceipts(rows)
            })
            .catch(() => {})
      } else if (event)
        setProgress(
          event.message ||
            event.detail ||
            event.label ||
            (Number.isFinite(event.percent) ? `${Math.round(event.percent)}%` : ''),
        )
    })
    return typeof off === 'function' ? off : undefined
  }, [])
  useEffect(() => {
    document.title = `${project?.name ? project.name + ' · ' : ''}创作工作台`
  }, [project?.name])
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    setDrawer(false)
  }, [page, project?.id])
  useEffect(() => {
    if (!drawer) return
    const close = (e) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [drawer])

  async function run(label, action) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(label)
    setProgress('')
    setProblem('')
    try {
      return await action()
    } catch (e) {
      setProblem(messageOf(e))
    } finally {
      busyRef.current = false
      setBusy('')
      setProgress('')
    }
  }
  async function persist() {
    const doc = projectRef.current
    if (!doc || !dirtyRef.current) return doc
    const saved = await call('project.save', { project: doc })
    if (!saved?.id) throw new Error('工程没有完成保存。')
    put(saved, false)
    remember(saved)
    return saved
  }
  const saveRef = useRef(null)
  saveRef.current = () => {
    if (projectRef.current)
      run('正在保存项目', async () => {
        await persist()
        notify('项目已保存')
      })
  }
  useEffect(() => {
    const keyboard = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!busyRef.current && !document.querySelector('[role="dialog"]')) saveRef.current()
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])
  function change(fn, invalidates = false) {
    if (!projectRef.current) return
    const updated = fn(projectRef.current)
    if (invalidates) updated.exports = null
    put(updated, true)
  }
  function changeScene(patch, id = sceneId) {
    change(
      (doc) => ({
        ...doc,
        scenes: doc.scenes.map((s) => {
          if (s.id !== id) return s
          const updated = { ...s, ...patch }
          if ('text' in patch && patch.text !== s.text) {
            delete updated.cues
            updated.audio = ''
          }
          if ('media' in patch && patch.media !== s.media && !('openScreenProject' in patch))
            delete updated.openScreenProject
          return updated
        }),
      }),
      true,
    )
  }
  function changeVariant(id, patch) {
    change((doc) => ({ ...doc, variants: { ...doc.variants, [id]: { ...doc.variants?.[id], ...patch } } }))
  }
  function addScene(copy = false) {
    const doc = projectRef.current
    if (doc.scenes.length >= 250) {
      setProblem('每个项目最多包含 250 个分镜。')
      return
    }
    const index = doc.scenes.findIndex((s) => s.id === sceneId)
    const base = doc.scenes[index]
    const next =
      copy && base
        ? { ...base, id: crypto.randomUUID(), title: `${base.title || '分镜'}（副本）` }
        : newScene()
    const scenes = doc.scenes.slice()
    scenes.splice(index >= 0 ? index + 1 : scenes.length, 0, next)
    change((p) => ({ ...p, scenes }), true)
    setSceneId(next.id)
  }
  function removeScene() {
    const doc = projectRef.current
    if (doc.scenes.length <= 1) {
      setProblem('项目需要保留一个分镜。可以替换此分镜的内容，或先添加新分镜。')
      return
    }
    const index = doc.scenes.findIndex((s) => s.id === sceneId)
    const scenes = doc.scenes.filter((s) => s.id !== sceneId)
    change((p) => ({ ...p, scenes }), true)
    setSceneId(scenes[Math.min(index, scenes.length - 1)]?.id || '')
  }
  function moveScene(delta) {
    const scenes = projectRef.current.scenes.slice()
    const index = scenes.findIndex((s) => s.id === sceneId),
      next = index + delta
    if (index < 0 || next < 0 || next >= scenes.length) return
    ;[scenes[next], scenes[index]] = [scenes[index], scenes[next]]
    change((p) => ({ ...p, scenes }), true)
  }
  function importScene(type, key) {
    run('正在导入分镜素材', async () => {
      const result = await call('project.import', { type })
      if (result?.paths?.length)
        changeScene({ [key]: result.paths[0], ...(key === 'media' ? { poster: '' } : {}) })
    })
  }
  async function applySceneMedia(id, path, openScreenProject) {
    changeScene({ media: path, poster: '', openScreenProject: openScreenProject || '' }, id)
    await persist()
  }
  function generateVoice(saveSettings) {
    run('正在生成分镜配音', async () => {
      await persist()
      if (typeof saveSettings === 'function') await saveSettings()
      const result = await call('tools.voice', { sceneId })
      if (!result?.path) return
      changeScene({
        audio: result.path,
        ...(result.seconds ? { seconds: result.seconds } : {}),
        ...(result.cues ? { cues: result.cues } : {}),
      })
      await persist()
      notify('已生成并保存分镜配音')
    })
  }
  function navigate(id) {
    setPage(id)
    setDrawer(false)
    setProblem('')
  }
  function beforeSwitch(action) {
    if (dirtyRef.current) setPendingSwitch({ action })
    else action(false)
  }
  async function switchTo(method, payload, discard) {
    const old = projectRef.current
    const doc = await call(method, payload)
    if (!doc) return
    if (discard && old) dropRecovery(old.id)
    opened(doc)
    setModal(null)
    setDrawer(false)
    setPage('editor')
    setReceipts(await call('receipts.list'))
  }
  function openProject(id, force = false) {
    if (projectRef.current?.id === id && !force) {
      setModal(null)
      navigate('editor')
      return
    }
    beforeSwitch((discard) => run('正在打开项目', () => switchTo('project.open', { id }, discard)))
  }
  function openFolder() {
    beforeSwitch((discard) => run('正在打开项目目录', () => switchTo('project.openFolder', {}, discard)))
  }
  function newDialog(source, kind) {
    setModal({ type: 'new', source, kind })
    setDrawer(false)
  }
  function create({ kind, name, source, blank }) {
    if (dirtyRef.current && modal?.type === 'new')
      setModal((f) => ({ ...f, kind, initialName: name, initialBlank: blank }))
    const payload = {
      kind,
      blank: Boolean(blank || source),
      ...(name || blank ? { name: name || source?.title || `未命名${kindLabels[kind]}` } : {}),
      ...(source ? { source } : {}),
    }
    beforeSwitch((discard) => run('正在创建本地项目', () => switchTo('project.create', payload, discard)))
  }
  function render() {
    run('正在导出作品', async () => {
      const doc = await persist()
      await call('export.run')
      const saved = await call('project.open', { id: doc.id })
      if (!saved?.exports) throw new Error('导出结束，但工程中没有可读取的产物。')
      put(saved, false)
      remember(saved)
      notify('视频、图集和文章已导出')
    })
  }
  function publishGroups(targets, projectRevision) {
    run('正在按账号处理稿件', async () => {
      await persist()
      const failures = []
      for (const mode of new Set(targets.map((t) => t.mode))) {
        const ids = targets.filter((t) => t.mode === mode).map((t) => t.account.id)
        try {
          await call('publish.batch', { accountIds: ids, mode, projectRevision, confirmed: true })
        } catch (e) {
          failures.push(messageOf(e))
        }
      }
      const rows = await call('receipts.list')
      setReceipts(rows)
      navigate('receipts')
      if (failures.length) throw new Error(failures.join('；'))
      notify('已读取各账号的处理回执')
    })
  }
  if (!ready)
    return (
      <div className="boot">
        <Brand />
        {bootError ? (
          <>
            <p role="alert">{bootError}</p>
            <Button icon={ArrowRight} onClick={() => setBootCycle((n) => n + 1)}>
              重新连接
            </Button>
          </>
        ) : (
          <p role="status">
            <LoaderCircle size={16} className="spin" />
            正在打开本地工作区…
          </p>
        )}
      </div>
    )
  const active = navItems.find((n) => n.id === page)
  const newProject = () => newDialog(null, 'tutorial')
  return (
    <>
      <fieldset className="app-shell" data-testid="workspace" disabled={Boolean(busy)}>
        <Sidebar
          page={page}
          navigate={navigate}
          projects={projects}
          project={project}
          open={openProject}
          library={() => {
            setDrawer(false)
            setModal({ type: 'library' })
          }}
          newProject={newProject}
          drawer={drawer}
          close={() => setDrawer(false)}
        />
        <div className="workspace">
          <header className="topbar">
            <div className="crumb">
              <IconButton
                className="mobile-menu"
                icon={Menu}
                label="打开导航"
                onClick={() => setDrawer(true)}
              />
              <PanelLeft className="crumb-icon" size={16} />
              <span>工作空间</span>
              <ChevronRight size={13} />
              <strong>{active?.title}</strong>
            </div>
            <div className="header-actions">
              {project && (
                <span className={`save-state ${dirty ? 'dirty' : ''}`}>
                  <i />
                  {dirty ? '有未保存修改' : '已保存'}
                </span>
              )}
              <Button className="header-new" icon={Plus} data-testid="new-project" onClick={newProject}>
                新建项目
              </Button>
              <Button
                icon={Save}
                className="header-save"
                data-testid="project-save"
                disabled={!project}
                onClick={() => saveRef.current()}
                title="保存项目 (Ctrl/⌘ + S)"
              >
                保存
              </Button>
              <Button
                icon={ArrowDownToLine}
                tone="primary"
                className="header-export"
                data-testid="export-project"
                disabled={!project}
                onClick={() => setModal({ type: 'exports' })}
              >
                导出作品
              </Button>
            </div>
          </header>
          <main ref={mainRef} className="main-content" id="main-content">
            <div className="main-inner">
              {page === 'editor' && project && (
                <Editor
                  key={project.id}
                  project={project}
                  sceneId={sceneId}
                  setSceneId={setSceneId}
                  changeScene={changeScene}
                  onAdd={() => addScene()}
                  onDuplicate={() => addScene(true)}
                  onRemove={removeScene}
                  onMove={moveScene}
                  importFile={importScene}
                  generateVoice={() => generateVoice()}
                  openTools={() => navigate('tools')}
                  editProject={() => setModal({ type: 'info' })}
                />
              )}
              {page === 'topics' && (
                <TopicsPage
                  topics={topics}
                  setTopics={setTopics}
                  newFrom={(source) => newDialog(source, 'brief')}
                  run={run}
                  notify={notify}
                />
              )}
              {page === 'publish' && project && (
                <PublishPage
                  key={project.id}
                  project={project}
                  platforms={platforms}
                  accounts={accounts}
                  changeVariant={changeVariant}
                  run={run}
                  persist={persist}
                  publishGroups={publishGroups}
                  openAccounts={() => navigate('accounts')}
                />
              )}
              {page === 'accounts' && (
                <AccountsPage
                  accounts={accounts}
                  platforms={platforms}
                  setAccounts={setAccounts}
                  run={run}
                  notify={notify}
                />
              )}
              {page === 'tools' && (
                <ToolsPage
                  settings={settings}
                  onSettings={setSettings}
                  project={project}
                  sceneId={sceneId}
                  setSceneId={setSceneId}
                  persist={persist}
                  applySceneMedia={applySceneMedia}
                  generateVoice={generateVoice}
                  run={run}
                  notify={notify}
                />
              )}
              {page === 'receipts' && (
                <ReceiptsPage
                  project={project}
                  receipts={receipts}
                  platforms={platforms}
                  setReceipts={setReceipts}
                  run={run}
                  notify={notify}
                  persist={persist}
                  openPublish={() => navigate('publish')}
                />
              )}
              {!project && ['editor', 'publish'].includes(page) && (
                <ProjectHome create={create} openFolder={openFolder} />
              )}
            </div>
          </main>
        </div>
        {modal?.type === 'new' && !pendingSwitch && (
          <NewProject
            initialKind={modal.kind}
            initialName={modal.initialName}
            initialBlank={modal.initialBlank}
            source={modal.source}
            onClose={() => setModal(null)}
            create={create}
          />
        )}
        {modal?.type === 'library' && !pendingSwitch && (
          <LibraryDialog
            projects={projects}
            current={project?.id}
            open={(id) => openProject(id, true)}
            openFolder={openFolder}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'info' && project && (
          <ProjectInfo
            project={project}
            onClose={() => setModal(null)}
            apply={(patch) => {
              change((p) => ({ ...p, ...patch }), true)
              setModal(null)
            }}
          />
        )}
        {modal?.type === 'exports' && project && (
          <ExportDialog
            project={project}
            onClose={() => setModal(null)}
            render={render}
            run={run}
            busy={Boolean(busy)}
            progress={progress}
          />
        )}
        {pendingSwitch && (
          <Modal
            title="当前项目有未保存修改"
            subtitle={project?.name}
            onClose={() => setPendingSwitch(null)}
          >
            <p className="dialog-note">切换项目前，可以将本次编辑写入工程文件。</p>
            <div className="dialog-actions wrap">
              <Button onClick={() => setPendingSwitch(null)}>取消</Button>
              <Button
                onClick={() => {
                  const { action } = pendingSwitch
                  setPendingSwitch(null)
                  action(true)
                }}
              >
                放弃修改并继续
              </Button>
              <Button
                tone="primary"
                icon={Save}
                onClick={async () => {
                  const saved = await run('正在保存当前项目', persist)
                  if (saved) {
                    const { action } = pendingSwitch
                    setPendingSwitch(null)
                    action(false)
                  }
                }}
              >
                保存并继续
              </Button>
            </div>
          </Modal>
        )}
        {diverged && (
          <Modal
            title="磁盘工程和本机草稿均已修改"
            subtitle={diverged.disk.name}
            onClose={() => setDiverged(null)}
          >
            <p className="dialog-note">
              磁盘工程在本机草稿之后又保存过。载入草稿后，可以检查内容，再决定是否覆盖磁盘版本。
            </p>
            <div className="dialog-actions">
              <Button onClick={() => resolveDraft(true)}>载入本机草稿</Button>
              <Button tone="primary" onClick={() => resolveDraft(false)}>
                使用磁盘版本
              </Button>
            </div>
          </Modal>
        )}
      </fieldset>
      {busy && (
        <div className="busy-status" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{progress || busy}</span>
        </div>
      )}
      {problem && (
        <div className="feedback problem" role="alert">
          <AlertCircle size={19} />
          <span>{problem}</span>
          <IconButton icon={X} label="关闭错误信息" onClick={() => setProblem('')} />
        </div>
      )}
      {toast && !problem && (
        <div className="feedback toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <IconButton icon={X} label="关闭提示" onClick={() => setToast('')} />
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
