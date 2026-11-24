import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Copy,
  FileImage,
  FileText,
  Film,
  Headphones,
  ImagePlus,
  Layers,
  Maximize2,
  Mic,
  Minimize2,
  MonitorPlay,
  Pause,
  Pencil,
  Play,
  Plus,
  ScanLine,
  SlidersHorizontal,
  Trash2,
  Video,
  Wand2,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  asset,
  Button,
  duration,
  Empty,
  Field,
  fileName,
  IconButton,
  isVideo,
  kindLabels,
  mediaSeconds,
  Modal,
} from './shared'

function Thumbnail({ scene }) {
  if (scene.poster || (scene.media && !isVideo(scene.media))) {
    return <img src={asset(scene.poster || scene.media)} alt="" draggable="false" />
  }
  if (scene.media)
    return <video src={asset(scene.media)} muted playsInline preload="metadata" tabIndex={-1} />
  return (
    <span className="thumb-empty">
      <FileImage size={25} strokeWidth={1.4} />
    </span>
  )
}

function MediaFrame({ scene, elapsed, playing, mediaError, onMediaError }) {
  const video = useRef(null)
  const audio = useRef(null)
  const syncTo = useRef(elapsed)
  syncTo.current = elapsed
  useEffect(() => {
    for (const el of [video.current, audio.current]) {
      if (!el) continue
      if (!playing) {
        el.pause()
        continue
      }
      if (Number.isFinite(el.duration) && el.currentTime >= el.duration - 0.03) continue
      el.play().catch((error) => {
        if (error.name !== 'AbortError')
          onMediaError(
            error.name === 'NotAllowedError' ? '请再次点播放以启用声音。' : '无法播放媒体，请检查源文件。',
          )
      })
    }
  }, [playing, scene.id, scene.media, scene.audio])
  useEffect(() => {
    for (const el of [video.current, audio.current]) {
      if (!el || !Number.isFinite(el.duration)) continue
      const target = Math.min(el.duration, elapsed)
      if (Math.abs(el.currentTime - target) > (playing ? 0.65 : 0.04)) el.currentTime = target
    }
  }, [elapsed, playing])
  const onReady = (e) => {
    const el = e.currentTarget
    if (Number.isFinite(el.duration) && syncTo.current > 0)
      el.currentTime = Math.min(el.duration, syncTo.current)
    if (playing) el.play().catch(() => {})
  }
  const zoom = 1 + ((Number(scene.zoom) || 1) - 1) * Math.min(1, elapsed / mediaSeconds(scene))
  return (
    <div className="frame-art">
      {scene.media ? (
        <div className="frame-zoom" style={{ transform: `scale(${zoom})` }}>
          {isVideo(scene.media) ? (
            <video
              key={scene.media}
              ref={video}
              src={asset(scene.media)}
              poster={asset(scene.poster)}
              muted={Boolean(scene.audio)}
              playsInline
              preload="metadata"
              onLoadedMetadata={onReady}
              onError={() => onMediaError('画面读取失败，请在分镜属性中重新导入素材。')}
            />
          ) : (
            <img
              key={scene.media}
              src={asset(scene.media)}
              alt={scene.title || '当前分镜画面'}
              onError={() => onMediaError('画面读取失败，请在分镜属性中重新导入素材。')}
            />
          )}
        </div>
      ) : (
        <div className="missing-frame">
          <ImagePlus size={34} strokeWidth={1.25} />
          <span>此分镜还没有画面</span>
        </div>
      )}
      {scene.audio && (
        <audio
          key={scene.audio}
          ref={audio}
          src={asset(scene.audio)}
          preload="metadata"
          onLoadedMetadata={onReady}
          onError={() => onMediaError('旁白读取失败，请重新导入或生成配音。')}
        />
      )}
      {mediaError && (
        <div className="media-error" role="status">
          {mediaError}
        </div>
      )}
    </div>
  )
}

function Monitor({ scenes, index, setSceneId }) {
  const scene = scenes[index]
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [large, setLarge] = useState(false)
  const nextSeek = useRef(0)
  const elapsedRef = useRef(0)
  const frame = useRef(null)
  const total = scenes.reduce((v, item) => v + mediaSeconds(item), 0)
  const offset = scenes.slice(0, index).reduce((v, item) => v + mediaSeconds(item), 0)
  const length = mediaSeconds(scene)
  function changeTime(value) {
    elapsedRef.current = value
    setElapsed(value)
  }
  useLayoutEffect(() => {
    changeTime(nextSeek.current)
    nextSeek.current = 0
    setMediaError('')
  }, [scene?.id, scene?.media, scene?.audio])
  useEffect(() => {
    const sync = () => setLarge(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    if (!playing || !scene) return
    const started = performance.now() - elapsedRef.current * 1000
    let id
    const update = () => {
      const t = (performance.now() - started) / 1000
      if (t >= length) {
        if (index + 1 < scenes.length) {
          nextSeek.current = 0
          setSceneId(scenes[index + 1].id)
        } else {
          changeTime(length)
          setPlaying(false)
        }
        return
      }
      changeTime(t)
      id = requestAnimationFrame(update)
    }
    id = requestAnimationFrame(update)
    return () => cancelAnimationFrame(id)
  }, [playing, scene?.id, length, index, scenes.length, setSceneId])
  function seek(value) {
    const target = Math.max(0, Math.min(total, value))
    let start = 0
    let pos = 0
    while (pos < scenes.length - 1 && start + mediaSeconds(scenes[pos]) <= target)
      start += mediaSeconds(scenes[pos++])
    setPlaying(false)
    if (pos === index) changeTime(target - start)
    else {
      nextSeek.current = target - start
      setSceneId(scenes[pos].id)
    }
  }
  function toggle() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (index === scenes.length - 1 && elapsed >= length - 0.03) {
      if (index) {
        nextSeek.current = 0
        setSceneId(scenes[0].id)
      } else changeTime(0)
    }
    setPlaying(true)
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await frame.current?.requestFullscreen()
    } catch {
      setMediaError('当前窗口无法进入全屏。')
    }
  }
  const current = Math.min(total, offset + elapsed)
  return (
    <section
      className="monitor panel"
      ref={frame}
      aria-label="画面预览"
      onKeyDown={(e) => {
        if (scene && e.target === e.currentTarget && e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
      tabIndex={0}
    >
      <div className="panel-header">
        <h2>
          <MonitorPlay />
          画面预览
        </h2>
        <div className="panel-tools">
          <span className="ratio">16:9</span>
          <IconButton
            icon={large ? Minimize2 : Maximize2}
            label={large ? '退出全屏' : '全屏预览'}
            onClick={fullscreen}
          />
        </div>
      </div>
      {scene ? (
        <MediaFrame
          scene={scene}
          elapsed={elapsed}
          playing={playing}
          mediaError={mediaError}
          onMediaError={setMediaError}
        />
      ) : (
        <div className="frame-art">
          <div className="missing-frame">
            <Film size={38} strokeWidth={1.3} />
            <span>添加第一个分镜后即可预览</span>
          </div>
        </div>
      )}
      <div className="transport">
        <button
          type="button"
          className="play-button"
          title={playing ? '暂停' : '播放分镜'}
          aria-label={playing ? '暂停预览' : '播放预览'}
          disabled={!scene}
          onClick={toggle}
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <span className="play-time">
          <b>{duration(current)}</b>
          <span> / {duration(total)}</span>
        </span>
        <div className="scrubber">
          <div className="scrub-sections" aria-hidden="true">
            {scenes.map((item) => (
              <i key={item.id} style={{ flexGrow: mediaSeconds(item) }} />
            ))}
          </div>
          <input
            type="range"
            aria-label="预览进度"
            aria-valuetext={`${duration(current)}，共 ${duration(total)}`}
            min="0"
            max={total || 1}
            step="0.05"
            value={current}
            disabled={!scene}
            style={{ '--progress': `${total ? (current / total) * 100 : 0}%` }}
            onChange={(e) => seek(+e.target.value)}
          />
        </div>
        <span className="monitor-count" title="当前分镜 / 分镜总数">
          {String(scene ? index + 1 : 0).padStart(2, '0')}
          <i>/</i>
          {String(scenes.length).padStart(2, '0')}
        </span>
      </div>
    </section>
  )
}

function Timeline({ scenes, index, setSceneId, onAdd, onMove }) {
  return (
    <section className="timeline panel" aria-label="分镜序列">
      <div className="panel-header">
        <h2>
          <Layers />
          分镜序列<span className="count">{scenes.length}</span>
        </h2>
        <div className="panel-tools">
          <IconButton
            icon={ArrowLeft}
            label="前移当前分镜"
            disabled={index < 1}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon={ArrowRight}
            label="后移当前分镜"
            disabled={index < 0 || index >= scenes.length - 1}
            onClick={() => onMove(1)}
          />
          <Button icon={Plus} className="compact" onClick={onAdd}>
            添加分镜
          </Button>
        </div>
      </div>
      <div className="filmstrip" aria-label="选择分镜">
        {scenes.map((scene, i) => (
          <button
            type="button"
            className={`shot ${index === i ? 'selected' : ''}`}
            aria-pressed={index === i}
            key={scene.id}
            onClick={() => setSceneId(scene.id)}
            aria-label={`分镜 ${i + 1}，${scene.title || '未命名'}，${scene.seconds} 秒`}
          >
            <span className="shot-picture">
              <Thumbnail scene={scene} />
              <span className="shot-number">{String(i + 1).padStart(2, '0')}</span>
              <span className="shot-length">{duration(scene.seconds)}</span>
            </span>
            <span className="shot-title">{scene.title || '未命名分镜'}</span>
          </button>
        ))}
        {!scenes.length && (
          <button type="button" className="shot-add" onClick={onAdd}>
            <Plus size={20} />
            添加分镜
          </button>
        )}
      </div>
    </section>
  )
}

function MediaPath({ label, path, icon: Icon, onChoose, onClear, accept }) {
  return (
    <div className="media-path">
      <span className="path-icon">
        <Icon size={16} />
      </span>
      <div>
        <small>{label}</small>
        <strong title={path}>{fileName(path) || accept}</strong>
      </div>
      <button className="text-btn" type="button" onClick={onChoose}>
        {path ? '替换' : '导入'}
      </button>
      {path && <IconButton icon={X} label={`移除${label}`} onClick={onClear} />}
    </div>
  )
}

function Inspector({ scene, index, update, importFile, generateVoice, onDuplicate, onRemove, openTools }) {
  const [tab, setTab] = useState('text')
  const [remove, setRemove] = useState(false)
  useEffect(() => setRemove(false), [scene?.id])
  if (!scene)
    return (
      <section className="inspector panel">
        <div className="panel-header">
          <h2>
            <SlidersHorizontal />
            分镜属性
          </h2>
        </div>
        <Empty title="尚未选择分镜">添加分镜后可编辑旁白和画面。</Empty>
      </section>
    )
  return (
    <section className="inspector panel">
      <div className="panel-header">
        <h2>
          <SlidersHorizontal />
          分镜属性
        </h2>
        <span className="focus-tag">
          <i />
          {String(index + 1).padStart(2, '0')} 号分镜
        </span>
      </div>
      <div className="inspector-tabs" role="group" aria-label="分镜属性分类">
        <button type="button" aria-pressed={tab === 'text'} onClick={() => setTab('text')}>
          <FileText size={15} />
          内容与旁白
        </button>
        <button type="button" aria-pressed={tab === 'media'} onClick={() => setTab('media')}>
          <Film size={15} />
          媒体素材
        </button>
      </div>
      <div className="inspector-body">
        {tab === 'text' ? (
          <>
            <Field label="分镜标题">
              <input
                value={scene.title || ''}
                placeholder="为这个镜头命名"
                onChange={(e) => update({ title: e.target.value })}
              />
            </Field>
            <Field
              label={
                <>
                  <span>旁白文稿</span>
                  <small>{(scene.text || '').length} 字</small>
                </>
              }
              hint={
                scene.audio
                  ? '已关联配音。修改旁白后需重新配音。'
                  : '尚未关联配音。可生成新配音或在媒体素材中导入。'
              }
            >
              <textarea
                className="script-input"
                data-testid="scene-text"
                value={scene.text || ''}
                placeholder="写下这个分镜的旁白…"
                onChange={(e) => update({ text: e.target.value })}
              />
            </Field>
            <Button icon={Wand2} tone="voice" onClick={generateVoice} disabled={!scene.text?.trim()}>
              生成分镜配音
            </Button>
            <div className="scene-controls">
              <Field
                label={
                  <>
                    <Clock3 size={13} />
                    时长
                  </>
                }
              >
                <span className="input-unit">
                  <input
                    aria-label="分镜时长（秒）"
                    key={`t-${scene.id}-${scene.seconds}`}
                    type="number"
                    min="0.5"
                    max="600"
                    step="0.01"
                    defaultValue={scene.seconds || 1}
                    onBlur={(e) => {
                      const n = +e.target.value
                      if (n >= 0.5 && n <= 600) {
                        if (n !== scene.seconds) update({ seconds: n })
                      } else e.target.value = scene.seconds || 1
                    }}
                  />
                  <i>秒</i>
                </span>
              </Field>
              <Field
                label={
                  <>
                    <ZoomIn size={13} />
                    推镜倍率
                  </>
                }
              >
                <span className="input-unit">
                  <input
                    aria-label="推镜倍率"
                    key={`z-${scene.id}-${scene.zoom}`}
                    type="number"
                    min="1"
                    max="2.5"
                    step="0.05"
                    defaultValue={scene.zoom || 1}
                    onBlur={(e) => {
                      const n = +e.target.value
                      if (n >= 1 && n <= 2.5) {
                        if (n !== scene.zoom) update({ zoom: n })
                      } else e.target.value = scene.zoom || 1
                    }}
                  />
                  <i>×</i>
                </span>
              </Field>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={scene.short !== false}
                onChange={(e) => update({ short: e.target.checked })}
              />
              <span>纳入精简版</span>
            </label>
            <details className="detail-row">
              <summary>图文补充稿</summary>
              <Field label="此段文章正文">
                <textarea
                  rows={3}
                  value={scene.notes || ''}
                  placeholder="可补充视频里没有展开的内容"
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </Field>
            </details>
          </>
        ) : (
          <>
            <MediaPath
              label="分镜画面"
              path={scene.media}
              icon={Video}
              accept="图片或视频"
              onChoose={() => importFile('media', 'media')}
              onClear={() => update({ media: '', poster: '' })}
            />
            <MediaPath
              label="旁白音轨"
              path={scene.audio}
              icon={Headphones}
              accept="音频文件"
              onChoose={() => importFile('audio', 'audio')}
              onClear={() => update({ audio: '' })}
            />
            {scene.audio && (
              <audio
                className="audio-preview"
                controls
                preload="metadata"
                src={asset(scene.audio)}
                aria-label="试听分镜配音"
              />
            )}
            <Button icon={Wand2} tone="voice" onClick={generateVoice} disabled={!scene.text?.trim()}>
              生成分镜配音
            </Button>
            <Button icon={ScanLine} onClick={openTools}>
              录屏与 OpenScreen 工程
            </Button>
          </>
        )}
        <div className="inspector-footer">
          <button type="button" className="text-btn muted" onClick={onDuplicate}>
            <Copy size={14} />
            复制分镜
          </button>
          <IconButton
            icon={Trash2}
            label="删除当前分镜"
            className="danger-icon"
            onClick={() => setRemove(true)}
          />
        </div>
      </div>
      {remove && (
        <Modal
          title="删除这个分镜？"
          subtitle={scene.title || '未命名分镜'}
          onClose={() => setRemove(false)}
        >
          <p className="dialog-note">项目保存后，分镜会从序列中移除。已导入的素材文件保留在项目中。</p>
          <div className="dialog-actions">
            <Button onClick={() => setRemove(false)}>取消</Button>
            <Button
              tone="danger"
              icon={Trash2}
              onClick={() => {
                setRemove(false)
                onRemove()
              }}
            >
              删除分镜
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}

export default function Editor({
  project,
  sceneId,
  setSceneId,
  changeScene,
  onAdd,
  onDuplicate,
  onRemove,
  onMove,
  importFile,
  generateVoice,
  openTools,
  editProject,
}) {
  const scenes = project.scenes || []
  const index = scenes.findIndex((item) => item.id === sceneId)
  const scene = scenes[index]
  const total = scenes.reduce((n, item) => n + mediaSeconds(item), 0)
  return (
    <div className="editor-page">
      <div className="project-intro">
        <div className="project-type">
          <span className="type-symbol">
            {project.kind === 'brief' ? <Mic size={13} /> : <MonitorPlay size={13} />}
          </span>
          {kindLabels[project.kind] || '创作项目'}
        </div>
        <div className="title-line">
          <h1>{project.name || '未命名项目'}</h1>
          <IconButton icon={Pencil} label="编辑项目名称与来源" onClick={editProject} />
        </div>
        <div className="project-meta">
          <span>
            <Layers size={14} />
            {scenes.length} 个分镜
          </span>
          <i />
          <span>
            <Clock3 size={14} />
            {duration(total)}
          </span>
          <i />
          <span>
            <Film size={14} />
            横屏 16:9
          </span>
        </div>
      </div>
      <div className="edit-grid">
        <div className="director">
          <Monitor scenes={scenes} index={index} setSceneId={setSceneId} />
          <Timeline scenes={scenes} index={index} setSceneId={setSceneId} onAdd={onAdd} onMove={onMove} />
        </div>
        <Inspector
          scene={scene}
          index={index}
          update={changeScene}
          importFile={importFile}
          generateVoice={generateVoice}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          openTools={openTools}
        />
      </div>
    </div>
  )
}
