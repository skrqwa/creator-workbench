import React, { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  ClipboardCheck,
  FileText,
  Layers,
  ListFilter,
  Send,
  ExternalLink,
  Link2,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import { ContentPreview, PlatformMark } from './Publishing'
import {
  Button,
  call,
  channelLabels,
  Empty,
  Field,
  IconButton,
  Modal,
  modeLabels,
  shortDate,
} from './shared'

function AccountForm({ account, platforms, initialPlatform, onClose, save }) {
  const [id, setId] = useState(account?.platform || initialPlatform || platforms[0]?.id || '')
  const platform = platforms.find((p) => p.id === id)
  const [name, setName] = useState(account?.name || '')
  const [channel, setChannel] = useState(account?.channel || platform?.channels[0] || '')
  const [direct, setDirect] = useState(account?.capabilities?.includes('submit') || false)
  const [credentials, setCredentials] = useState({})
  const [platformUid, setPlatformUid] = useState(account?.platformUid || '')
  const [subject, setSubject] = useState(account?.subject || 'personal')
  const methods = platform?.methods?.[channel] || ['review']
  const fields = channel === 'api' ? platform?.fields || [] : []
  const subjectRequired = id === 'wechat' && channel === 'api'
  const canEnableDirect = methods.includes('submit') && (!subjectRequired || subject === 'institution')
  function switchPlatform(value) {
    const next = platforms.find((p) => p.id === value)
    setId(value)
    setChannel(next.channels[0])
    setDirect(false)
    setCredentials({})
    setSubject('personal')
    setPlatformUid('')
  }
  function submit(e) {
    e.preventDefault()
    const caps = direct && canEnableDirect ? ['review', 'submit'] : ['review']
    save({
      ...(account?.id ? { id: account.id } : {}),
      platform: id,
      name: name.trim(),
      channel,
      platformUid: platformUid.trim(),
      ...(id === 'wechat' ? { subject } : {}),
      capabilities: caps,
      credentials: Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim())),
    })
  }
  return (
    <Modal title={account ? '编辑发布账号' : '添加发布账号'} onClose={onClose}>
      <form className="stack account-form" onSubmit={submit}>
        <Field label="平台">
          <select
            data-focus
            value={id}
            disabled={Boolean(account)}
            onChange={(e) => switchPlatform(e.target.value)}
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={channel === 'plugin' ? '平台账号准确昵称' : '账号名称'}>
          <input
            required
            maxLength={100}
            value={name}
            placeholder={channel === 'plugin' ? '与平台显示的昵称完全一致' : '便于识别的名称'}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="连接方式" hint={account ? '连接方式需要变更时，请单独添加新账号。' : undefined}>
          <select
            disabled={Boolean(account)}
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value)
              setDirect(false)
              setCredentials({})
            }}
          >
            {(platform?.channels || []).map((key) => (
              <option key={key} value={key}>
                {channelLabels[key] || key}
              </option>
            ))}
          </select>
        </Field>
        {channel === 'browser' && (
          <p className="inline-note">保存后，通过「登录平台」打开此账号的独立登录窗口。</p>
        )}
        {channel === 'plugin' && (
          <Field label="平台用户编号（选填）" hint="插件会用这个编号核对目标账号。">
            <input value={platformUid} onChange={(e) => setPlatformUid(e.target.value)} />
          </Field>
        )}
        {id === 'wechat' && (
          <Field label="公众号主体">
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                setDirect(false)
              }}
            >
              <option value="personal">个人主体</option>
              <option value="institution">已认证且具备发布权限的机构主体</option>
            </select>
          </Field>
        )}
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint || undefined}>
            <input
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              value={credentials[f.key] || ''}
              placeholder={
                account?.credentialKeys?.includes(f.key) ? '留空沿用已保存的值' : f.placeholder || ''
              }
              onChange={(e) => setCredentials({ ...credentials, [f.key]: e.target.value })}
            />
          </Field>
        ))}
        {methods.includes('submit') && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={canEnableDirect && direct}
              disabled={!canEnableDirect}
              onChange={(e) => setDirect(e.target.checked)}
            />
            <span>
              {subjectRequired ? '已确认此账号具备官方发布权限，允许直接提交' : '允许此账号直接提交稿件'}
            </span>
          </label>
        )}
        {subjectRequired && subject === 'personal' && (
          <p className="inline-note">个人主体可写入官方草稿，由作者在公众号后台发布。</p>
        )}
        <div className="dialog-actions">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" icon={Save} tone="primary" disabled={!name.trim() || !id}>
            保存账号
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function AccountsPage({ accounts, platforms, setAccounts, run, notify, adding, setAdding }) {
  const [form, setForm] = useState(null)
  const [remove, setRemove] = useState(null)
  const [filter, setFilter] = useState('all')
  const list = accounts.filter((a) => filter === 'all' || a.platform === filter)
  const platform = (id) => platforms.find((p) => p.id === id)?.label || id
  function closeForm() {
    setForm(null)
    setAdding(false)
  }
  function save(account) {
    run('正在保存账号', async () => {
      const result = await call('accounts.save', { account })
      setAccounts(result)
      closeForm()
      notify('账号设置已保存')
    })
  }
  return (
    <div className="accounts-page">
      <div className="page-intro">
        <h1>发布账号</h1>
        <p>共配置 {accounts.length} 个账号，已覆盖 {new Set(accounts.map((a) => a.platform)).size} 个平台。</p>
      </div>
      <div className="ledger-layout">
        <aside className="ledger-filters" aria-label="按平台筛选账号">
          <h2><ListFilter size={15} aria-hidden="true" />发布平台</h2>
          <button type="button" className="ledger-filter" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            <Layers size={16} aria-hidden="true" />全部平台 <span>{accounts.length}</span>
          </button>
          {platforms.map((p) => (
            <button key={p.id} type="button" className="ledger-filter" aria-pressed={filter === p.id}
              onClick={() => setFilter(p.id)}>
              <PlatformMark id={p.id} />{p.label}<span>{accounts.filter((a) => a.platform === p.id).length}</span>
            </button>
          ))}
        </aside>
        <section className="panel ledger-panel">
          <div className="panel-header">
            <h2><Users aria-hidden="true" />{filter === 'all' ? '已配置的账号' : platform(filter)} <span className="count">{list.length}</span></h2>
          </div>
        {list.length ? (
          <div className="account-list">
            {list.map((a) => (
              <div key={a.id} className="managed-account">
                <PlatformMark id={a.platform} />
                <div className="account-info">
                  <strong>{a.name}</strong>
                  <small>
                    {platform(a.platform)} · {channelLabels[a.channel] || a.channel}
                  </small>
                </div>
                <span className="permission-text">
                  <BadgeCheck size={14} aria-hidden="true" />
                  {a.capabilities?.includes('submit') ? '允许直接提交' : '去平台复核'}
                </span>
                <div className="account-actions">
                  {a.channel === 'browser' && (
                    <Button
                      className="compact"
                      icon={LogIn}
                      onClick={() =>
                        run('正在打开平台账号窗口', () => call('accounts.login', { id: a.id }))
                      }
                    >
                      登录平台
                    </Button>
                  )}
                  <IconButton
                    icon={Pencil}
                    label={`编辑账号 ${a.name}`}
                    onClick={() => setForm({ account: a })}
                  />
                  <IconButton
                    className="danger-icon"
                    icon={Trash2}
                    label={`移除账号 ${a.name}`}
                    onClick={() => setRemove(a)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={Users}
            title={accounts.length ? '此平台还没有账号' : '添加第一个发布账号'}
            action={
              <Button icon={Plus} onClick={() => setAdding(true)}>
                添加账号
              </Button>
            }
          >
            同一平台可以连接多个账号，并分别设置投稿权限。
          </Empty>
        )}
        </section>
      </div>
      {(form || adding) && (
        <AccountForm
          platforms={platforms}
          initialPlatform={filter === 'all' ? undefined : filter}
          account={form?.account}
          onClose={closeForm}
          save={save}
        />
      )}
      {remove && (
        <Modal
          title="移除这个账号？"
          subtitle={`${platform(remove.platform)} · ${remove.name}`}
          onClose={() => setRemove(null)}
        >
          <p className="dialog-note">工作台将移除这个账号的连接配置。</p>
          <div className="dialog-actions">
            <Button onClick={() => setRemove(null)}>取消</Button>
            <Button
              tone="danger"
              icon={Trash2}
              onClick={() =>
                run('正在移除账号', async () => {
                  const result = await call('accounts.remove', { id: remove.id })
                  setAccounts(result)
                  setRemove(null)
                  notify('账号已移除')
                })
              }
            >
              移除账号
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const states = {
  draft: ['平台草稿', 'info'],
  submitted: ['已提交', 'info'],
  reviewing: ['平台审核中', 'info'],
  published: ['已发布', 'ok'],
  failed: ['失败', 'error'],
  needs_action: ['待人工处理', 'warn'],
  unknown: ['待核验', 'warn'],
  running: ['处理中', 'info'],
  prepared: ['已备稿', 'info'],
  withdrawn: ['已撤回', 'warn'],
}
function StatePill({ status }) {
  const [label, tone] = states[status] || ['待核验', 'warn']
  const Icon = { info: Clock3, ok: CircleCheck, error: CircleX, warn: CircleAlert }[tone]
  return (
    <span className={`state-pill ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  )
}

export function ReceiptsPage({
  receipts,
  platforms,
  project,
  setReceipts,
  run,
  notify,
  persist,
  openPublish,
}) {
  const [filter, setFilter] = useState('all')
  const [retry, setRetry] = useState(null)
  const [link, setLink] = useState(null)
  const [url, setUrl] = useState('')
  const [checkedUnknown, setCheckedUnknown] = useState([])
  const [reconcile, setReconcile] = useState(null)
  const [absent, setAbsent] = useState(false)
  const items = receipts.filter((r) => filter === 'all' || r.status === filter)
  const platform = (id) => platforms.find((p) => p.id === id)?.label || id
  const reload = async () => {
    setReceipts(await call('receipts.list'))
  }
  const polling = receipts.some((r) =>
    ['running', 'prepared', 'needs_action', 'draft', 'submitted', 'reviewing', 'unknown'].includes(
      r.status,
    ),
  )
  useEffect(() => {
    if (!project || !polling) return
    let active = true
    let pending = false
    const timer = setInterval(async () => {
      if (pending) return
      pending = true
      try {
        const rows = await call('receipts.list')
        if (active) setReceipts(rows)
      } catch {
        /* 后台刷新失败时仍保留上次回执，可在页面主动回查。 */
      } finally {
        pending = false
      }
    }, 4000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [polling, project?.id, setReceipts])
  function check(r) {
    run('正在回查平台状态', async () => {
      await call('publish.check', { id: r.id })
      await reload()
      if (r.status === 'unknown') setCheckedUnknown((old) => (old.includes(r.id) ? old : [...old, r.id]))
      notify('已读取最新回执')
    })
  }
  function retryNow() {
    const id = retry.id
    run('正在补投这个账号', async () => {
      await persist()
      try {
        await call('publish.retry', { id, confirmed: true })
      } finally {
        await reload()
      }
      setRetry(null)
      notify('已更新此账号的补投记录')
    })
  }
  function prepareRetry(r) {
    run('正在核对单项补投稿件', async () => {
      await persist()
      const preview = await call('publish.preview', { platform: r.platform })
      setRetry({ ...r, preview })
    })
  }
  function linkNow(e) {
    e.preventDefault()
    run('正在保存作品链接', async () => {
      await call('publish.link', { id: link.id, url: url.trim() })
      await reload()
      setLink(null)
      notify('已记录作者提供的作品链接')
    })
  }
  function reconcileNow() {
    if (!absent || !reconcile) return
    run('正在记录人工核对结果', async () => {
      await call('publish.reconcile', { id: reconcile.id, confirmedAbsent: true })
      await reload()
      setReconcile(null)
      setAbsent(false)
      notify('已保存人工核对结果')
    })
  }
  const filters = [
    ['all', '全部记录', Layers],
    ...Object.entries(states)
      .filter(([status]) => ['draft', 'reviewing', 'published', 'unknown', 'failed'].includes(status)
        || receipts.some((r) => r.status === status))
      .map(([status, [label]]) => [status, label,
        ({ draft: FileText, reviewing: Clock3, published: CircleCheck, failed: CircleX, unknown: CircleAlert })[status] || Send]),
  ]
  return (
    <div className="archive-page">
      <div className="page-intro">
        <div className="project-type"><BookOpenCheck size={14} aria-hidden="true" />作品回执</div>
        <h1>发布记录</h1>
        <p>{project ? `${project.name} · 共 ${receipts.length} 条投稿记录` : '打开作品后，可以查看各个平台的回执。'}</p>
      </div>
      <div className="ledger-layout">
        <aside className="ledger-filters" aria-label="按状态筛选发布记录">
          <h2><ListFilter size={15} aria-hidden="true" />回执状态</h2>
          {filters.map(([key, label, Icon]) => (
            <button key={key} className="ledger-filter" type="button" aria-pressed={filter === key}
              onClick={() => setFilter(key)}><Icon size={17} aria-hidden="true" />
              {label}<span>{key === 'all' ? receipts.length : receipts.filter((r) => r.status === key).length}</span>
            </button>
          ))}
        </aside>
        <section className="panel ledger-panel">
          <div className="panel-header">
            <h2><ClipboardCheck aria-hidden="true" />账号回执 <span className="count">{items.length}</span></h2>
          </div>
        {items.length ? (
          <div className="receipts-list">
            {items.map((r) => (
              <article className="receipt" key={r.id}>
                <div className="receipt-header">
                  <PlatformMark id={r.platform} />
                  <div className="account-info">
                    <strong>{r.accountName || platform(r.platform)}</strong>
                    <small>
                      {platform(r.platform)} · {modeLabels[r.mode] || r.mode}
                    </small>
                  </div>
                  <StatePill status={r.status} />
                </div>
                <h3>{r.title}</h3>
                {r.detail && (
                  <p className="receipt-detail">
                    {typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}
                  </p>
                )}
                <div className="receipt-meta">
                  <time>{shortDate(r.updatedAt)}</time>
                  {r.remoteId && (
                    <span>
                      平台编号 <b>{String(r.remoteId)}</b>
                    </span>
                  )}
                </div>
                <div className="receipt-actions">
                  <Button icon={RefreshCw} className="compact" onClick={() => check(r)}>
                    回查状态
                  </Button>
                  {r.status === 'failed' && (
                    <Button icon={RotateCcw} className="compact" onClick={() => prepareRetry(r)}>
                      单项补投
                    </Button>
                  )}
                  {r.status === 'unknown' && checkedUnknown.includes(r.id) && (
                    <Button
                      icon={ClipboardCheck}
                      className="compact"
                      onClick={() => {
                        setAbsent(false)
                        setReconcile(r)
                      }}
                    >
                      核对后记录
                    </Button>
                  )}
                  {r.url && (
                    <Button
                      className="compact"
                      icon={ExternalLink}
                      onClick={() => run('正在打开记录链接', () => call('file.external', { url: r.url }))}
                    >
                      打开链接
                    </Button>
                  )}
                  {!r.url &&
                    ['draft', 'prepared', 'needs_action', 'unknown', 'submitted', 'reviewing'].includes(
                      r.status,
                    ) && (
                      <button
                        className="text-btn"
                        type="button"
                        onClick={() => {
                          setLink(r)
                          setUrl('')
                        }}
                      >
                        <Link2 size={14} aria-hidden="true" />
                        补充作品链接
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={ClipboardCheck}
            title={receipts.length ? '没有此状态的记录' : '还没有发布记录'}
            action={
              project &&
              !receipts.length && (
                <Button icon={SendIcon} onClick={openPublish}>
                  前往八平台分发
                </Button>
              )
            }
          >
            {receipts.length ? '切换状态即可查看其他回执。' : '发起投稿后，每个目标账号会有独立记录。'}
          </Empty>
        )}
        </section>
      </div>
      {retry && (
        <Modal
          title="只补投这个账号？"
          subtitle={`${platform(retry.platform)} · ${retry.accountName}`}
          onClose={() => setRetry(null)}
          className="publication-dialog"
        >
          <div className="retry-info">
            <strong>{retry.title}</strong>
            <span>{modeLabels[retry.mode]}</span>
          </div>
          <ContentPreview
            platform={{ id: retry.platform, label: platform(retry.platform) }}
            content={retry.preview}
            compact
          />
          <p className="dialog-note">工作台将重新处理这条失败记录。其他账号的回执会保留。</p>
          <div className="dialog-actions">
            <Button onClick={() => setRetry(null)}>取消</Button>
            <Button tone="primary" icon={RotateCcw} onClick={retryNow}>
              确认单项补投
            </Button>
          </div>
        </Modal>
      )}
      {link && (
        <Modal
          title="补充平台作品链接"
          subtitle={`${platform(link.platform)} · ${link.accountName}`}
          onClose={() => setLink(null)}
        >
          <form className="stack" onSubmit={linkNow}>
            <Field label="作品公开链接" hint="链接会标为作者提供，待平台回执核验状态。">
              <input
                data-focus
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <div className="dialog-actions">
              <Button onClick={() => setLink(null)}>取消</Button>
              <Button tone="primary" icon={Link2} type="submit" disabled={!url.trim()}>
                保存链接
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {reconcile && (
        <Modal
          title="记录人工核对结果"
          subtitle={`${platform(reconcile.platform)} · ${reconcile.accountName}`}
          onClose={() => setReconcile(null)}
        >
          <div className="stack">
            <strong>{reconcile.title}</strong>
            <label className="check-row">
              <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
              <span>我已在对应账号的作品及草稿记录中查过，确认本次未提交。</span>
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setReconcile(null)}>取消</Button>
              <Button icon={ClipboardCheck} tone="primary" disabled={!absent} onClick={reconcileNow}>
                记录核对结果
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const SendIcon = ArrowUpRight
