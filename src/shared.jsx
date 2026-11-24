import React, { useEffect, useId, useRef } from 'react'
import { AlertCircle, FolderOpen, X } from 'lucide-react'

export const kindLabels = { tutorial: '录屏教程', brief: '热点口播' }
export const typeLabels = { video: '视频', cards: '图集', article: '文章', pin: '想法' }
export const modeLabels = { review: '去平台复核', submit: '确认并提交' }
export const channelLabels = { browser: '创作网页', api: '官方接口', plugin: '发布插件' }

export function call(method, payload = {}) {
  if (!window.studio?.call) {
    return Promise.reject(new Error('桌面连接尚未就绪，请从创作工坊桌面应用打开。'))
  }
  return window.studio.call(method, payload)
}

export function asset(path) {
  return path && window.studio?.asset ? window.studio.asset(path) : undefined
}

export function fileName(path) {
  return (
    String(path || '')
      .split(/[\\/]/)
      .pop() || ''
  )
}

export function isVideo(path) {
  return /\.(mp4|mov|m4v|webm|mkv|avi|ogv)(?:$|[?#])/i.test(path || '')
}

export function duration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function shortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function mediaSeconds(scene) {
  return Math.max(0.1, Number(scene?.seconds) || 1)
}

export function shortScenes(scenes) {
  // 与桌面导出一致：旧工程没有勾选记录，默认取前六成镜头。
  if (scenes.some((scene) => typeof scene.short === 'boolean')) {
    return scenes.filter((scene) => scene.short !== false)
  }
  return scenes.slice(0, Math.ceil(scenes.length * 0.6))
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  )
}

export function Button({ icon: Icon, children, tone = '', className = '', ...props }) {
  return (
    <button type="button" className={`button ${tone} ${className}`} {...props}>
      {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Empty({ icon: Icon = FolderOpen, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Modal({ title, subtitle, children, onClose, wide = false, pending = false, className = '' }) {
  const id = useId()
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  const pendingRef = useRef(pending)
  closeRef.current = onClose
  pendingRef.current = pending
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const focusable = () =>
      [
        ...dialog.querySelectorAll(
          'button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], summary, [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length)
    const initial = dialog.querySelector('[data-focus]') || focusable()[0]
    initial?.focus()
    const keyboard = (event) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0],
        last = items.at(-1)
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('keydown', keyboard)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="modal-heading">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon={X} label="关闭对话框" onClick={onClose} disabled={pending} />
        </div>
        {children}
      </section>
    </div>
  )
}

export function ErrorLine({ message }) {
  return message ? (
    <div className="error-line" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{message}</span>
    </div>
  ) : null
}

export function Field({ label, hint, children, className = '' }) {
  const id = useId()
  const bind = (child) => {
    if (!React.isValidElement(child)) return child
    if (['input', 'textarea', 'select'].includes(child.type)) {
      return React.cloneElement(child, { id, 'aria-describedby': hint ? id + '-hint' : undefined })
    }
    if (typeof child.type === 'string' && child.props.children) {
      return React.cloneElement(child, {}, React.Children.map(child.props.children, bind))
    }
    return child
  }
  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {React.Children.map(children, bind)}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  )
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-seal" aria-hidden="true">坊</span>
      <strong>创作工坊</strong>
    </div>
  )
}
