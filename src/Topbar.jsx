import React, { useLayoutEffect, useState } from 'react'
import {
  ArrowDownToLine, ArrowLeft, CheckCircle2, ChevronDown, ClipboardCheck,
  LoaderCircle, Moon, Plus, RefreshCw, Save, SlidersHorizontal, Sun, Users,
} from 'lucide-react'
import { Brand, Button, IconButton } from './shared'

const themeKey = 'creator-workbench.theme'
const stages = [
  ['topics', '选题灵感'],
  ['editor', '内容创作'],
  ['publish', '八平台分发'],
  ['receipts', '发布记录'],
]
export function useWorkbenchTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(root).getPropertyValue('--paper').trim()
    try {
      localStorage.setItem(themeKey, theme)
    } catch {
      /* 存储不可用时，此窗口仍可切换主题。 */
    }
  }, [theme])
  return [theme, () => setTheme((value) => value === 'dark' ? 'light' : 'dark')]
}

function SaveStatus({ project, dirty, busy, save }) {
  if (!project) return null
  const time = new Date(project.updatedAt)
  const clock = !Number.isNaN(time.getTime()) && time.toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const saving = busy === '正在保存项目' || busy === '正在保存当前项目'
  const Icon = saving ? LoaderCircle : dirty ? Save : CheckCircle2
  const label = saving ? '保存中…' : dirty ? '保存修改' : ['已保存', clock].filter(Boolean).join(' · ')
  return (
    <button type="button" className={`save-state ${dirty ? 'dirty' : ''}`}
      onClick={save} data-testid="project-save" aria-label={`保存项目，${label}`}
      title={`保存项目（Ctrl/⌘ + S）${clock ? ' · 上次保存 ' + time.toLocaleString('zh-CN') : ''}`}>
      <Icon size={14} aria-hidden="true" className={saving ? 'spin' : ''} />
      <span role="status" aria-live="polite" aria-atomic="true">{label}</span>
    </button>
  )
}

export function Topbar({ page, project, topics, dirty, busy, theme, toggleTheme, save, navigate,
  openLibrary, newProject, blankProject, openExports, refreshReceipts, addAccount }) {
  const tools = page === 'tools' || page === 'accounts'
  const needsProject = !project && ['editor', 'publish'].includes(page)
  let action
  if (needsProject) {
    action = <Button tone="primary" icon={Plus} data-testid="new-project" onClick={newProject}>新建项目</Button>
  } else if (page === 'topics') {
    action = <Button tone="primary" icon={Plus} onClick={blankProject}>新建空白作品</Button>
  } else if (page === 'editor') {
    action = <Button tone="primary" icon={ArrowDownToLine} data-testid="export-project" onClick={openExports}>导出成品</Button>
  } else if (page === 'publish') {
    action = <Button tone="primary" icon={ClipboardCheck} type="submit" form="publish-review-form">批量核对</Button>
  } else if (page === 'receipts') {
    action = <Button icon={RefreshCw} disabled={!project} onClick={refreshReceipts}>刷新记录</Button>
  } else if (page === 'accounts') {
    action = <Button tone="primary" icon={Plus} onClick={addAccount}>添加账号</Button>
  } else {
    action = <Button icon={ArrowLeft} onClick={() => navigate('editor')}>返回创作</Button>
  }
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Brand />
        <div className="project-switch">
          <button type="button" className="workspace-button" onClick={openLibrary}
            aria-label="打开项目库" title={project ? `当前项目：${project.name}` : '打开项目库'}>
            项目库 <ChevronDown size={12} aria-hidden="true" />
          </button>
          {!needsProject && <IconButton icon={Plus} label="新建项目" data-testid="new-project" onClick={newProject} />}
        </div>
      </div>
      <nav className="flow-nav" aria-label="创作流程" inert={Boolean(busy)}>
        {stages.map(([id, title]) => (
          <a key={id} href={`#${id}`} aria-current={id === page ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); navigate(id) }}>
            {title}
            {id === 'topics' && <span className="nav-count tabular-nums">{topics.length}</span>}
          </a>
        ))}
      </nav>
      <div className="topbar-actions">
        <SaveStatus project={project} dirty={dirty} busy={busy} save={save} />
        <IconButton icon={theme === 'dark' ? Sun : Moon} className="theme-toggle"
          label={theme === 'dark' ? '切换至宣纸浅色' : '切换至夜墨深色'} onClick={toggleTheme} />
        <Button icon={SlidersHorizontal} className="tools-link" aria-pressed={tools}
          onClick={() => navigate('tools')}>本机工具</Button>
        {action}
      </div>
    </header>
  )
}

export function ToolsNav({ page, navigate }) {
  return (
    <nav className="tools-nav" aria-label="本机工具分类">
      {[[SlidersHorizontal, 'tools', '制作工具'], [Users, 'accounts', '发布账号']].map(([Icon, id, label]) => (
        <button key={id} type="button" aria-current={page === id ? 'page' : undefined}
          onClick={() => navigate(id)}><Icon size={15} aria-hidden="true" />{label}</button>
      ))}
    </nav>
  )
}
