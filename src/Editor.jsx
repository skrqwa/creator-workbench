import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, ChevronDown,
  CircleAlert, Clock3, Copy, FileImage, FileText, Film, GripVertical,
  Headphones, ImagePlus, Images, Maximize2, Mic, Minimize2, MonitorPlay, MoreHorizontal,
  Pause, Pencil, Play, Plus, RefreshCw, ScanLine, Smartphone, Trash2, Video, X, ZoomIn,
} from 'lucide-react'
import {
  asset, Button, duration, Field, fileName, IconButton, isVideo, kindLabels, mediaSeconds, Modal, shortScenes,
} from './shared'
import { getPlatformReadiness } from './publish-readiness'
import { PlatformMark } from './Publishing'

const shapes = [
  { id: 'wide', label: '横屏视频', icon: Film },
  { id: 'short', label: '竖屏短片', icon: Smartphone },
  { id: 'cards', label: '小红书图卡', icon: Images },
  { id: 'article', label: '长文', icon: FileText },
]
const number = (value) => String(value).padStart(2, '0')
const words = (value) => Array.from(String(value ?? '').replace(/\s/gu, '')).length
const shortenRate = 1.08

function Thumbnail({ scene, still, alt = '' }) {
  const picture = still || scene?.poster || (!isVideo(scene?.media) && scene?.media)
  if (picture) return <img src={asset(picture)} alt={alt} draggable="false" />
  if (scene?.media)
    return <video src={asset(scene.media)} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />
  return <span className="studio-thumb-empty" aria-hidden="true"><FileImage size={23} /></span>
}

function glyphWidth(value) {
  return [...value].reduce((sum, c) => sum + (/\s/.test(c) ? 0.32 : /[!-~]/.test(c) ? 0.58 : 1), 0)
}

// 预排采用导出器的中西文宽度、换行与分卡规则，以便长稿在导出前也能逐张查看。
function wrapLines(value, limit) {
  const lines = []
  let line = ''
  let width = 0
  for (const token of (value || '').match(/[A-Za-z0-9]+(?:[.’'-][A-Za-z0-9]+)*|[^\r]/gu) || []) {
    if (token === '\n') {
      if (line.trim()) lines.push(line.trim())
      line = ''
      width = 0
      continue
    }
    const parts = glyphWidth(token) > limit ? [...token] : [token]
    for (const part of parts) {
      const size = glyphWidth(part)
      if (line && width + size > limit) {
        lines.push(line.trimEnd())
        line = ''
        width = 0
      }
      if (line || part.trim()) {
        line += part
        width += size
      }
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

function cardPages(scenes, files) {
  const pages = []
  scenes.forEach((scene, index) => {
    const lines = wrapLines(scene.text, 21)
    const size = 7 - Math.min(3, wrapLines(scene.title, 15).length)
    for (let start = 0; start < Math.max(1, lines.length); start += size) {
      pages.push({ scene, index, lines: lines.slice(start, start + size), file: files?.[pages.length] })
    }
  })
  return pages
}

function cueSheet(scene, seconds) {
  if (!scene?.text) return []
  const cues = scene.cues
  if (scene.audio && scene.audio === scene.cueAudio && Array.isArray(cues) && cues.length &&
      cues.every((c, i) => typeof c?.text === 'string' && Number.isFinite(c.start) && Number.isFinite(c.end) &&
        c.start >= (i ? cues[i - 1].end - 0.005 : 0) && c.end > c.start && c.end <= seconds + 0.15) &&
      cues.map(c => c.text).join('').trim() === scene.text.trim()) return cues

  const phrases = scene.text.match(/[^，。！？；、,.!?;\n]+[，。！？；、,.!?;]*/gu) || [scene.text]
  const chunks = phrases.flatMap(phrase => wrapLines(phrase.trim(), 25))
  const weights = chunks.map(chunk => Math.max(2.5, glyphWidth(chunk)))
  const total = weights.reduce((sum, width) => sum + width, 0)
  let end = 0
  return chunks.map((text, i) => {
    const start = end
    end += seconds * weights[i] / total
    return { start, end, text }
  })
}

function sceneLength(scene, portrait, audioLengths) {
  if (!scene) return 0
  const sound = audioLengths.get(scene.audio) || 0
  const full = Math.max(mediaSeconds(scene), sound)
  const seconds = portrait && sound ? Math.min(full, sound + 0.16) : full
  // 快剪会加速并按 24 帧整帧取整；尚未读到音频元数据时按镜头时长预估。
  return Math.ceil(seconds / (portrait ? shortenRate : 1) * 24) / 24
}

function VoiceState({ scene }) {
  const ready = Boolean(scene.audio)
  const Icon = ready ? CheckCircle2 : CircleAlert
  return <span className={'studio-voice-state' + (ready ? '' : ' pending')}>
    <Icon size={13} aria-hidden="true" />{ready ? '已配音' : '待配音'}
  </span>
}

function VoiceStrip({ scene, length, onLength, generate, playingPreview, pausePreview }) {
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const label = useId()
  useEffect(() => {
    if (playingPreview) audio.current?.pause()
  }, [playingPreview])
  async function toggle() {
    const el = audio.current
    if (!el) return
    if (!el.paused) return el.pause()
    pausePreview()
    if (el.ended) el.currentTime = 0
    try {
      await el.play()
      setError('')
    } catch (e) {
      if (e.name !== 'AbortError') setError('无法试听，请检查本镜音轨。')
    }
  }
  return <>
    <div className="studio-voice">
      {scene.audio && <audio ref={audio} src={asset(scene.audio)} preload="metadata"
        onLoadedMetadata={e => onLength(scene.audio, e.currentTarget.duration)}
        onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onError={() => setError('旁白音轨读取失败，可在媒体素材中重新导入。')} />}
      <button type="button" className="studio-round" disabled={!scene.audio} onClick={toggle}
        aria-label={playing ? '暂停试听' : '试听本镜配音'}>
        {playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
      </button>
      {scene.audio ? <>
        <label htmlFor={label} className="studio-sr">本镜配音试听进度</label>
        <input id={label} className="studio-audio-range" type="range" min="0" max={length || 1}
          step="0.01" disabled={!length} value={Math.min(elapsed, length || 0)}
          aria-valuetext={duration(elapsed) + '，共 ' + duration(length)}
          style={{ '--played': (length ? elapsed / length * 100 : 0) + '%' }}
          onChange={e => { audio.current.currentTime = Number(e.target.value); setElapsed(Number(e.target.value)) }} />
        <span className="studio-time tabular-nums"><b>{duration(elapsed)}</b> / {length ? duration(length) : '…'}</span>
      </> : <span className="studio-voice-empty">尚未添加音轨</span>}
      <button type="button" className="studio-text" disabled={!scene.text?.trim()} onClick={generate}>
        <RefreshCw size={13} aria-hidden="true" />{scene.audio ? '重新配音' : '生成配音'}
      </button>
    </div>
    {error && <p className="studio-error" role="status">{error}</p>}
  </>
}

function MediaPath({ label, path, icon: Icon, accept, onChoose, onClear }) {
  return <div className="studio-media-file">
    <Icon size={18} aria-hidden="true" />
    <div><small>{label}</small><strong title={path}>{fileName(path) || accept}</strong></div>
    <button type="button" className="studio-text" onClick={onChoose}>{path ? '替换' : '导入'}</button>
    {path && <IconButton icon={X} label={'移除' + label} onClick={onClear} />}
  </div>
}

function ShotNumber({ label, value, min, max, unit, apply }) {
  return <Field label={label}>
    <span className="studio-number-field">
      <input key={value} type="number" min={min} max={max} step="any" defaultValue={value}
        onBlur={e => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n) && n >= min && n <= max) {
            if (n !== Number(value)) apply(n)
          } else e.target.value = String(value)
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      <span aria-hidden="true">{unit}</span>
    </span>
  </Field>
}

function StoryEditor({
  scene, index, count, included, audioLength, onLength, playingPreview, pausePreview,
  update, generate, settings, openTools, importFile, onMove, onDuplicate, onRemove,
}) {
  const [panel, setPanel] = useState('')
  const [remove, setRemove] = useState(false)
  const group = useId()
  const wordsInScript = words(scene.text)
  const toggle = (id) => { pausePreview(); setPanel(current => current === id ? '' : id) }
  const panelProps = (id) => ({ 'aria-expanded': panel === id, 'aria-controls': group + '-details', onClick: () => toggle(id) })
  const voiceName = fileName(settings?.voiceTemplate).replace(/\.[^.]+$/, '')
  return <>
    <div className="studio-story-art">
      <div className="studio-thumb active">
        <Thumbnail scene={scene} />
        <div className="studio-thumb-caption tabular-nums">
          <span>{scene.zoom || 1}×</span><span>{duration(scene.seconds)}</span>
        </div>
      </div>
      <div className="studio-art-actions">
        <button type="button" {...panelProps('media')}><Film size={13} aria-hidden="true" />媒体素材</button>
        <IconButton icon={MoreHorizontal} label="排序、复制或删除分镜" {...panelProps('actions')} />
      </div>
    </div>
    <div className="studio-story-copy">
      <div className="studio-active-heading">
        <label className="studio-index tabular-nums" htmlFor={group + '-title'}>
          <span className="studio-sr">分镜标题 </span>{number(index + 1)}
        </label>
        <input id={group + '-title'} className="studio-title-input" aria-label="分镜标题"
          value={scene.title || ''} maxLength={500} placeholder="给这个镜头起个名字" title={scene.title}
          onChange={e => update({ title: e.target.value })} onFocus={pausePreview} />
        <VoiceState scene={scene} />
      </div>
      <div className="studio-script">
        <label htmlFor={group + '-script'} className="studio-sr">第 {index + 1} 镜旁白文稿</label>
        <textarea id={group + '-script'} data-testid="scene-text" maxLength={40000} rows={2}
          value={scene.text || ''} placeholder="写下这个镜头的旁白…" onFocus={pausePreview}
          onChange={e => update({ text: e.target.value })} />
        <div className="studio-script-foot"><span>旁白文稿</span>
          <span className="tabular-nums">{wordsInScript} 字 · 约 {Math.ceil(wordsInScript / 4)} 秒</span>
        </div>
      </div>
      <VoiceStrip key={scene.audio || 'silent'} scene={scene} length={audioLength} onLength={onLength}
        generate={generate} playingPreview={playingPreview} pausePreview={pausePreview} />
    </div>
    <div className="studio-controls tabular-nums" role="group" aria-label="当前镜头参数">
      <button type="button" title={voiceName ? '更换配音模板 · ' + voiceName : '选择本机配音模板'}
        onClick={() => openTools('voice')}><Mic size={14} aria-hidden="true" />
        <span className="studio-voice-name">{voiceName || '选择音色'}</span><ChevronDown size={11} aria-hidden="true" />
      </button>
      <button type="button" {...panelProps('timing')}><ZoomIn size={14} aria-hidden="true" />推镜 {scene.zoom || 1}×</button>
      <button type="button" {...panelProps('timing')}><Clock3 size={14} aria-hidden="true" />{scene.seconds} 秒</button>
      <button type="button" aria-pressed={included} aria-label="纳入竖屏短片" onClick={() => update({ short: !included })}>
        {included ? <Check size={14} aria-hidden="true" /> : <Smartphone size={14} aria-hidden="true" />}竖版
      </button>
      <button type="button" {...panelProps('article')}><FileText size={14} aria-hidden="true" />图文补稿</button>
    </div>
    <div className="studio-detail" id={group + '-details'} hidden={!panel}>
      {panel === 'media' && <>
        <MediaPath label="分镜画面" path={scene.media} icon={Video} accept="图片或视频"
          onChoose={() => importFile('media', 'media')} onClear={() => update({ media: '', poster: '' })} />
        <MediaPath label="旁白音轨" path={scene.audio} icon={Headphones} accept="音频文件"
          onChoose={() => importFile('audio', 'audio')} onClear={() => update({ audio: '' })} />
        <Button className="compact" icon={ScanLine} onClick={() => openTools('recording')}>录屏与导入 OpenScreen 工程</Button>
      </>}
      {panel === 'timing' && <div className="studio-timing-fields">
        <ShotNumber label="推镜倍率" value={scene.zoom || 1} min={1} max={3} unit="×" apply={zoom => update({ zoom })} />
        <ShotNumber label="分镜时长" value={scene.seconds || 1} min={0.5} max={600} unit="秒" apply={seconds => update({ seconds })} />
        <Button icon={Headphones} className="compact" disabled={!audioLength || audioLength > 600}
          onClick={() => update({ seconds: Math.max(0.5, Math.round(audioLength * 100) / 100) })}>采用配音时长</Button>
      </div>}
      {panel === 'article' && <Field label="图文补充稿" hint="本镜画面会随正文一起导出。">
        <textarea rows={3} value={scene.notes || ''} placeholder="补充视频里没有展开的内容…"
          onChange={e => update({ notes: e.target.value })} />
      </Field>}
      {panel === 'actions' && <div className="studio-shot-actions">
        <Button icon={ArrowUp} className="compact" disabled={index === 0} onClick={() => onMove(-1)}>上移分镜</Button>
        <Button icon={ArrowDown} className="compact" disabled={index === count - 1} onClick={() => onMove(1)}>下移分镜</Button>
        <Button icon={Copy} className="compact" onClick={onDuplicate}>复制分镜</Button>
        <Button icon={Trash2} className="compact" tone="danger" onClick={() => setRemove(true)}>删除分镜</Button>
      </div>}
    </div>
    {remove && <Modal title="删除这个分镜？" subtitle={scene.title} onClose={() => setRemove(false)}>
      <p className="dialog-note">保存项目后，此分镜会从序列中移除。导入的素材仍保存在项目文件夹。</p>
      <div className="dialog-actions">
        <Button onClick={() => setRemove(false)}>取消</Button>
        <Button icon={Trash2} tone="danger" onClick={() => { setRemove(false); onRemove() }}>删除分镜</Button>
      </div>
    </Modal>}
  </>
}

function MediaFrame({ scene, elapsed, sourceTime, length, rate, playing, caption, onError }) {
  const video = useRef(null)
  const audio = useRef(null)
  const latest = useRef(0)
  latest.current = sourceTime
  useEffect(() => {
    for (const el of [video.current, audio.current]) {
      if (!el) continue
      el.playbackRate = rate
      if (!playing) { el.pause(); continue }
      if (Number.isFinite(el.duration) && el.currentTime >= el.duration - 0.03) continue
      el.play().catch(error => {
        if (error.name !== 'AbortError') onError('无法播放媒体，请检查本镜素材或重新点击播放。')
      })
    }
  }, [playing, rate, scene.id, scene.media, scene.audio, onError])
  useEffect(() => {
    for (const el of [video.current, audio.current]) {
      if (!el || !Number.isFinite(el.duration)) continue
      const target = Math.min(el.duration, sourceTime)
      if (Math.abs(el.currentTime - target) > (playing ? 0.5 : 0.04)) el.currentTime = target
    }
  }, [sourceTime, playing])

  function ready(e) {
    const el = e.currentTarget
    el.playbackRate = rate
    if (Number.isFinite(el.duration)) el.currentTime = Math.min(el.duration, latest.current)
    if (playing) el.play().catch(() => {})
  }
  const endZoom = Number(scene.zoom) || 1
  const fraction = Math.min(1, elapsed / Math.max(length, 0.01))
  const zoom = 1 + (endZoom - 1) * (1 - Math.cos(Math.PI * fraction)) / 2
  return <div className={'studio-movie-frame' + (rate > 1 ? ' portrait' : '')}>
    <div className="studio-video-field">
      {scene.media ? <>
        <div className="studio-frame-zoom" style={{ transform: 'scale(' + zoom + ')' }}>
          {isVideo(scene.media)
            ? <video key={scene.media} ref={video} src={asset(scene.media)} poster={asset(scene.poster)}
                playsInline muted={Boolean(scene.audio)} preload="metadata" onLoadedMetadata={ready}
                aria-label={scene.title || '当前分镜画面'} onError={() => onError('画面读取失败，请重新导入素材。')} />
            : <img src={asset(scene.media)} alt={scene.title || '当前分镜画面'}
                onError={() => onError('画面读取失败，请重新导入素材。')} />}
        </div>
        {!playing && endZoom > 1 && <div className="studio-focus-guide" aria-hidden="true"
          style={{ width: (zoom / endZoom * 100) + '%', height: (zoom / endZoom * 100) + '%' }}>
          <i /><i /><i /><i /><span className="tabular-nums">推镜 {endZoom}×</span>
        </div>}
      </> : <div className="studio-stage-empty"><ImagePlus size={30} aria-hidden="true" />本镜还没有画面</div>}
    </div>
    {scene.audio && <audio key={scene.audio} ref={audio} src={asset(scene.audio)}
      preload="metadata" onLoadedMetadata={ready} onError={() => onError('配音读取失败，请重新导入或生成配音。')} />}
    {caption && <span className="studio-caption">{caption}</span>}
  </div>
}

function ChapterPlayer({ project, sceneId, setSceneId, portrait, shortList, sounds, playing, setPlaying }) {
  const list = portrait ? shortList : project.scenes
  const index = list.findIndex(s => s.id === sceneId)
  const scene = list[index]
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [large, setLarge] = useState(false)
  const box = useRef(null)
  const nextSeek = useRef(0)
  const time = useRef(0)
  const seekLabel = useId()
  const lengths = useMemo(() => list.map(s => sceneLength(s, portrait, sounds)), [list, portrait, sounds])
  const length = lengths[index] || 0
  const total = lengths.reduce((sum, n) => sum + n, 0)
  const offset = index > 0 ? lengths.slice(0, index).reduce((sum, n) => sum + n, 0) : 0
  const current = Math.min(total, offset + elapsed)
  const sound = sounds.get(scene?.audio) || 0
  const cues = useMemo(() => cueSheet(scene, sound || mediaSeconds(scene)), [scene, sound])
  const rate = portrait ? shortenRate : 1
  const sourceTime = elapsed * rate
  const cue = cues.find(c => sourceTime >= c.start && sourceTime < c.end)
  const changeTime = useCallback(value => { time.current = value; setElapsed(value) }, [])

  useLayoutEffect(() => {
    changeTime(nextSeek.current)
    nextSeek.current = 0
    setError('')
  }, [scene?.id, scene?.media, scene?.audio, portrait, changeTime])
  useEffect(() => {
    const sync = () => setLarge(document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    if (!playing || !scene) return
    const started = performance.now() - time.current * 1000
    let frame
    function tick() {
      const t = (performance.now() - started) / 1000
      if (t >= length) {
        if (list[index + 1]) setSceneId(list[index + 1].id)
        else { changeTime(length); setPlaying(false) }
        return
      }
      changeTime(t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, list, scene, index, length, setSceneId, setPlaying, changeTime])

  function seek(value) {
    const target = Math.max(0, Math.min(total, value))
    let start = 0
    let pos = 0
    while (pos < list.length - 1 && start + lengths[pos] <= target) start += lengths[pos++]
    setPlaying(false)
    if (pos === index) changeTime(target - start)
    else if (list[pos]) {
      nextSeek.current = target - start
      setSceneId(list[pos].id)
    }
  }
  function toggle() {
    if (!list.length) return
    if (playing) return setPlaying(false)
    if (!scene || (index === list.length - 1 && elapsed >= length - 0.03)) {
      if (index === 0) changeTime(0)
      else { nextSeek.current = 0; setSceneId(list[0].id) }
    }
    setPlaying(true)
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await box.current?.requestFullscreen()
    } catch {
      setError('当前窗口无法进入全屏。')
    }
  }
  return <section ref={box} className="studio-screen" aria-label="视频实时预览" tabIndex={0}
    onKeyDown={e => { if (e.target === e.currentTarget && e.key === ' ') { e.preventDefault(); toggle() } }}>
    <div className="studio-stage">
      {scene
        ? <MediaFrame key={scene.id} scene={scene} elapsed={elapsed} sourceTime={sourceTime} length={length} rate={rate}
            playing={playing} caption={cue?.text} onError={setError} />
        : <div className="studio-stage-empty"><Film size={29} aria-hidden="true" />
            {portrait && project.scenes.length ? '此镜未纳入竖屏短片' : '添加分镜后可预览画面'}
          </div>}
      <IconButton className="studio-fullscreen" icon={large ? Minimize2 : Maximize2}
        label={large ? '退出全屏' : '全屏预览'} onClick={fullscreen} />
      {error && <span className="studio-player-error" role="status">{error}</span>}
    </div>
    <div className="studio-transport">
      <button type="button" className="studio-round big" aria-label={playing ? '暂停预览' : '播放预览'}
        onClick={toggle} disabled={!list.length}>
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
      <div className="studio-chapters" style={{ '--chapters': Math.max(1, list.length) }}>
        <div className="studio-track">
          {list.map((s, i) => <div key={s.id} style={{ flexGrow: lengths[i] }}>
            <i style={{ width: (i < index ? 100 : i === index ? Math.min(100, elapsed / length * 100) : 0) + '%' }} />
          </div>)}
          <label className="studio-sr" htmlFor={seekLabel}>预览进度</label>
          <input id={seekLabel} type="range" min="0" max={total || 1} step="0.05" value={current}
            aria-valuetext={duration(current) + '，共 ' + duration(total)} disabled={!list.length}
            onChange={e => seek(Number(e.target.value))} />
        </div>
        {list.length > 12 ? <p className="studio-chapter-position tabular-nums">
          {number(index + 1)} / {number(list.length)} · {scene?.title || '选择一个镜头'}
        </p> : <div className="studio-chapter-labels">
          {list.map((s, i) => <button type="button" key={s.id} title={s.title}
            aria-label={'跳至第 ' + (i + 1) + ' 段 ' + s.title} aria-pressed={i === index}
            style={{ flexGrow: lengths[i] }} onClick={() => {
              setPlaying(false)
              if (index === i) changeTime(0)
              else setSceneId(s.id)
            }}>{s.title || '未命名'}</button>)}
        </div>}
      </div>
      <span className="studio-time tabular-nums"><b>{duration(current)}</b> / {duration(total)}</span>
    </div>
  </section>
}

function PrintedCard({ project, pages, cardIndex, choose }) {
  const card = pages[cardIndex]
  return <section className="studio-print" aria-label="图卡预览">
    <div className="studio-stage">
      {card && <div className="studio-printed-card">
        {card.file ? <img className="studio-export-card" src={asset(card.file)} alt={card.scene.title + '图卡'} />
          : <>
            <small>{kindLabels[project.kind]} · {number(card.index + 1)}</small>
            <h3>{card.scene.title}</h3>
            <div className="studio-card-still"><Thumbnail scene={card.scene} /></div>
            <p>{card.lines.join('\n') || '填写旁白后生成图卡正文'}</p>
          </>}
      </div>}
      {!card && <div className="studio-stage-empty"><Images size={28} aria-hidden="true" />添加分镜后可预览图卡</div>}
    </div>
    <div className="studio-print-nav">
      <IconButton icon={ArrowLeft} label="上一张图卡" disabled={cardIndex <= 0} onClick={() => choose(cardIndex - 1)} />
      <span className="tabular-nums">第 {card ? cardIndex + 1 : 0} 张 / 共 {pages.length} 张</span>
      <IconButton icon={ArrowRight} label="下一张图卡" disabled={cardIndex >= pages.length - 1} onClick={() => choose(cardIndex + 1)} />
    </div>
  </section>
}

function LongArticle({ project, sceneId }) {
  const frame = useRef(null)
  const sections = useRef(new Map())
  useLayoutEffect(() => {
    const el = sections.current.get(sceneId)
    const scroll = frame.current
    if (scroll && el) {
      scroll.scrollTop = sceneId === project.scenes[0]?.id
        ? 0 : scroll.scrollTop + el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 10
    }
  }, [sceneId, project.scenes[0]?.id])
  const sources = new Set([project.source, ...project.scenes.map(s => s.source)]
    .map(s => typeof s === 'string' ? s : [s?.title, s?.url].filter(Boolean).join(' · ')).filter(Boolean))
  return <section className="studio-stage studio-article-stage" aria-label="长文预览">
    <article className="studio-article" tabIndex={0} ref={frame}>
      <h2>{project.name}</h2>
      {project.intro && <p>{project.intro}</p>}
      {project.scenes.map((scene, i) => <section key={scene.id} ref={node => {
        if (node) sections.current.set(scene.id, node)
        else sections.current.delete(scene.id)
      }}>
        <h3>{scene.title || '未命名分镜'}</h3>
        <div className="studio-article-figure"><Thumbnail scene={scene}
          still={project.exports?.articleImages?.[i]} alt={scene.title} /></div>
        {[scene.text, scene.notes].filter(Boolean).map((p, j) => <p key={j}>{p}</p>)}
      </section>)}
      {sources.size > 0 && <footer>资料来源{[...sources].map(s => <p key={s}>{s}</p>)}</footer>}
    </article>
  </section>
}

function OutputShelf({ project, scene, shortList, shape, setShape, pages, sounds, platforms, accounts, openPublish }) {
  const ready = platforms.filter(p => getPlatformReadiness(project, p, accounts).ready)
  const fullTime = project.scenes.reduce((n, s) => n + sceneLength(s, false, sounds), 0)
  const shortTime = shortList.reduce((n, s) => n + sceneLength(s, true, sounds), 0)
  const articleSize = [project.name, project.intro, ...project.scenes.flatMap(s => [s.title, s.text, s.notes])]
    .reduce((n, text) => n + words(text), 0)
  const descriptions = { wide: '16:9 · ' + duration(fullTime), short: '9:16 · ' + duration(shortTime),
    cards: '3:4 · ' + pages.length + ' 张', article: articleSize.toLocaleString('zh-CN') + ' 字' }
  return <section className="studio-outputs" aria-label="一稿四态">
    <header><h2>一稿四态 · 实时同步</h2><span>点击画幅切换预览</span></header>
    <div className="studio-shapes">
      {shapes.map(item => <button type="button" key={item.id} aria-pressed={shape === item.id}
        aria-label={'预览' + item.label} onClick={() => setShape(item.id)}>
        <span className="studio-mini-box" aria-hidden="true">
          <span className={'studio-mini ' + item.id}>
            {item.id === 'article' ? <><i /><i /><i /><b /></>
              : <Thumbnail scene={item.id === 'short' && !shortList.includes(scene) ? shortList[0] : scene} />}
          </span>
        </span>
        <strong>{item.id === 'article' ? '带图长文' : item.label}</strong>
        <small className="tabular-nums">{descriptions[item.id]}</small>
      </button>)}
    </div>
    <footer>
      <span className="studio-readiness">
        <span className="studio-marks" aria-hidden="true">{platforms.slice(0, 5).map(p => <PlatformMark key={p.id} id={p.id} />)}</span>
        <span><b className="tabular-nums">{ready.length} / {platforms.length}</b> 个平台就绪</span>
      </span>
      <button type="button" className="studio-text" onClick={openPublish}>前往八平台分发 <ArrowRight size={14} aria-hidden="true" /></button>
    </footer>
  </section>
}

export default function Editor({
  project, sceneId, setSceneId, changeScene, onAdd, onDuplicate, onRemove, onMove, onReorder,
  importFile, generateVoice, openTools, editProject, openPublish, platforms, accounts, settings,
}) {
  const scenes = project.scenes
  const index = scenes.findIndex(s => s.id === sceneId)
  const scene = scenes[index]
  const [shape, setShape] = useState('wide')
  const [playing, setPlaying] = useState(false)
  const [subpage, setSubpage] = useState({ sceneId: '', page: 0 })
  const [sounds, setSounds] = useState(() => new Map())
  const [dropTarget, setDropTarget] = useState('')
  const dragged = useRef(null)
  const activeStory = useRef(null)
  const list = useRef(null)
  const shortList = useMemo(() => shortScenes(scenes), [scenes])
  const pages = useMemo(() => cardPages(scenes, project.exports?.cards), [scenes, project.exports?.cards])
  const firstPage = Math.max(0, pages.findIndex(p => p.scene.id === sceneId))
  const cardIndex = subpage.sceneId === sceneId && pages[subpage.page]?.scene.id === sceneId ? subpage.page : firstPage
  const pending = scenes.filter(s => !s.audio)
  const fullTime = scenes.reduce((n, s) => n + sceneLength(s, false, sounds), 0)
  const pausePreview = useCallback(() => setPlaying(false), [])
  const onLength = useCallback((path, seconds) => {
    if (!path || !Number.isFinite(seconds) || seconds <= 0) return
    setSounds(previous => previous.get(path) === seconds ? previous : new Map(previous).set(path, seconds))
  }, [])

  useLayoutEffect(() => {
    const card = activeStory.current
    const col = list.current
    if (!card || !col || col.scrollHeight <= col.clientHeight) return
    const rect = card.getBoundingClientRect()
    const bounds = col.getBoundingClientRect()
    if (rect.top < bounds.top || rect.bottom > bounds.bottom) {
      col.scrollTop += rect.top - bounds.top - 16
    }
  }, [sceneId])
  function select(id) {
    setPlaying(false)
    setSceneId(id)
  }
  function showShape(id) {
    setPlaying(false)
    if (id === 'short' && shortList.length && !shortList.includes(scene)) setSceneId(shortList[0].id)
    setShape(id)
  }
  function chooseCard(page) {
    if (!pages[page]) return
    const id = pages[page].scene.id
    setSubpage({ sceneId: id, page })
    select(id)
  }
  function finishDrag() {
    dragged.current = null
    setDropTarget('')
  }
  function jumpToPending() {
    const next = pending.find(s => scenes.indexOf(s) > index) || pending[0]
    if (next) {
      select(next.id)
      if (sceneId === next.id) activeStory.current?.scrollIntoView({ block: 'nearest' })
    }
  }
  function sourceLabel() {
    if (scene?.openScreenProject) return 'OpenScreen 录屏'
    if (!scene?.media) return '尚未选择画面'
    return isVideo(scene.media) ? '视频' : '图片'
  }
  return <div className="studio-page">
    <section className="studio-stories" aria-label="分镜故事列表" ref={list}>
      <header className="studio-intro">
        <span className="studio-kind">{project.kind === 'brief' ? <Mic size={13} aria-hidden="true" /> :
          <MonitorPlay size={13} aria-hidden="true" />}{kindLabels[project.kind] || '创作项目'}</span>
        <div className="studio-project-title">
          <h1 className="balance-heading">{project.name || '未命名项目'}</h1>
          <IconButton icon={Pencil} label="编辑项目名称与来源" onClick={editProject} />
        </div>
        <div className="studio-intro-foot">
          <div className="studio-meta tabular-nums">
            <span>{scenes.length} 个镜头</span><span>预计总长 {duration(fullTime)}</span>
            <span>旁白同步到横竖版与图文</span>
          </div>
          {!!pending.length && <button type="button" className="studio-todo" onClick={jumpToPending}>
            <CircleAlert size={13} aria-hidden="true" />{pending.length} 镜待配音<ArrowRight size={13} aria-hidden="true" />
          </button>}
        </div>
      </header>
      <div className="studio-story-list">
        {scenes.map((item, i) => {
          const active = item.id === sceneId
          return <article key={item.id} ref={active ? activeStory : null}
            className={'studio-story' + (active ? ' active' : '') + (dropTarget === item.id ? ' drop-target' : '')}
            onDragOver={e => {
              if (dragged.current && dragged.current !== item.id) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropTarget(item.id)
              }
            }}
            onDrop={e => {
              if (!dragged.current || e.currentTarget.closest('fieldset:disabled')) return
              e.preventDefault()
              if (dragged.current !== item.id) onReorder(dragged.current, item.id)
              finishDrag()
            }}>
            <span className="studio-grip" draggable title="拖动排序，也可在分镜操作中上移或下移" aria-hidden="true"
              onDragStart={e => {
                if (e.currentTarget.closest('fieldset:disabled')) { e.preventDefault(); return }
                setPlaying(false)
                dragged.current = item.id
                e.dataTransfer.setData('text/plain', item.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setDragImage(e.currentTarget.parentElement, 20, 20)
              }} onDragEnd={finishDrag}><GripVertical size={15} /></span>
            {active ? <StoryEditor scene={item} index={i} count={scenes.length} included={shortList.includes(item)}
              audioLength={sounds.get(item.audio) || 0} onLength={onLength} playingPreview={playing} pausePreview={pausePreview}
              update={changeScene} generate={generateVoice} openTools={openTools} settings={settings} importFile={importFile}
              onMove={onMove} onDuplicate={onDuplicate} onRemove={onRemove} />
              : <button type="button" className="studio-fold" aria-label={'编辑第 ' + (i + 1) + ' 镜 ' + item.title}
                  onClick={() => select(item.id)}>
                  <span className="studio-thumb"><Thumbnail scene={item} /></span>
                  <span className="studio-fold-text">
                    <strong><span className="studio-index tabular-nums">{number(i + 1)}</span>{item.title || '未命名分镜'}</strong>
                    <span>{item.text || '填写本镜旁白…'}</span>
                  </span>
                  <span className="studio-fold-meta">
                    <span className="studio-duration tabular-nums">{item.seconds} 秒</span><VoiceState scene={item} />
                  </span>
                </button>}
          </article>
        })}
      </div>
      <button type="button" className="studio-add" onClick={() => { setPlaying(false); onAdd() }}>
        <Plus size={16} aria-hidden="true" />添加新分镜
      </button>
    </section>
    <section className="studio-theater" aria-label="成片预览与多态同步">
      <div className="studio-theater-head">
        <div className="studio-segments" role="group" aria-label="成片形态预览">
          {shapes.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={shape === id}
            onClick={() => showShape(id)}><Icon size={14} aria-hidden="true" />{label}</button>)}
        </div>
        <span className="studio-shot-no tabular-nums">镜头 <b>{number(index + 1)}</b> / {number(scenes.length)}</span>
      </div>
      {shape === 'wide' || shape === 'short'
        ? <ChapterPlayer project={project} sceneId={sceneId} setSceneId={setSceneId} portrait={shape === 'short'}
            shortList={shortList} sounds={sounds} playing={playing} setPlaying={setPlaying} />
        : shape === 'cards' ? <PrintedCard project={project} pages={pages} cardIndex={cardIndex} choose={chooseCard} />
          : <LongArticle project={project} sceneId={sceneId} />}
      {scene && <div className="studio-source">
        <span className="studio-source-icon" aria-hidden="true"><Film size={17} /></span>
        <div className="studio-source-copy">
          <strong>本镜素材 · {sourceLabel()}</strong>
          <small title={scene.media}>{fileName(scene.media) || '导入图片、视频，或重新录制这个镜头'}</small>
        </div>
        <Button className="compact" onClick={() => importFile('media', 'media')}>换画面</Button>
        <Button className="compact" icon={RefreshCw} onClick={() => openTools('recording')}>重录本镜</Button>
      </div>}
      <OutputShelf project={project} scene={scene} shortList={shortList} pages={pages} sounds={sounds}
        platforms={platforms} accounts={accounts} shape={shape} setShape={showShape} openPublish={openPublish} />
    </section>
  </div>
}
