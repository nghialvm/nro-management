import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Activity,
  AlertTriangle,
  Ban,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Database,
  FileCode2,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Swords,
  Table2,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { api, ApiRequestError, clearAuth } from './api'
import { GiftcodePage } from './GiftcodePage'
import { PlayerPage } from './PlayerPage'
import { ShopPage } from './ShopPage'
import { JsonReferencePreview, LookupSelect, ReferenceCell, ReferenceThumbnail, useReferenceCatalog, useRowReferenceCatalog } from './ReferenceDisplay'
import { collectReferences, isJsonObjectDocument } from './relations'
import type {
  AntiDdosStatus,
  BossConfigRow,
  DashboardSnapshot,
  EventConfig,
  JsonMap,
  ResourceRow,
  User,
} from './types'
import { moduleDefinitions } from './types'

const loginSchema = z.object({
  username: z.string().min(1, 'Nhập tài khoản'),
  password: z.string().min(1, 'Nhập mật khẩu'),
})

type LoginValues = z.infer<typeof loginSchema>

const iconByKey: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  accounts: Users,
  players: Sparkles,
  shops: Package,
  giftcodes: Gift,
  'topup-rewards': Zap,
  events: Activity,
  badges: ShieldCheck,
  maps: Network,
  items: Boxes,
  transactions: Table2,
  radar: CircleGauge,
  parts: FileCode2,
  drops: Package,
  bosses: Swords,
  security: ShieldCheck,
  'anti-ddos': Ban,
}

const preferredColumns: Record<string, string[]> = {
  accounts: ['id', 'username', 'is_admin', 'active', 'ban', 'Vip_Point', 'vnd', 'tongnap', 'last_time_login'],
  players: ['id', 'name', 'account_id', 'head', 'gender', 'clan_id', 'LastTimeLoginGame'],
  shops: ['id', 'npc_id', 'tag_name', 'type_shop'],
  giftcodes: ['id', 'code', 'count_left', 'datecreate', 'expired'],
  'topup-rewards': ['id', 'user_id', 'amount', 'created_at'],
  badges: ['id', 'idEffect', 'idItem', 'NAME'],
  maps: ['id', 'NAME', 'planet_id', 'zones', 'max_player'],
  items: ['id', 'NAME', 'TYPE', 'gender', 'level', 'icon_id', 'part'],
  transactions: ['id', 'player_1', 'player_2', 'time_tran'],
  radar: ['id', 'name', 'iconId', 'rank', 'type', 'mob_id'],
  parts: ['id', 'TYPE', 'DATA'],
  drops: ['id', 'active', 'mob_id', 'map_id', 'item_id', 'quantity', 'rate_num', 'rate_den'],
}

const displayLabels: Record<string, string> = {
  id: 'ID',
  username: 'Tài khoản',
  is_admin: 'Admin',
  active: 'Hoạt động',
  ban: 'Ban',
  Vip_Point: 'VIP',
  vnd: 'VND',
  tongnap: 'Tổng nạp',
  name: 'Tên',
  NAME: 'Tên',
  account_id: 'Tài khoản',
  head: 'Head',
  gender: 'Giới tính',
  clan_id: 'Clan',
  clanId: 'Clan',
  npc_id: 'NPC',
  tag_name: 'Tag',
  type_shop: 'Loại shop',
  code: 'Mã code',
  count_left: 'Lượt còn',
  user_id: 'Tài khoản',
  amount: 'Mốc tiền',
  idEffect: 'Effect',
  planet_id: 'Hành tinh',
  zones: 'Khu vực',
  max_player: 'Max player',
  TYPE: 'Loại',
  level: 'Level',
  icon_id: 'Icon',
  part: 'Part',
  player_1: 'Player 1',
  player_2: 'Player 2',
  time_tran: 'Thời gian',
  iconId: 'Icon',
  icon_spec: 'Icon',
  avatar_id: 'Avatar',
  head_id: 'Head',
  DATA: 'Ảnh part',
  rank: 'Rank',
  mob_id: 'Quái',
  itemId: 'Vật phẩm',
  idItem: 'Vật phẩm',
  option_id: 'Option',
  optionId: 'Option',
  map_id: 'Bản đồ',
  mapId: 'Bản đồ',
  shop_id: 'Shop',
  tab_id: 'Shop tab',
  item_shop_id: 'Shop item',
  skill_id: 'Skill',
  skillId: 'Skill',
  temp_id: 'Vật phẩm',
  tempId: 'Vật phẩm',
  player_id: 'Người chơi',
  quantity: 'Số lượng',
  rate_num: 'Tỷ lệ tử',
  rate_den: 'Tỷ lệ mẫu',
  last_time_login: 'Login cuối',
  LastTimeLoginGame: 'Login game cuối',
  created_at: 'Tạo lúc',
}

function labelFor(key: string) {
  return displayLabels[key] ?? key.replace(/_/g, ' ')
}

function formatBytes(value = 0) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function App() {
  return <Portal />
}

function Portal() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.me().then(({ user: currentUser }) => setUser(currentUser)).catch(() => clearAuth()).finally(() => setChecking(false))
    const unauthorized = () => {
      clearAuth()
      setUser(null)
    }
    window.addEventListener('nro:unauthorized', unauthorized)
    return () => window.removeEventListener('nro:unauthorized', unauthorized)
  }, [])

  if (checking) return <ScreenLoader />
  if (!user) return <LoginPage onSuccess={setUser} />
  return <AdminShell user={user} onLogout={() => setUser(null)} />
}

function LoginPage({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  })

  const submit = async (values: LoginValues) => {
    setError('')
    try {
      const result = await api.login(values.username, values.password)
      onSuccess(result.user)
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : 'Không thể đăng nhập')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <form className="login-card" onSubmit={handleSubmit(submit)}>
        <div className="brand-mark"><Server size={24} /></div>
        <p className="eyebrow">NRO SERVER</p>
        <h1>Management Console</h1>
        <p className="muted">Đăng nhập bằng tài khoản quản trị server.</p>
        <label>Tài khoản<input autoComplete="username" placeholder="admin" {...register('username')} /></label>
        {errors.username && <small className="field-error">{errors.username.message}</small>}
        <label>Mật khẩu<input type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} /></label>
        {errors.password && <small className="field-error">{errors.password.message}</small>}
        {error && <div className="alert danger"><AlertTriangle size={16} />{error}</div>}
        <button className="primary full-width" disabled={isSubmitting}>{isSubmitting ? 'Đang xác thực…' : 'Đăng nhập'}</button>
        <small className="login-footnote">Chỉ tài khoản có quyền <code>is_admin</code> mới được truy cập.</small>
      </form>
    </div>
  )
}

function AdminShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const current = moduleDefinitions.find((item) => item.path !== '/' && location.pathname.startsWith(item.path))
    ?? moduleDefinitions[0]

  const logout = async () => {
    await api.logout()
    onLogout()
    navigate('/')
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small"><Server size={19} /></div>
          {!collapsed && <div><strong>NRO Admin</strong><span>Management Console</span></div>}
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
        </div>
        <nav className="sidebar-nav">
          {moduleDefinitions.map((item) => {
            const Icon = iconByKey[item.key] ?? Table2
            return <NavLink key={item.key} to={item.path} end={item.path === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          })}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && <div className="server-pill"><span className="status-dot" /> Backend API online</div>}
          <button className="nav-item" onClick={logout}><LogOut size={18} />{!collapsed && <span>Đăng xuất</span>}</button>
        </div>
      </aside>
      <section className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Menu size={20} /></button>
          <button className="icon-button collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label="Thu gọn sidebar">
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="breadcrumb"><span>Server Management</span><b>/</b><strong>{current.label}</strong></div>
          <div className="topbar-actions"><div className="topbar-status"><span className="status-dot" /> Live</div><div className="user-chip">{user.username.slice(0, 1).toUpperCase()}</div></div>
        </header>
        <main className="page-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/bosses" element={<BossesPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/anti-ddos" element={<AntiDdosPage />} />
            <Route path="/accounts" element={<ResourcePage resource="accounts" title="Tài khoản" description="Quản lý tài khoản, quyền admin và trạng thái truy cập." />} />
            <Route path="/players" element={<PlayerPage />} />
            <Route path="/shops" element={<ShopPage />} />
            <Route path="/giftcodes" element={<GiftcodePage />} />
            <Route path="/topup-rewards" element={<ResourcePage resource="topup-rewards" title="Nạp & phần thưởng" description="Quản lý các mốc nạp; chọn bảng dữ liệu ở thanh công cụ." />} />
            <Route path="/badges" element={<ResourcePage resource="badges" title="Danh hiệu" description="Cấu hình effect, item và option hiển thị danh hiệu." />} />
            <Route path="/maps" element={<ResourcePage resource="maps" title="Dữ liệu bản đồ" description="Chỉnh map template và các JSON mob/NPC/waypoint." />} />
            <Route path="/items" element={<ResourcePage resource="items" title="Dữ liệu vật phẩm" description="Tra cứu và chỉnh template vật phẩm, icon, part và giá." />} />
            <Route path="/transactions" element={<ResourcePage resource="transactions" title="Lịch sử giao dịch" description="Lịch sử giao dịch chỉ đọc, có tìm kiếm và phân trang." readOnly />} />
            <Route path="/radar" element={<ResourcePage resource="radar" title="Radar" description="Quản lý thẻ radar, outfit, aura và options JSON." />} />
            <Route path="/parts" element={<ResourcePage resource="parts" title="Part / Avatar" description="Quản lý part; head avatar và frame dùng cùng API resource." />} />
            <Route path="/drops" element={<ResourcePage resource="drops" title="Drop item" description="Cấu hình item rơi, tỷ lệ, family và điều kiện." />} />
            <Route path="/shop-tabs" element={<ResourcePage resource="shop-tabs" title="Shop tabs" description="Các tab con của cửa hàng." />} />
            <Route path="/shop-items" element={<ResourcePage resource="shop-items" title="Shop items" description="Các item nằm trong từng tab shop." />} />
            <Route path="/shop-options" element={<ResourcePage resource="shop-options" title="Shop item options" description="Option gắn với item trong shop." />} />
            <Route path="/head-avatars" element={<ResourcePage resource="head-avatars" title="Head avatars" description="Mapping head và avatar." />} />
            <Route path="/head-frames" element={<ResourcePage resource="head-frames" title="Head frames" description="Dữ liệu frame của head." />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </section>
    </div>
  )
}

function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">NRO MANAGEMENT</p><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div><div className="page-actions">{actions}</div></div>
}

function DashboardPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 10000 })
  const snapshot = query.data

  useEffect(() => {
    const source = new EventSource('/api/dashboard/stream')
    const onMetrics = (event: Event) => {
      const message = event as MessageEvent<string>
      try { queryClient.setQueryData(['dashboard'], JSON.parse(message.data)) } catch { /* polling remains active */ }
    }
    source.addEventListener('metrics', onMetrics)
    return () => { source.removeEventListener('metrics', onMetrics); source.close() }
  }, [queryClient])

  const action = async (label: string, callback: () => Promise<unknown>, dangerous = false) => {
    if (dangerous && !window.confirm(`Xác nhận thao tác: ${label}?`)) return
    try { await callback(); await queryClient.invalidateQueries({ queryKey: ['dashboard'] }) } catch (error) { window.alert(error instanceof Error ? error.message : 'Thao tác thất bại') }
  }

  const cards = snapshot ? [
    { label: 'Người chơi online', value: snapshot.onlinePlayers, suffix: '', icon: Users, tone: 'blue' },
    { label: 'Sessions', value: snapshot.sessions, suffix: '', icon: Network, tone: 'violet' },
    { label: 'CPU', value: snapshot.cpuLoad.toFixed(1), suffix: '%', icon: Activity, tone: 'green' },
    { label: 'Heap JVM', value: snapshot.heapUsedPercent.toFixed(1), suffix: '%', icon: Database, tone: 'orange' },
  ] : []

  return <>
    <PageHeader title="Bảng điều khiển" description="Trạng thái runtime và thao tác nhanh cho server game."
      actions={<button className="secondary" onClick={() => query.refetch()}><RefreshCw size={16} /> Làm mới</button>} />
    {query.isError && <ErrorBanner error={query.error} />}
    <div className="stat-grid">{cards.map((card) => <div className={`stat-card ${card.tone}`} key={card.label}><div className="stat-icon"><card.icon size={19} /></div><div><span>{card.label}</span><strong>{card.value}{card.suffix}</strong></div><small>Realtime</small></div>)}</div>
    <div className="dashboard-grid">
      <section className="panel runtime-panel"><div className="panel-heading"><div><h3>Runtime health</h3><p className="muted">Các chỉ số hiện tại của JVM và game loop.</p></div><span className={`status-badge ${snapshot?.serverRunning ? 'success' : 'danger'}`}><span className="status-dot" />{snapshot?.serverRunning ? 'Server online' : 'Server offline'}</span></div>
        {snapshot ? <div className="health-list"><HealthRow label="Heap JVM" value={`${formatBytes(snapshot.heapUsedBytes)} / ${formatBytes(snapshot.heapMaxBytes)}`} percent={snapshot.heapUsedPercent} tone="blue" /><HealthRow label="CPU process" value={`${snapshot.cpuLoad.toFixed(1)}%`} percent={snapshot.cpuLoad} tone="green" /><HealthRow label="Boss đang sống" value={`${snapshot.bossAlive}`} percent={Math.min(snapshot.bossAlive * 2, 100)} tone="orange" /></div> : <Skeleton />}
      </section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h3>Thao tác nhanh</h3><p className="muted">Các thao tác có thể ảnh hưởng runtime.</p></div><Zap size={19} className="heading-icon" /></div>
        <div className="quick-actions"><button onClick={() => action('bảo trì sau 2 phút', () => api.server('maintenance', 'POST', { delaySeconds: 120, autoRestart: false }), true)}><AlertTriangle size={17} /> Bảo trì 2 phút</button><button onClick={() => action('reload dữ liệu', () => api.server('reload', 'POST', { targets: ['giftcodes', 'shops', 'maps', 'drops'] }))}><RefreshCw size={17} /> Reload DB/cache</button><button onClick={() => action('kick toàn bộ người chơi', () => api.server('kick-all', 'POST'), true)}><Users size={17} /> Kick all</button><button onClick={() => action('dọn JVM', () => api.server('optimize', 'POST', { kind: 'ram' }))}><Sparkles size={17} /> Dọn JVM</button></div>
      </section>
    </div>
    <section className="panel events-summary"><div className="panel-heading"><div><h3>Event đang bật</h3><p className="muted">Runtime hiện chỉ áp dụng event đầu tiên khi chọn nhiều event.</p></div><button className="text-button" onClick={() => window.location.assign('/events')}>Mở cấu hình <ChevronRight size={15} /></button></div><div className="event-tags">{snapshot && Object.entries(snapshot.events).filter(([, active]) => active).map(([name]) => <span className="tag active" key={name}>{name}</span>)}{snapshot && !Object.values(snapshot.events).some(Boolean) && <span className="muted">Chưa có event runtime.</span>}</div></section>
  </>
}

function HealthRow({ label, value, percent, tone }: { label: string; value: string; percent: number; tone: string }) {
  return <div className="health-row"><div><span>{label}</span><strong>{value}</strong></div><div className="progress"><i className={tone} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} /></div></div>
}

function EventsPage() {
  const queryClient = useQueryClient()
  const query = useQuery<EventConfig>({ queryKey: ['events'], queryFn: api.events })
  const [selected, setSelected] = useState<number[]>([])
  useEffect(() => { if (query.data) setSelected(query.data.activeIds) }, [query.data])
  const mutation = useMutation({ mutationFn: () => api.updateEvents(selected), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }) })
  return <><PageHeader title="Sự kiện" description="Bật/tắt event runtime và lưu cấu hình active_event.txt" actions={<button className="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}><Save size={16} /> Áp dụng event</button>} />
    {query.data?.runtimeUsesFirstEventOnly && <div className="alert warning"><AlertTriangle size={17} /> Nếu chọn nhiều event, backend sẽ lưu tất cả nhưng runtime áp dụng event đầu tiên.</div>}
    <section className="panel event-grid">{query.data?.events.map((event) => <label className={`event-card ${selected.includes(event.id) ? 'selected' : ''}`} key={event.id}><input type="checkbox" checked={selected.includes(event.id)} onChange={(change) => setSelected((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id))} /><span className="event-number">{event.id}</span><span><strong>{event.name}</strong><small>{event.active ? 'Đang bật trong runtime' : 'Đang tắt'}</small></span></label>)}{query.isLoading && <Skeleton />}</section>
  </>
}

function BossesPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['bosses'], queryFn: api.bosses })
  const bossReferences = useMemo(() => (query.data ?? []).flatMap((row) => collectReferences({ outfit: row.data?.outfit }, 'bosses')), [query.data])
  const bossLookup = useReferenceCatalog(bossReferences)
  const [selected, setSelected] = useState<BossConfigRow | null>(null)
  const [editor, setEditor] = useState('{}')
  const validJson = isJsonObjectDocument(editor)
  useEffect(() => { if (query.data?.length && !selected) { setSelected(query.data[0]); setEditor(JSON.stringify(query.data[0].data, null, 2)) } }, [query.data, selected])
  const save = useMutation({ mutationFn: async () => { if (!selected) throw new Error('Chưa chọn boss'); const data = JSON.parse(editor) as JsonMap; return api.saveBoss(selected.key, data, selected.version) }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bosses'] }) })
  const reload = useMutation({ mutationFn: api.reloadBosses, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bosses'] }) })
  const choose = (row: BossConfigRow) => { setSelected(row); setEditor(JSON.stringify(row.data, null, 2)) }
  return <><PageHeader title="Cấu hình Boss" description="Override được lưu trong database; không chỉnh sửa trực tiếp BossesData.java." actions={<><button className="secondary" onClick={() => reload.mutate()}><RefreshCw size={16} /> Áp dụng override</button><button className="primary" onClick={() => { if (window.confirm('Reset toàn bộ boss runtime?')) api.bossAction('resetall') }}><Swords size={16} /> Reset boss</button></>} />
    <div className="editor-layout"><section className="panel resource-list">{query.data?.map((row) => <button className={`resource-list-row ${selected?.key === row.key ? 'selected' : ''}`} onClick={() => choose(row)} key={row.key}>{(() => { const headReference = collectReferences({ outfit: row.data?.outfit }, 'bosses')[0]; return headReference ? <ReferenceThumbnail kind={headReference.kind} value={headReference.value} catalog={bossLookup.catalog} /> : <span className="list-avatar">{row.key.slice(0, 1)}</span> })()}<span><strong>{row.key}</strong><small>{row.data.name ? String(row.data.name) : 'Boss config'}</small></span><span className={`mini-status ${row.overridden ? 'active' : ''}`}>{row.overridden ? 'Override' : 'Default'}</span></button>)}{query.isLoading && <Skeleton />}</section><section className="panel json-editor-panel"><div className="panel-heading"><div><h3>{selected?.key ?? 'Chọn Boss'}</h3><p className="muted">Chỉnh full cấu hình JSON, có kiểm tra version.</p></div><button className="primary" disabled={!selected || save.isPending || !validJson} onClick={() => save.mutate()}><Save size={16} /> Lưu config</button></div><textarea className="json-editor" value={editor} onChange={(event) => setEditor(event.target.value)} spellCheck={false} />{!validJson && <div className="alert danger json-validation">JSON chưa hợp lệ — chưa thể lưu hoặc phân giải ID.</div>}<JsonReferencePreview value={editor} resource="bosses" />{save.isError && <ErrorBanner error={save.error} />}</section></div>
  </>
}

function SecurityPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['security'], queryFn: api.security })
  const [ip, setIp] = useState('')
  const [reason, setReason] = useState('Admin block')
  const block = useMutation({ mutationFn: () => api.blockIp(ip, reason), onSuccess: () => { setIp(''); queryClient.invalidateQueries({ queryKey: ['security'] }) } })
  const unblock = useMutation({ mutationFn: (value: string) => api.unblockIp(value), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['security'] }) })
  const unblockAll = useMutation({ mutationFn: api.unblockAll, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['security'] }) })
  const rows = query.data?.data ?? []
  return <><PageHeader title="Bảo mật" description="Danh sách IP bị chặn và thao tác đồng bộ firewall." actions={<button className="danger-button" onClick={() => window.confirm('Gỡ toàn bộ IP bị chặn?') && unblockAll.mutate()}><Ban size={16} /> Gỡ tất cả</button>} />
    <section className="panel block-form"><div><strong>Chặn IP</strong><span className="muted">Firewall chỉ chạy khi bật admin.firewall.enabled.</span></div><input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="203.0.113.10" /><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do" /><button className="primary" disabled={!ip || block.isPending} onClick={() => window.confirm(`Chặn IP ${ip}?`) && block.mutate()}><Ban size={16} /> Chặn IP</button></section>
    <section className="panel table-panel"><TableToolbar count={query.data?.meta?.total} onRefresh={() => query.refetch()} /><DataTable resource="security" rows={rows} columns={['id', 'blocker_ip', 'block_reason', 'blocked_at']} actions={(row) => <button className="icon-button danger-icon" onClick={() => window.confirm(`Gỡ chặn ${row.blocker_ip}?`) && unblock.mutate(String(row.blocker_ip))}><X size={16} /></button>} /></section>
  </>
}

function AntiDdosPage() {
  const queryClient = useQueryClient()
  const query = useQuery<AntiDdosStatus>({ queryKey: ['anti-ddos'], queryFn: api.antiDdos, refetchInterval: 10000 })
  const [limit, setLimit] = useState('10')
  const [seconds, setSeconds] = useState('60')
  const action = useMutation({ mutationFn: (name: 'start' | 'stop' | 'auto-scan' | 'lockdown' | 'sync') => api.antiDdosAction(name), onSuccess: (data) => { queryClient.setQueryData(['anti-ddos'], data) } })
  const save = useMutation({ mutationFn: () => api.antiDdosSettings({ connLimit: Number(limit), scanSeconds: Number(seconds) }), onSuccess: (data) => queryClient.setQueryData(['anti-ddos'], data) })
  const status = query.data
  const run = (name: 'start' | 'stop' | 'auto-scan' | 'lockdown' | 'sync') => { const label = name === 'lockdown' ? 'thay đổi Lockdown' : name; if (!window.confirm(`Xác nhận Anti-DDoS: ${label}?`)) return; action.mutate(name) }
  return <><PageHeader title="Anti-DDoS" description="Giám sát số kết nối theo IP và quản lý block list." actions={<span className={`status-badge ${status?.running ? 'success' : 'neutral'}`}>{status?.running ? 'Đang chạy' : 'Đang dừng'}</span>} />
    <div className="control-grid"><section className="panel control-card"><div className="panel-heading"><div><h3>Controls</h3><p className="muted">Game port {status?.gamePort ?? '—'} · mode {status?.mode ?? '—'}</p></div><ShieldCheck size={20} className="heading-icon" /></div><div className="button-row"><button className="primary" onClick={() => run('start')}><Activity size={16} /> Start</button><button className="secondary" onClick={() => run('stop')}><X size={16} /> Stop</button><button className={`secondary ${status?.autoScan ? 'selected-button' : ''}`} onClick={() => run('auto-scan')}><RefreshCw size={16} /> Auto scan</button><button className={`secondary ${status?.lockdown ? 'danger-selected' : ''}`} onClick={() => run('lockdown')}><Ban size={16} /> Lockdown</button><button className="secondary" onClick={() => run('sync')}><Database size={16} /> Sync firewall</button></div></section><section className="panel control-card"><div className="panel-heading"><div><h3>Scan settings</h3><p className="muted">Tự động block khi vượt ngưỡng kết nối.</p></div></div><div className="form-grid two"><label>Conn/IP limit<input type="number" min="1" value={limit} onChange={(event) => setLimit(event.target.value)} /></label><label>Scan interval (s)<input type="number" min="5" value={seconds} onChange={(event) => setSeconds(event.target.value)} /></label></div><button className="primary" onClick={() => window.confirm('Lưu cấu hình Anti-DDoS?') && save.mutate()}><Save size={16} /> Lưu settings</button></section></div>
  </>
}

function ResourcePage({ resource, title, description, readOnly = false }: { resource: string; title: string; description: string; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [topupTable, setTopupTable] = useState('moc_nap')
  const [selected, setSelected] = useState<ResourceRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editor, setEditor] = useState('{}')
  const query = useQuery({ queryKey: ['resource', resource, page, search, topupTable], queryFn: () => api.list(resource, { page, pageSize: 50, search, ...(resource === 'topup-rewards' ? { table: topupTable } : {}) }) })
  const rows = query.data?.data ?? []
  const meta = query.data?.meta
  const columns = useMemo(() => {
    const preferred = preferredColumns[resource] ?? []
    const keys = rows[0] ? Object.keys(rows[0]).filter((key) => key !== 'version') : []
    return [...preferred.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferred.includes(key))].slice(0, 9)
  }, [resource, rows])
  const save = useMutation({ mutationFn: async () => { const parsed = JSON.parse(editor) as ResourceRow; const version = selected?.version; delete parsed.version; return api.save(resource, parsed, version, selected === null, resource === 'topup-rewards' ? topupTable : undefined) }, onSuccess: () => { setSelected(null); setDrawerOpen(false); queryClient.invalidateQueries({ queryKey: ['resource', resource] }) } })
  const remove = useMutation({ mutationFn: (row: ResourceRow) => { const id = resourceId(resource, row); if (id === undefined) throw new Error('Bản ghi không có khóa chính'); return api.remove(resource, id, row.version, resource === 'topup-rewards' ? topupTable : undefined) }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resource', resource] }) })
  const playerAction = useMutation({ mutationFn: ({ id, action, body }: { id: string | number; action: 'kick' | 'buff-item' | 'revoke-item'; body?: JsonMap }) => api.playerAction(id, action, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resource', resource] }) })

  const openEditor = (row: ResourceRow | null) => { setSelected(row); setDrawerOpen(true); setEditor(JSON.stringify(row ? withoutVersion(row) : {}, null, 2)) }
  const lastPage = Math.max(1, Math.ceil(Number(meta?.total ?? 0) / Number(meta?.pageSize ?? 50)))

  return <><PageHeader title={title} description={description} actions={<><button className="secondary" onClick={() => query.refetch()}><RefreshCw size={16} /> Làm mới</button>{!readOnly && <button className="primary" onClick={() => openEditor(null)}><Save size={16} /> Thêm mới</button>}</>} />
    {(resource === 'shops' || resource === 'parts') && <div className="subresource-links"><span>Quản lý liên quan</span>{resource === 'shops' ? <><button onClick={() => navigate('/shop-tabs')}>Tabs</button><button onClick={() => navigate('/shop-items')}>Items</button><button onClick={() => navigate('/shop-options')}>Options</button></> : <><button onClick={() => navigate('/head-avatars')}>Head avatar</button><button onClick={() => navigate('/head-frames')}>Head frames</button></>}</div>}
    {resource === 'topup-rewards' && <div className="filter-strip"><span>Bảng dữ liệu</span><select value={topupTable} onChange={(event) => { setTopupTable(event.target.value); setPage(1) }}><option value="moc_nap">moc_nap</option><option value="moc_nap_top">moc_nap_top</option><option value="moc_san_boss">moc_san_boss</option><option value="moc_suc_manh">moc_suc_manh</option><option value="moc_suc_manh_top">moc_suc_manh_top</option></select></div>}
    {query.isError && <ErrorBanner error={query.error} />}
    <section className="panel table-panel"><TableToolbar count={meta?.total} search={search} onSearch={(value) => { setSearch(value); setPage(1) }} onRefresh={() => query.refetch()} /><DataTable resource={resource} rows={rows} columns={columns} loading={query.isLoading} onRowClick={openEditor} actions={!readOnly ? (row) => <button className="icon-button danger-icon" onClick={(event) => { event.stopPropagation(); if (window.confirm('Xóa bản ghi này?')) remove.mutate(row) }}><X size={16} /></button> : undefined} rowAction={resource === 'players' ? (row) => <button className="mini-action" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Kick ${row.name ?? row.id}?`)) playerAction.mutate({ id: row.id as string | number, action: 'kick' }) }}>Kick</button> : undefined} /></section>
    <div className="pagination"><span>{meta?.total ?? 0} bản ghi</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><strong>Trang {page} / {lastPage}</strong><button className="icon-button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></div>
    {drawerOpen && <EditorDrawer resource={resource} title={`${title} ${selected ? `#${resourceId(resource, selected) ?? ''}` : '· Bản ghi mới'}`} value={editor} onChange={setEditor} onClose={() => { setDrawerOpen(false); setSelected(null) }} onSave={() => { if (isJsonObjectDocument(editor)) save.mutate() }} saving={save.isPending} error={save.error} readOnly={readOnly} playerId={resource === 'players' ? selected?.id : undefined} onPlayerAction={(action, body) => { if (selected?.id !== undefined) playerAction.mutate({ id: selected.id, action, body }) }} />}
  </>
}

function TableToolbar({ count, search, onSearch, onRefresh }: { count?: unknown; search?: string; onSearch?: (value: string) => void; onRefresh?: () => void }) {
  return <div className="table-toolbar"><div className="toolbar-search">{onSearch ? <><Search size={17} /><input value={search ?? ''} onChange={(event) => onSearch(event.target.value)} placeholder="Tìm kiếm…" /></> : <span className="muted">Danh sách</span>}</div><div className="toolbar-meta"><span>{String(count ?? 0)} bản ghi</span>{onRefresh && <button className="icon-button" onClick={onRefresh} aria-label="Làm mới"><RefreshCw size={16} /></button>}</div></div>
}

function DataTable({ resource = 'security', rows, columns, loading, onRowClick, actions, rowAction }: { resource?: string; rows: ResourceRow[]; columns: string[]; loading?: boolean; onRowClick?: (row: ResourceRow) => void; actions?: (row: ResourceRow) => React.ReactNode; rowAction?: (row: ResourceRow) => React.ReactNode }) {
  const lookup = useRowReferenceCatalog(rows, resource)
  if (loading) return <div className="table-empty"><RefreshCw className="spin" size={20} /> Đang tải dữ liệu…</div>
  if (!rows.length) return <div className="table-empty"><Database size={22} /><strong>Chưa có dữ liệu</strong><span className="muted">Thử đổi điều kiện tìm kiếm hoặc reload database.</span></div>
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{labelFor(column)}</th>)}{rowAction && <th>Runtime</th>}{actions && <th />}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row.id ?? index)}-${index}`} onClick={() => onRowClick?.(row)} className={onRowClick ? 'clickable' : ''}>{columns.map((column) => <td key={column}><ReferenceCell resource={resource} field={column} value={row[column]} catalog={lookup.catalog} /></td>)}{rowAction && <td>{rowAction(row)}</td>}{actions && <td>{actions(row)}</td>}</tr>)}</tbody></table></div>
}

function EditorDrawer({ resource, title, value, onChange, onClose, onSave, saving, error, readOnly = false, playerId, onPlayerAction }: { resource: string; title: string; value: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void; saving?: boolean; error?: unknown; readOnly?: boolean; playerId?: string | number; onPlayerAction?: (action: 'buff-item' | 'revoke-item', body: JsonMap) => void }) {
  const [initialValue, setInitialValue] = useState(value)
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [removeAll, setRemoveAll] = useState(false)
  const validJson = isJsonObjectDocument(value)
  useEffect(() => { setInitialValue(value) }, [title])
  const dirty = !readOnly && value !== initialValue
  const close = () => { if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Đóng editor?')) return; onClose() }
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])
  const validItemId = /^\d+$/.test(itemId) && Number(itemId) <= 2_000_000
  const validQuantity = /^\d+$/.test(quantity) && Number(quantity) > 0 && Number(quantity) <= 1_000_000_000
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="editor-drawer" role="dialog" aria-modal="true" aria-label={title}><div className="drawer-heading"><div><p className="eyebrow">JSON EDITOR</p><h3>{title} {dirty && <span className="dirty-badge">Chưa lưu</span>}</h3></div><button className="icon-button" onClick={close} aria-label="Đóng editor"><X size={19} /></button></div><div className="drawer-body"><div className="drawer-note"><FileCode2 size={16} /> Giữ nguyên cấu trúc JSON mà game backend đang sử dụng.</div>{playerId !== undefined && <div className="player-tools"><strong>Hành trang nhanh</strong><div className="player-tools-row"><LookupSelect kind="items" value={itemId} onChange={setItemId} placeholder="Chọn item theo tên…" /><input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="SL" inputMode="numeric" /><button className="secondary" disabled={!validItemId || !validQuantity} onClick={() => onPlayerAction?.('buff-item', { itemId: Number(itemId), quantity: Number(quantity) })}>Buff</button><button className="danger-button" disabled={!validItemId || !validQuantity} onClick={() => onPlayerAction?.('revoke-item', { itemId: Number(itemId), quantity: Number(quantity), removeAll })}>Thu hồi</button></div><label className="check-line"><input type="checkbox" checked={removeAll} onChange={(event) => setRemoveAll(event.target.checked)} /> Thu hồi toàn bộ item cùng ID</label></div>}<textarea className="json-editor drawer-json" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} spellCheck={false} />{!validJson && <div className="alert danger json-validation">JSON chưa hợp lệ — chưa thể lưu hoặc phân giải ID.</div>}<JsonReferencePreview value={value} resource={resource} />{Boolean(error) && <ErrorBanner error={error} />}</div><div className="drawer-actions"><button className="secondary" onClick={close}>Hủy</button>{!readOnly && <button className="primary" onClick={onSave} disabled={saving || !validJson}><Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>}</div></aside></div>
}

function ErrorBanner({ error }: { error: unknown }) {
  return <div className="alert danger"><AlertTriangle size={16} />{error instanceof Error ? error.message : 'Có lỗi xảy ra'}</div>
}

function Skeleton() {
  return <div className="skeleton-block"><span /><span /><span /></div>
}

function ScreenLoader() {
  return <div className="screen-loader"><div className="spinner" /><span>Đang kết nối management API…</span></div>
}

const resourceIdFields: Record<string, string> = { 'head-avatars': 'head_id' }

function resourceId(resource: string, row: ResourceRow) {
  const field = resourceIdFields[resource] ?? 'id'
  return row[field] as string | number | undefined
}

function withoutVersion(row: ResourceRow) {
  const result = { ...row }
  delete result.version
  return result
}

export default App
