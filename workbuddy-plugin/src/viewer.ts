import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { basename, join } from 'node:path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ScrcpyStreamSink, VideoDevice } from './scrcpy-stream.ts'
import { acceptStreamWebSocket } from './websocket.ts'
import { viewerPage } from './viewer-page.ts'
import { TaskPlan } from './todos.ts'
import { OpenGuiError } from './errors.ts'
import { HUMAN_CONTROL_WAIT_MS } from './state.ts'
import { waitForEvent, type ToolProgress } from './task-events.ts'
import { encodeTakeoverInput, type FrameSize } from './scrcpy-control.ts'
import type { EmulatorStatus } from './android-emulator.ts'
import type { DeviceActionEvent } from './trace-labels.ts'
import { Workbench, type BoardAction } from './workbench.ts'
import { zip, wordReport } from './report-export.ts'
import { pdfReport, type ReportEvidence } from './pdf-report.ts'
import type { TaskStore, StoredTask } from './task-store.ts'
import type { CoreMateClient } from './coremate-client.ts'
import type { DeviceChoice, DeviceInfo } from './device-info.ts'
import type { ConnectionDiagnostic } from './connection-diagnostics.ts'

export interface ViewerDevice extends VideoDevice, Partial<Pick<DeviceInfo, 'model' | 'manufacturer' | 'os' | 'osVersion' | 'sdk' | 'connection'>> { readonly name: string }
export interface ViewerStreams {
  prepare(signal: AbortSignal, devices?: readonly VideoDevice[]): Promise<void>
  subscribe(device: VideoDevice, sink: ScrcpyStreamSink): Promise<() => void>
  /** Person-driven takeover input on the live stream (Android); absent where unsupported. */
  inject?(device: VideoDevice, message: Buffer): boolean
  frameSize?(device: VideoDevice): FrameSize | undefined
  dispose(): Promise<void>
}
type Phase = 'preparing' | 'waiting_for_frame' | 'ready' | 'disconnected' | 'error' | 'closed'
interface Connection {
  id: string; deviceId: string; sink: ScrcpyStreamSink; challenge: string
  issued: number; painted: number; connectedAt: number; media: boolean; release?: () => void
}
interface Viewer {
  id: string; token: string; owner: string; devices: readonly ViewerDevice[]
  phase: Phase; deadline: number; established: boolean; ended: boolean
  firstFrameMs?: number; error?: string; connections: Map<string, Connection>; pages: Set<ScrcpyStreamSink>; lastPage: number
  preparation?: Promise<void>; readyDevices: Set<string>; plan: TaskPlan
  board: Workbench; boardToken: string
  principal: string
  modelSelectionError?: string | undefined
  reportExports?: { md?: string; pdf?: string; docx?: string; chatMarkdown?: string; error?: string }
  reportExportKey?: string
  binding?: boolean
  selectionRequested?: boolean
  devicePreferenceError?: string | undefined
  /** A new task waits in the workbench until the person confirms model and device and starts it. */
  awaitingStart?: boolean
  workbenchManaged?: boolean
  starting?: boolean
  nextTask?: Promise<{ viewerId: string; workbenchUrl: string }>
  suggestedDeviceId?: string | undefined
  /** Live views of a candidate device on the start page; never the task's display. */
  previews?: Set<ScrcpyStreamSink>
}

/** File name the chat shows for archived reports; test runs match the 检查报告 wording of the workbench design. */
function reportName(v: Viewer): string {
  return v.board.scenario === 'testing' ? '检查报告' : '任务报告'
}

/** Ready-to-paste chat block; WorkBuddy renders local Markdown links as clickable files. */
export function reportLinks(files: { md?: string; docx?: string; pdf?: string }): string | undefined {
  const links = [files.md, files.docx, files.pdf].filter((path): path is string => Boolean(path))
    .map(path => `[${basename(path)}](${/[\s()<>]/u.test(path) ? `<${path}>` : path})`)
  return links.length ? `输出文件：\n\n${links.join('　')}` : undefined
}

/** Download name unique per task: opengui-report-YYYYMMDD-HHmmss from the task's local start time. */
export function reportFileName(createdAt: string): string {
  const time = new Date(createdAt), pad = (value: number) => String(value).padStart(2, '0')
  if (Number.isNaN(time.getTime())) return 'opengui-report'
  return `opengui-report-${time.getFullYear()}${pad(time.getMonth() + 1)}${pad(time.getDate())}-${pad(time.getHours())}${pad(time.getMinutes())}${pad(time.getSeconds())}`
}

/** Watching grants never contain a control credential or renew a control lease. */
export class ViewerServer {
  private server: Server | undefined
  private starting: Promise<void> | undefined
  private origin = ''
  private readonly viewers = new Map<string, Viewer>()
  private accountBusy = false
  private boardHandler: ((id: string, action: BoardAction) => Promise<void>) | undefined
  private budgetHandler: ((id: string, additional: number, operationLimit: number, inferenceLimit: number) => Promise<void>) | undefined
  private deviceListHandler: ((signal: AbortSignal, refresh: boolean, viewerId: string) => Promise<readonly DeviceChoice[]>) | undefined
  private deviceSelectHandler: ((id: string, deviceId: string) => Promise<void>) | undefined
  private startHandler: ((id: string, deviceId: string, request?: string, comments?: { enabled: boolean; budget?: unknown }) => Promise<void>) | undefined
  private newTaskHandler: ((id: string) => Promise<{ viewerId: string; workbenchUrl: string }>) | undefined
  private emulatorStatusHandler: ((signal: AbortSignal) => Promise<EmulatorStatus>) | undefined
  private emulatorActionHandler: ((input: Record<string, unknown>) => void) | undefined
  private previewDeviceHandler: ((id: string, deviceId: string, signal: AbortSignal) => Promise<VideoDevice>) | undefined
  private previewFrameHandler: ((id: string, deviceId: string, signal: AbortSignal) => Promise<Buffer>) | undefined
  private connectionDiagnosticHandler: ((signal: AbortSignal) => Promise<ConnectionDiagnostic>) | undefined
  private readonly taskListeners = new Map<string, Set<() => void>>()
  private readonly queuedChanges = new Set<string>()
  onTaskChange(id: string, listener: () => void): () => void {
    const listeners = this.taskListeners.get(id) ?? new Set<() => void>()
    listeners.add(listener); this.taskListeners.set(id, listeners)
    return () => { listeners.delete(listener); if (!listeners.size) this.taskListeners.delete(id) }
  }
  private taskChanged(id: string): void {
    if (this.queuedChanges.has(id)) return
    this.queuedChanges.add(id)
    // Publish after the whole synchronous mutation commits, never half a node transition.
    queueMicrotask(() => {
      this.queuedChanges.delete(id)
      for (const listener of this.taskListeners.get(id) ?? []) listener()
    })
  }
  private readonly sweep: ReturnType<typeof setInterval>
  constructor(private readonly streams: ViewerStreams, private readonly now = Date.now, private readonly store?: TaskStore, readonly account?: CoreMateClient, private readonly options: { port?: number; consoleKey?: Buffer } = {}) {
    this.sweep = setInterval(() => {
      for (const viewer of this.viewers.values()) {
        this.update(viewer)
        for (const connection of viewer.connections.values()) {
          if (this.now() - Math.max(connection.painted, connection.connectedAt) > 12_000) connection.sink.close(1001, 'page_inactive')
        }
        if (viewer.ended && viewer.pages.size === 0 && viewer.connections.size === 0 && this.now() - viewer.lastPage > 300_000) this.viewers.delete(viewer.id)
      }
    }, 1000)
    this.sweep.unref()
  }

  get active(): boolean {
    return [...this.viewers.values()].some(v => v.phase !== 'closed' && (v.pages.size > 0 || v.connections.size > 0 || this.now() - v.lastPage < 15_000))
  }

  async open(owner: string, devices: readonly ViewerDevice[], signal: AbortSignal, resumeTaskId?: string, reuseGuide = false) {
    if (this.accountBusy) throw new Error('account_change_in_progress')
    if (!owner) throw new Error('host_task_required')
    if (devices.length > 4 || new Set(devices.map(d => d.id)).size !== devices.length) throw new Error('invalid_viewer_devices')
    let viewer = [...this.viewers.values()].find(v => v.owner === owner && v.principal === (this.account?.scope ?? 'local') && ((v.devices.length > 0) === (devices.length > 0) || (reuseGuide && !v.devices.length)) && (!v.ended || Boolean(v.error)))
    if (viewer && resumeTaskId && viewer.id !== resumeTaskId) throw new Error('different_task_active: finish the current task before recovering another')
    if (viewer && !this.same(viewer, devices)) {
      if (!viewer.devices.length && devices.length) await this.bindDevices(viewer.id, devices, signal)
      else throw new Error('device_frozen')
    }
    if (!viewer) {
      if (this.viewers.size >= 100) throw new Error('viewer_capacity')
      const saved = resumeTaskId ? this.recoveryTask(resumeTaskId) : undefined
      if (saved && (saved.devices.length !== devices.length || saved.devices.some(d => !devices.some(selected => selected.serial === d.serial)))) throw new Error('device_frozen: resume only the original device')
      const restoredBoard = saved ? structuredClone(saved.board) : undefined
      if (saved && restoredBoard) {
        // Legacy random ids may change, but historical traces still refer to the same exact serial.
        const identities = new Map(saved.devices.map(old => [old.id, devices.find(current => current.serial === old.serial)!.id]))
        if (restoredBoard.apk) restoredBoard.apk.deviceId = identities.get(restoredBoard.apk.deviceId) ?? restoredBoard.apk.deviceId
        if (restoredBoard.environment) restoredBoard.environment.deviceId = identities.get(restoredBoard.environment.deviceId) ?? restoredBoard.environment.deviceId
        if (restoredBoard.inputDiagnostic) restoredBoard.inputDiagnostic.deviceId = identities.get(restoredBoard.inputDiagnostic.deviceId) ?? restoredBoard.inputDiagnostic.deviceId
        if (restoredBoard.connectionRecovery) restoredBoard.connectionRecovery.deviceId = identities.get(restoredBoard.connectionRecovery.deviceId) ?? restoredBoard.connectionRecovery.deviceId
        restoredBoard.traces = restoredBoard.traces.map(trace => ({ ...trace, deviceId: identities.get(trace.deviceId) ?? trace.deviceId }))
        if (restoredBoard.executionBudget) restoredBoard.executionBudget.operations = Object.fromEntries(Object.entries(restoredBoard.executionBudget.operations).map(([id, count]) => [identities.get(id) ?? id, count]))
      }
      viewer = { id: saved?.id ?? randomUUID(), token: randomBytes(32).toString('base64url'), boardToken: randomBytes(32).toString('base64url'), board: new Workbench(), owner, principal: this.account?.scope ?? 'local', devices: [...devices], phase: 'preparing', deadline: 0, established: false, ended: false, connections: new Map(), pages: new Set(), readyDevices: new Set(), plan: new TaskPlan(), lastPage: this.now() }
      const archived = viewer
      viewer.board = new Workbench(restoredBoard, this.store ? {
        save: () => this.persist(archived),
        capture: (_id, name, data) => this.store!.evidence(archived.id, name, data),
        previousComment: (account, target) => this.store!.previousComment(account, target, archived.id, archived.principal),
      } : undefined, this.now, () => this.taskChanged(archived.id))
      if (saved && !devices.length && !saved.board.result) { viewer.board.control = 'idle'; viewer.selectionRequested = Boolean(viewer.board.objective) }
      if (!saved && this.account) {
        try { viewer.board.modelConfig = await this.account.selectedModel(signal) }
        catch { viewer.modelSelectionError = '模型目录不可用或原选择已移除，请重新选择执行模型'; viewer.principal = this.account.scope }
      }
      if (saved) viewer.plan.restore(saved.todos)
      if (saved) {
        const previous = this.viewers.get(saved.id)
        if (previous) {
          if (!previous.ended && previous.board.control !== 'ended') throw new Error('different_task_active')
          this.closeViewer(previous.id, previous.owner)
        }
      }
      this.viewers.set(viewer.id, viewer)
      const current = viewer
      viewer.preparation = (async () => { try {
        if (devices.length) await this.streams.prepare(signal, devices)
        await this.start()
        current.deadline = devices.length ? this.now() + 30_000 : 0
        current.phase = devices.length ? 'waiting_for_frame' : 'ready'
      } catch (error) {
        current.phase = 'error'
        current.error = `dependency_prepare_failed: ${String(error)}`
      } })()
    }
    await viewer.preparation
    this.persist(viewer)
    if (viewer.phase === 'closed' && viewer.established) viewer.phase = 'disconnected'
    // A repeated tool call cannot reset a failed first-display deadline.
    return { ...this.snapshot(viewer), workbenchUrl: `${this.url(viewer.id)}#board=${viewer.boardToken}` }
  }

  find(owner: string, devices: readonly ViewerDevice[], id?: string): string {
    if (this.accountBusy) throw new Error('account_change_in_progress')
    const viewer = id ? this.require(id, owner) : [...this.viewers.values()].find(v => v.owner === owner && v.principal === (this.account?.scope ?? 'local') && !v.ended && this.same(v, devices))
    if (viewer && viewer.principal !== (this.account?.scope ?? 'local')) throw new Error('foreign_account: start a task under the current account')
    if (viewer?.modelSelectionError) throw new Error('model_selection_required: explicitly choose an available model or follow WorkBuddy before control')
    if ((viewer ? viewer.awaitingStart : [...this.viewers.values()].some(v => v.owner === owner && v.awaitingStart && !v.ended))) throw new Error('start_required: the user has not clicked 开始执行 in the workbench yet; call opengui_viewer_status with waitMs 600000 and await the start event, never open control before it returns startRequired false')
    if (!viewer || viewer.ended || !this.same(viewer, devices)) throw new Error('display_required: open the viewer for this task and these devices first')
    this.update(viewer)
    if (!viewer.established && ['closed', 'error'].includes(viewer.phase)) throw new Error(viewer.error ?? 'display_required')
    return viewer.id
  }

  assertReady(id: string): void {
    const viewer = this.require(id)
    this.update(viewer)
    if (!viewer.established) throw new Error(viewer.error ?? 'waiting_for_frame: visible decoded video is required before observation or action')
  }

  async status(id: string, owner: string, waitMs = 0, signal?: AbortSignal, onProgress?: ToolProgress) {
    const viewer = this.require(id, owner)
    let reported = ''
    await waitForEvent(listener => this.onTaskChange(id, listener), () => {
      this.update(viewer)
      const message = viewer.established ? '设备画面已连接，开始执行任务。'
        : viewer.ended || ['closed', 'error'].includes(viewer.phase) ? '本次任务已停止，请查看右侧原因。'
        : viewer.awaitingStart ? '请在右侧确认任务、模型和设备，点击「开始执行」。'
        : '正在连接设备画面，请稍候。'
      if (message !== reported) { reported = message; onProgress?.(message) }
      return viewer.established || viewer.ended || ['closed', 'error'].includes(viewer.phase)
    }, Math.min(HUMAN_CONTROL_WAIT_MS, Math.max(0, waitMs)), signal ?? new AbortController().signal)
    return this.snapshot(viewer)
  }

  closeViewer(id: string, owner: string) {
    const viewer = this.require(id, owner)
    viewer.phase = 'closed'
    this.taskChanged(viewer.id)
    for (const c of viewer.connections.values()) c.sink.close(1000, 'viewer_closed')
    for (const page of viewer.pages) page.close(1000, 'viewer_closed')
    this.closePreviews(viewer)
    return this.snapshot(viewer)
  }
  writeTodos(id: string, owner: string, todos: unknown) {
    const viewer = this.require(id, owner)
    if (viewer.ended) throw new Error('task_ended: cannot update an ended task plan')
    viewer.plan.revise(todos)
    this.persist(viewer)
    return { viewerId: viewer.id, todos: viewer.plan.todos, progress: viewer.plan.progress() }
  }
  progress(id: string) { return this.require(id).plan.progress() }
  taskSteps(id: string) { return this.require(id).plan.todos }
  board(id: string): Workbench { return this.require(id).board }
  setBoardHandler(handler: (id: string, action: BoardAction) => Promise<void>): void { this.boardHandler = handler }
  setBudgetHandler(handler: (id: string, additional: number, operationLimit: number, inferenceLimit: number) => Promise<void>): void { this.budgetHandler = handler }
  setDeviceHandlers(list: (signal: AbortSignal, refresh: boolean, viewerId: string) => Promise<readonly DeviceChoice[]>, select: (id: string, deviceId: string) => Promise<void>): void { this.deviceListHandler = list; this.deviceSelectHandler = select }
  setConnectionDiagnosticHandler(handler: (signal: AbortSignal) => Promise<ConnectionDiagnostic>): void { this.connectionDiagnosticHandler = handler }
  requestDeviceSelection(id: string): void { this.require(id).selectionRequested = true }
  setStartHandler(handler: (id: string, deviceId: string, request?: string, comments?: { enabled: boolean; budget?: unknown }) => Promise<void>): void { this.startHandler = handler }
  setNewTaskHandler(handler: (id: string) => Promise<{ viewerId: string; workbenchUrl: string }>): void { this.newTaskHandler = handler }
  manageInWorkbench(id: string, enabled = true): void { this.require(id).workbenchManaged = enabled }
  isWorkbenchManaged(id: string): boolean { return this.require(id).workbenchManaged === true }
  detachFromHost(id: string): string { const v = this.require(id); v.owner = `workbench:${id}`; this.persist(v); return v.owner }
  setEmulatorHandlers(status: (signal: AbortSignal) => Promise<EmulatorStatus>, action: (input: Record<string, unknown>) => void): void { this.emulatorStatusHandler = status; this.emulatorActionHandler = action }
  /** Resolve a selectable candidate for a start-page live view, as video or a single frame. */
  setPreviewHandlers(device: (id: string, deviceId: string, signal: AbortSignal) => Promise<VideoDevice>, frame: (id: string, deviceId: string, signal: AbortSignal) => Promise<Buffer>): void { this.previewDeviceHandler = device; this.previewFrameHandler = frame }
  /** Hold a new task for the person's explicit start; the original request is shown for confirmation. */
  requireStart(id: string, suggestedDeviceId?: string, request?: string): void {
    const v = this.require(id)
    v.awaitingStart = true; v.selectionRequested = true; v.suggestedDeviceId = suggestedDeviceId
    if (request && !v.board.request) v.board.request = request.slice(0, 4000)
    this.persist(v)
  }
  awaitingStart(id: string): boolean { return Boolean(this.require(id).awaitingStart) }
  markStarted(id: string): void { const v = this.require(id); v.awaitingStart = false; v.suggestedDeviceId = undefined; this.closePreviews(v); this.persist(v) }
  private closePreviews(v: Viewer): void { for (const sink of v.previews ?? []) sink.close(1000, 'preview_ended'); v.previews?.clear() }
  private previewAllowed(v: Viewer): boolean { return Boolean(v.awaitingStart) && !v.ended && v.phase !== 'closed' && v.principal === (this.account?.scope ?? 'local') }
  private async previewStream(v: Viewer, deviceId: string, req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reject = (): void => { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n') }
    if (!this.previewDeviceHandler || !/^[A-Za-z0-9_-]{1,160}$/u.test(deviceId) || !this.previewAllowed(v) || (v.previews?.size ?? 0) >= 2) { reject(); return }
    let device: VideoDevice
    try { device = await this.previewDeviceHandler(v.id, deviceId, AbortSignal.timeout(8000)) } catch { reject(); return }
    if (!this.previewAllowed(v) || socket.destroyed) { reject(); return }
    const sink = acceptStreamWebSocket(req, socket, head), previews = v.previews ??= new Set()
    let release: (() => void) | undefined, closed = false
    previews.add(sink)
    sink.onClose(() => { closed = true; release?.(); previews.delete(sink) })
    void this.streams.subscribe(device, sink).then(stop => { if (closed) stop(); else release = stop }).catch(error => {
      sink.sendText(JSON.stringify({ type: 'error', message: String(error) })); sink.close(1011, 'video_failed')
    })
  }
  devicePreferenceError(id: string, error?: string): void { this.require(id).devicePreferenceError = error }
  awaitingDeviceTask(id: string): boolean {
    const v = this.require(id); this.update(v)
    // Before control starts, a device or model choice in the workbench is an intentional wait.
    return Boolean((v.selectionRequested || v.modelSelectionError || v.awaitingStart) && v.board.objective && !v.ended && !v.error && v.phase !== 'closed' && v.board.control === 'idle')
  }
  async bindDevices(id: string, devices: readonly ViewerDevice[], signal: AbortSignal): Promise<void> {
    const v = this.require(id)
    this.update(v)
    if (this.accountBusy || v.principal !== (this.account?.scope ?? 'local')) throw new Error('foreign_account')
    if (v.binding || v.ended || v.board.control !== 'idle' || v.error || v.phase === 'closed') throw new Error('device_binding_unavailable')
    if (v.devices.length) { if (this.same(v, devices)) return; throw new Error('device_frozen') }
    if (devices.length !== 1) throw new Error('one_device_required')
    v.binding = true
    try {
      await this.streams.prepare(signal, devices)
      signal.throwIfAborted()
      if (this.accountBusy || v.principal !== (this.account?.scope ?? 'local') || v.board.control !== 'idle' || v.ended || ['closed'].includes(v.phase)) throw new Error('device_binding_unavailable')
      v.devices = [...devices]; v.phase = 'waiting_for_frame'; v.deadline = this.now() + 30_000
      try { this.persist(v) } catch (error) { v.devices = []; v.phase = 'ready'; v.deadline = 0; throw error }
    } finally { v.binding = false }
  }
  selectedDeviceIds(id: string): readonly string[] { return this.require(id).devices.map(device => device.id) }
  private async chooseModel(v: Viewer, modelId: unknown): Promise<void> {
    if (this.accountBusy) throw new Error('account_change_in_progress')
    if (v.principal !== (this.account?.scope ?? 'local')) throw new Error('foreign_account')
    if (v.board.control !== 'idle') throw new Error('model_locked: select before starting a task')
    if (modelId === 'host') { this.account?.selectModel(); v.board.modelConfig = undefined }
    else {
      const selected = (await this.account?.models())?.find(model => model.id === modelId)
      if (!selected) throw new Error('model_not_configured')
      this.account?.selectModel(selected.id)
      v.board.modelConfig = selected
    }
    v.modelSelectionError = undefined
    v.board.checkpoint()
  }
  /** Host-private recovery source; never return raw serials through a public tool or HTTP route. */
  recoveryTask(id: string): StoredTask {
    if (this.accountBusy) throw new Error('account_change_in_progress')
    const saved = this.store?.load(id)
    if (!saved) throw new Error('task_history_unavailable')
    if ((saved.principal ?? 'local') !== (this.account?.scope ?? 'local')) throw new Error('foreign_account: sign in with the original task account before recovery')
    if (saved.displayError?.startsWith('display_timeout')) throw new Error('display_timeout: do not bypass a failed first-display gate with task recovery')
    if (saved.board.result && ['completed', 'cancelled', 'stopped'].includes(saved.board.result.outcome)) throw new Error('task_ended: create a new run; never reuse old sending approvals or extend an exhausted budget')
    if (saved.devices.length > 4 || saved.devices.some(device => typeof device.id !== 'string' || !device.id || typeof device.serial !== 'string' || !device.serial || device.serial.length > 1024) || new Set(saved.devices.map(device => device.serial)).size !== saved.devices.length || new Set(saved.devices.map(device => device.id)).size !== saved.devices.length) throw new Error('invalid_task_devices')
    return saved
  }
  history(taskId?: string) {
    if (taskId) {
      if (!this.store) throw new Error('task_history_unavailable')
      const saved = this.store.load(taskId)
      if ((saved.principal ?? 'local') !== (this.account?.scope ?? 'local')) throw new Error('foreign_account')
      return { taskId: saved.id, board: saved.board, todos: saved.todos, devices: saved.devices.map(d => ({ id: d.id, name: d.name, serialSuffix: d.serial.slice(-4) })), archivePath: this.store.path(saved.id) }
    }
    return this.store?.list().filter(task => task.board.objective && (task.principal ?? 'local') === (this.account?.scope ?? 'local')).map(task => ({ taskId: task.id, objective: task.board.objective, outcome: task.board.result?.outcome ?? 'interrupted',
      devices: task.devices.map(d => ({ id: d.id, name: d.name, serialSuffix: d.serial.slice(-4) })), updatedAt: task.updatedAt, reportPath: join(this.store!.path(task.id), 'report.md') })) ?? []
  }
  private evidence(v: Viewer): ReportEvidence[] {
    const files = v.board.snapshot().evidenceFiles
    return this.store ? Object.entries(files).map(([observationId, name]) => ({ observationId, name, data: this.store!.readEvidence(v.id, name) }))
      : [...v.board.evidence].map(([observationId, data]) => ({ observationId, name: files[observationId] ?? `${v.board.evidenceName(observationId)}.jpg`, data }))
  }
  async archiveReports(id: string): Promise<void> {
    if (!this.store) return
    const v = this.require(id), markdown = v.board.markdown(v.plan.todos, { devices: v.devices.map(d => d.name) })
    const key = createHash('sha256').update(markdown).digest('hex')
    if (v.reportExportKey === key && v.reportExports?.md && v.reportExports.pdf && v.reportExports.docx) return
    v.reportExports = {}
    const name = reportName(v)
    try {
      v.reportExports.md = this.store.exportReport(id, 'md', markdown, name)
      v.reportExports.docx = this.store.exportReport(id, 'docx', wordReport(markdown), name)
      v.reportExports.pdf = this.store.exportReport(id, 'pdf', await pdfReport(markdown, this.evidence(v)), name)
      const links = reportLinks(v.reportExports), console = this.consoleUrl(id)
      const chat = [links, console ? `[打开控制台](${console})` : ''].filter(Boolean).join('\n\n')
      if (chat) v.reportExports.chatMarkdown = chat
      v.reportExportKey = key
    } catch { v.reportExports.error = '报告导出未完成，请检查本地证据与存储空间。Markdown 与已有证据保留。' }
  }
  reportFiles(id: string) { return this.require(id).reportExports }
  /** Push a dispatched phone action to open workbench pages for the cursor animation (display only). */
  announceAction(id: string, deviceId: string, action: DeviceActionEvent): void {
    const v = this.viewers.get(id)
    if (!v || v.phase === 'closed' || !v.devices.some(device => device.id === deviceId)) return
    const text = JSON.stringify({ type: 'action', deviceId, action })
    for (const page of v.pages) page.sendText(text)
  }
  /** A durable, signed link back to this task's workbench for the chat's 打开控制台; undefined without a key. */
  consoleUrl(id: string): string | undefined {
    return this.options.consoleKey && this.origin ? `${this.origin}/console/${id}?k=${this.consoleMac(id)}` : undefined
  }
  private consoleMac(id: string): string { return createHmac('sha256', this.options.consoleKey!).update(`console:${id}`).digest('base64url').slice(0, 32) }
  /** Reopen a task from a console link: the live workbench, or a read-only view restored from the archive. */
  private openConsole(id: string, mac: string, res: ServerResponse): void {
    const expected = this.options.consoleKey && /^[0-9a-f-]{36}$/iu.test(id) ? this.consoleMac(id) : ''
    if (!expected || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) { res.writeHead(404).end(); return }
    let v = this.viewers.get(id)
    if (!v || v.phase === 'closed') {
      let saved: StoredTask | undefined
      try { saved = this.store?.load(id) } catch { saved = undefined }
      if (!saved || this.viewers.size >= 100) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('任务记录不存在或已删除'); return }
      const plan = new TaskPlan()
      plan.restore(saved.todos); plan.pause()
      v = { id: saved.id, token: randomBytes(32).toString('base64url'), boardToken: randomBytes(32).toString('base64url'), board: new Workbench(structuredClone(saved.board), undefined, this.now), owner: 'console', principal: saved.principal ?? 'local', devices: [], phase: 'ready', deadline: 0, established: false, ended: true, connections: new Map(), pages: new Set(), readyDevices: new Set(), plan, lastPage: this.now() }
      this.viewers.set(v.id, v)
    }
    res.writeHead(302, { Location: `/${v.token}/#board=${v.boardToken}` }).end()
  }
  private persist(v: Viewer): void {
    if (this.store) {
      const task: StoredTask = { version: 1, id: v.id, owner: v.owner, principal: v.principal, devices: v.devices, board: v.board.snapshot(), todos: v.plan.todos, updatedAt: new Date().toISOString(), displayError: v.error }
      this.store.save(task, v.board.markdown(v.plan.todos, { devices: v.devices.map(d => d.name) }))
    }
    this.taskChanged(v.id)
  }

  /** Called only through an owned control session, before dispatching phone work. */
  syncNode(id: string, index: unknown, evidenceObservationId?: string, stepId?: string): void {
    const viewer = this.require(id)
    if (viewer.ended) throw new OpenGuiError('task_ended', 'opengui: task has ended', 'not_executed', 'stop')
    viewer.plan.select(index, evidenceObservationId, stepId)
    this.persist(viewer)
  }
  beginTest(id: string, caseId: string, stepId?: string, evidenceObservationId?: string) {
    const viewer = this.require(id)
    if (viewer.ended) throw new OpenGuiError('task_ended', 'opengui: task has ended', 'not_executed', 'stop')
    return viewer.plan.selectWith(stepId, evidenceObservationId, () => viewer.board.beginTest(caseId))
  }
  finishNodes(id: string): void { const v = this.require(id); v.plan.finish(); this.persist(v) }
  pauseNodes(id: string): void { const v = this.require(id); v.plan.pause(); this.persist(v) }
  awaitUser(id: string, waiting: boolean): void { const v = this.require(id); v.plan.awaitUser(waiting); this.persist(v) }
  settleNode(id: string, stepId: string, status: 'failed' | 'skipped', reason: string): void { const v = this.require(id); v.plan.settle(stepId, status, reason); this.persist(v) }
  endOwner(owner: string): void { for (const v of this.viewers.values()) if (v.owner === owner && !v.workbenchManaged) { v.ended = true; v.plan.pause(); this.closePreviews(v); this.persist(v) } }
  endTask(id: string): void { const viewer = this.require(id); viewer.ended = true; viewer.plan.pause(); this.persist(viewer) }
  url(id: string): string { const v = this.require(id); return `${this.origin}/${v.token}/` }
  async dispose(): Promise<void> {
    clearInterval(this.sweep)
    for (const v of this.viewers.values()) this.closeViewer(v.id, v.owner)
    await this.streams.dispose()
    this.server?.closeAllConnections()
    await new Promise<void>(resolve => this.server ? this.server.close(() => resolve()) : resolve())
  }

  private same(v: Viewer, devices: readonly ViewerDevice[]): boolean {
    return v.devices.length === devices.length && devices.every(d => v.devices.some(x => x.id === d.id && x.serial === d.serial))
  }
  private require(id: string, owner?: string): Viewer {
    const v = this.viewers.get(id)
    if (!v || (owner !== undefined && v.owner !== owner)) throw new Error('foreign_viewer')
    return v
  }
  private update(v: Viewer): void {
    if (!v.ended && v.board.control !== 'ended' && !v.established && v.deadline && this.now() >= v.deadline && !['closed', 'error'].includes(v.phase)) {
      v.phase = 'error'; v.error = 'display_timeout: no visible first video frame within 30 seconds; stop this task'
      v.board.control = 'ended'
      v.board.result = { outcome: 'blocked', summary: '设备画面未在 30 秒内完成首帧验证，本次任务受阻。尚未取得手机控制权，未执行手机操作；原目标与清单已保留。' }
      v.plan.pause()
      this.persist(v)
      void this.archiveReports(v.id).catch(() => undefined)
    }
  }
  private snapshot(v: Viewer) {
    this.update(v)
    return { viewerId: v.id, url: this.url(v.id), state: v.phase, firstDisplayEstablished: v.established, todos: v.plan.todos, progress: v.plan.progress(), board: v.board.snapshot(), reportExports: v.reportExports, reportFileName: reportFileName(v.board.createdAt),
      selectionRequired: !v.devices.length, selectionRequested: Boolean(v.selectionRequested), startRequired: Boolean(v.awaitingStart), workbenchManaged: Boolean(v.workbenchManaged), ...(v.suggestedDeviceId ? { suggestedDeviceId: v.suggestedDeviceId } : {}), selectionBusy: Boolean(v.binding || v.starting), canSelectDevice: !v.binding && !v.starting && !v.devices.length && !v.ended && v.board.control === 'idle' && !v.error && v.phase !== 'closed', devicePreferenceError: v.devicePreferenceError,
      account: { ...(this.account?.status() ?? { serviceUrl: '', user: null }), busy: this.accountBusy },
      ...(v.modelSelectionError ? { modelSelectionError: v.modelSelectionError } : {}),
      ...(this.store ? { archivePath: this.store.path(v.id) } : {}),
      ...(v.firstFrameMs === undefined ? {} : { firstFrameMs: v.firstFrameMs }),
      taskState: v.ended || v.board.control === 'ended' ? 'ended' : v.established ? 'executing' : 'preparing',
      ...(v.error ? { errorCode: v.error.split(':')[0], message: v.error } : {}),
      nextAction: v.phase === 'error' ? 'report_blocker' : v.awaitingStart ? 'wait_for_user_start' : !v.devices.length ? 'select_device' : v.established ? 'observe' : 'open_in_host_and_wait',
      devices: v.devices.map(d => ({ id: d.id, name: d.name, model: d.model, manufacturer: d.manufacturer, os: d.os ?? 'android', osVersion: d.osVersion, sdk: d.sdk, connection: d.connection, serialSuffix: d.serial.slice(-4), category: d.connection === 'local_simulator' || d.serial.startsWith('emulator-') ? 'emulator' : 'physical', ready: v.readyDevices.has(d.id),
        state: v.phase === 'closed' ? 'closed' : [...v.connections.values()].some(c => c.deviceId === d.id && c.media && this.now() - c.painted < 5000) ? (v.readyDevices.has(d.id) ? 'ready' : 'waiting_for_frame') : 'disconnected' })) }
  }
  private local(req: IncomingMessage, websocket = false): boolean {
    return req.headers.host === new URL(this.origin).host
      && (!req.headers.origin ? !websocket && req.method === 'GET' : req.headers.origin === this.origin)
      && !['cross-site'].includes(String(req.headers['sec-fetch-site']))
  }
  private start(): Promise<void> {
    this.starting ??= new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const handle = async (): Promise<void> => {
          if (!this.local(req)) { res.writeHead(403).end(); return }
          const url = new URL(req.url ?? '/', this.origin)
          const [token, route = ''] = url.pathname.slice(1).split('/')
          if (token === 'console' && req.method === 'GET') { this.openConsole(route, url.searchParams.get('k') ?? '', res); return }
          const v = [...this.viewers.values()].find(v => v.token === token)
          if (!v) { res.writeHead(404).end(); return }
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Referrer-Policy', 'no-referrer')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
          if (req.method === 'GET' && route === '') { v.lastPage = this.now(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(viewerPage()); return }
          if (req.method === 'GET' && route === 'status') { v.lastPage = this.now(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(this.snapshot(v))); return }
          if (req.method === 'GET' && route === 'devices') {
            const devices = await this.deviceListHandler?.(AbortSignal.timeout(10_000), url.searchParams.get('refresh') === '1', v.id) ?? []
            this.update(v)
            const preferredDeviceId = v.principal === (this.account?.scope ?? 'local') ? this.account?.preferredDeviceId : undefined
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ preferredDeviceId, devicePreferenceError: v.devicePreferenceError, devices: devices.map(device => ({ ...device, preferred: device.id === preferredDeviceId, selected: v.devices.some(bound => bound.id === device.id) })), canSelectDevice: !v.devices.length && !v.binding && v.board.control === 'idle' && !v.ended && !v.error && v.phase !== 'closed' })); return
          }
          // One-click Android emulator from the device picker: status for every page, actions with the board capability.
          if (route === 'emulator') {
            if (!this.emulatorStatusHandler || !this.emulatorActionHandler) { res.writeHead(404).end(); return }
            if (req.method === 'POST') {
              if (req.headers.origin !== this.origin || req.headers['x-opengui-board'] !== v.boardToken) { res.writeHead(403).end(); return }
              if (v.ended || v.phase === 'closed') { res.writeHead(409).end(); return }
              let body = ''
              for await (const chunk of req) { body += String(chunk); if (Buffer.byteLength(body) > 4096) { res.writeHead(413).end(); return } }
              this.emulatorActionHandler(JSON.parse(body) as Record<string, unknown>)
            } else if (req.method !== 'GET') { res.writeHead(405).end(); return }
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await this.emulatorStatusHandler(AbortSignal.timeout(8000)))); return
          }
          // A read-only frame of a candidate device when its live video is unavailable.
          if (req.method === 'GET' && route === 'device-preview') {
            const deviceId = url.searchParams.get('deviceId') ?? ''
            if (!this.previewFrameHandler || !/^[A-Za-z0-9_-]{1,160}$/u.test(deviceId)) { res.writeHead(400).end(); return }
            if (!this.previewAllowed(v)) { res.writeHead(409).end(); return }
            const data = await this.previewFrameHandler(v.id, deviceId, AbortSignal.timeout(8000))
            res.setHeader('Content-Type', 'image/jpeg'); res.end(data); return
          }
          if (req.method === 'GET' && route === 'connection-diagnostic') {
            if (!this.connectionDiagnosticHandler) { res.writeHead(503).end(); return }
            const principal = this.account?.scope ?? 'local'
            if (v.principal !== principal) { res.writeHead(403).end(); return }
            const result = await this.connectionDiagnosticHandler(AbortSignal.timeout(8000))
            if (v.principal !== (this.account?.scope ?? 'local')) { res.writeHead(403).end(); return }
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return
          }
          if (req.method === 'GET' && route === 'models') {
            try { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ models: await this.account?.models() ?? [] })) }
            catch (error) {
              const message = error instanceof Error ? error.message : ''
              const loginRequired = message.startsWith('login_required')
              const advice = loginRequired ? '登录已过期，请重新登录后读取模型配置；也可选择跟随 WorkBuddy'
                : message === 'service_route_unavailable: models' ? '模型配置接口不存在（HTTP 404），请检查该服务是否已部署现有模型配置；可选择跟随 WorkBuddy'
                : '模型目录暂时不可用，请检查服务连接与网络；可选择跟随 WorkBuddy'
              res.writeHead(loginRequired ? 401 : 503).end(JSON.stringify({ error: advice }))
            }
            return
          }
          if (req.method === 'GET' && route === 'evidence') {
            const id = url.searchParams.get('observationId') ?? '', name = v.board.snapshot().evidenceFiles[id]
            const data = this.store && name ? this.store.readEvidence(v.id, name) : v.board.evidence.get(id)
            if (!data) { res.writeHead(404).end(); return }
            res.setHeader('Content-Type', 'image/jpeg'); res.end(data); return
          }
          if (req.method === 'GET' && route === 'report') {
            const markdown = v.board.markdown(v.plan.todos, { devices: v.devices.map(d => d.name) }), format = url.searchParams.get('format') ?? 'md'
            if (!['md', 'docx', 'pdf', 'zip'].includes(format)) { res.writeHead(400).end(); return }
            const evidence = format === 'pdf' || format === 'zip' ? this.evidence(v) : []
            const data = format === 'md' ? markdown : format === 'docx' ? wordReport(markdown) : format === 'pdf' ? await pdfReport(markdown, evidence) : zip([
              { name: 'report.md', data: Buffer.from(markdown) },
              ...evidence.map(item => ({ name: `evidence/${item.name}`, data: item.data })),
            ])
            if (this.store && (format === 'pdf' || format === 'docx')) this.store.exportReport(v.id, format, data as Buffer, reportName(v))
            res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(v.board.createdAt)}.${format}"`)
            res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : format === 'pdf' ? 'application/pdf' : 'application/zip')
            res.end(data); return
          }
          // Person-driven phone input while taken over (接管设备). Every event is re-checked so input
          // racing 恢复控制, the end of the task or an account change is dropped, never delivered.
          if (req.method === 'POST' && route === 'input' && req.headers.origin === this.origin) {
            if (req.headers['x-opengui-board'] !== v.boardToken) { res.writeHead(403).end(); return }
            let body = ''
            for await (const chunk of req) { body += String(chunk); if (Buffer.byteLength(body) > 32_768) { res.writeHead(413).end(); return } }
            const input = JSON.parse(body) as { deviceId?: unknown; events?: unknown }
            const device = v.devices.find(d => d.id === input.deviceId)
            if (!device || !Array.isArray(input.events) || input.events.length > 64) { res.writeHead(400).end(); return }
            const reply = (status: number, value: Record<string, unknown>): void => { res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)) }
            if (device.os === 'ios') { reply(409, { error: 'iOS 模拟器暂不支持在工作台中直接操作' }); return }
            let delivered = 0, stale = false
            for (const event of input.events) {
              if (v.board.control !== 'manual' || v.ended || v.phase === 'closed' || v.principal !== (this.account?.scope ?? 'local')) { reply(409, { error: '当前不在接管状态，输入没有发送到手机', delivered }); return }
              const frame = this.streams.frameSize?.(device)
              if (!frame || !this.streams.inject) { reply(503, { error: '手机画面尚未就绪，暂时无法操作', delivered }); return }
              const message = encodeTakeoverInput(event, frame)
              if (!message) { stale = true; continue }
              if (!this.streams.inject(device, message)) { reply(503, { error: '手机画面连接已断开，请稍后重试', delivered }); return }
              delivered++
            }
            reply(200, { delivered, stale })
            return
          }
          if (req.method === 'POST' && route === 'board' && req.headers.origin === this.origin) {
            // The read-only viewing URL never grants this separate, narrowly scoped capability.
            if (req.headers['x-opengui-board'] !== v.boardToken) { res.writeHead(403).end(); return }
            let body = ''
            for await (const chunk of req) { body += String(chunk); if (Buffer.byteLength(body) > 16_384) { res.writeHead(413).end(); return } }
            const input = JSON.parse(body) as Record<string, unknown>
            if (input.action === 'new_task' && this.newTaskHandler) {
              if (Object.keys(input).length !== 1 || !(v.ended || v.board.control === 'ended')) { res.writeHead(409).end(); return }
              if (this.accountBusy || v.principal !== (this.account?.scope ?? 'local')) { res.writeHead(403).end(); return }
              if (v.nextTask) {
                const pending = v.nextTask, next = this.viewers.get((await pending).viewerId)
                if (v.nextTask === pending && (!next || !next.awaitingStart || next.ended || next.board.control !== 'idle')) delete v.nextTask
              }
              v.nextTask ??= this.newTaskHandler(v.id).catch(error => { delete v.nextTask; throw error })
              res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await v.nextTask)); return
            }
            if ((v.ended || v.phase === 'closed') && !['account', 'budget_extend'].includes(String(input.action))) { res.writeHead(409).end(); return }
            if (v.starting) throw new Error('task_already_started')
            if (input.action === 'account' && this.account) {
              if (this.accountBusy) throw new Error('account_change_in_progress')
              if ([...this.viewers.values()].some(viewer => ['agent', 'paused', 'manual', 'reconciling'].includes(viewer.board.control))) throw new Error('finish_task_before_account_change')
              this.accountBusy = true
              try {
              if (input.operation === 'configure' && typeof input.serviceUrl === 'string') this.account.configure(input.serviceUrl)
              else if (input.operation === 'send-otp' && typeof input.phone === 'string') await this.account.sendOtp(input.phone)
              else if (input.operation === 'login' && typeof input.phone === 'string' && typeof input.code === 'string') await this.account.login(input.phone, input.code)
              else if (input.operation === 'logout') await this.account.logout()
              else if (input.operation === 'session') await this.account.session()
              else throw new Error('invalid_account_action')
              if (v.board.control === 'idle' && !v.board.traces.length && !v.board.reviews.length && !v.board.testCases.length) {
                v.principal = this.account.scope
                if (['configure', 'login', 'logout', 'session'].includes(String(input.operation))) v.board.modelConfig = undefined
                this.persist(v)
                if (['login', 'session', 'configure'].includes(String(input.operation))) {
                  try { v.board.modelConfig = await this.account.selectedModel(AbortSignal.timeout(10_000)); v.modelSelectionError = undefined }
                  catch { v.modelSelectionError = '模型目录不可用或原选择已移除，请重新选择执行模型' }
                  v.principal = this.account.scope; this.persist(v)
                }
              }
              } finally { this.accountBusy = false }
            } else if (input.action === 'budget_extend' && this.budgetHandler) {
              if (!this.store) throw new Error('task_history_unavailable')
              if (this.accountBusy || v.principal !== (this.account?.scope ?? 'local')) throw new Error('foreign_account')
              if (Object.keys(input).some(key => !['action', 'additional', 'operationLimit', 'inferenceLimit'].includes(key)) || !Number.isInteger(input.additional) || !Number.isInteger(input.operationLimit) || !Number.isInteger(input.inferenceLimit)) throw new Error('invalid_budget_extension')
              await this.budgetHandler(v.id, Number(input.additional), Number(input.operationLimit), Number(input.inferenceLimit))
            } else if (input.action === 'select_device' && this.deviceSelectHandler) {
              if (typeof input.deviceId !== 'string' || !input.deviceId || Object.keys(input).some(key => !['action', 'deviceId'].includes(key))) throw new Error('one_device_required')
              await this.deviceSelectHandler(v.id, input.deviceId)
            } else if (input.action === 'model') {
              await this.chooseModel(v, input.modelId)
            } else if (input.action === 'start' && this.startHandler) {
              if (Object.keys(input).some(key => !['action', 'modelId', 'deviceId', 'contentReview', 'request', 'commentTask', 'commentBudget'].includes(key)) || typeof input.deviceId !== 'string' || !input.deviceId || typeof input.modelId !== 'string' || (input.contentReview !== undefined && typeof input.contentReview !== 'boolean') || (input.commentTask !== undefined && typeof input.commentTask !== 'boolean') || (input.commentBudget !== undefined && input.commentTask !== true)) throw new Error('start_input_invalid')
              if (input.request !== undefined && (typeof input.request !== 'string' || !input.request.trim() || input.request.length > 4000)) throw new Error('task_request_required')
              if (v.workbenchManaged && (input.modelId === 'host' || !this.account)) throw new Error('workbench_model_required')
              if (!v.awaitingStart) throw new Error('task_already_started')
              if (this.account && !this.account.status().user) throw new Error('login_required: sign in before starting')
              v.starting = true
              try {
              // The confirmed model becomes the cached default for the next task.
              await this.chooseModel(v, input.modelId)
              // Content review is chosen by the person here only, never by the model.
              v.board.contentReview = input.contentReview === true ? true : undefined
              await this.startHandler(v.id, input.deviceId, input.request as string | undefined, input.commentTask === undefined ? undefined : { enabled: input.commentTask === true, budget: input.commentBudget })
              } finally { v.starting = false }
            } else if (input.action === 'apk_update_confirm') {
              if (v.ended || v.board.control === 'ended') throw new Error('task_ended')
              v.board.confirmApkUpdate(String(input.artifactId), String(input.sha256), String(input.existingVersion))
              if (!['manual', 'paused', 'reconciling'].includes(v.board.control)) this.awaitUser(v.id, false)
            } else if (input.action === 'comment_original') {
              if (v.ended || v.board.control === 'ended' || !['replace', 'keep'].includes(String(input.decision)) || !Number.isInteger(input.platformVersion) || !Number.isInteger(input.contentVersion)) throw new Error('replacement_unavailable')
              v.board.decideReplacement(String(input.reviewId), input.decision as 'replace' | 'keep', Number(input.platformVersion), Number(input.contentVersion))
              if (!['manual', 'paused', 'reconciling'].includes(v.board.control)) this.awaitUser(v.id, v.board.reviews.some(review => review.status === 'pending') || Boolean(v.board.pendingReplacement))
            } else if (input.action === 'review_save') {
              if (v.ended || v.board.control === 'ended' || typeof input.draft !== 'string' || !Number.isInteger(input.expectedVersion)) throw new Error('review_unavailable')
              v.board.saveDraft(String(input.reviewId), input.draft, Number(input.expectedVersion))
            } else if (input.action === 'review') {
              if (v.ended || v.board.control === 'ended') throw new Error('task_ended')
              if (input.decision !== 'approve' && input.decision !== 'skip') { res.writeHead(400).end(); return }
              v.board.decide(String(input.reviewId), input.decision, typeof input.draft === 'string' ? input.draft : undefined, typeof input.reason === 'string' ? input.reason : undefined, typeof input.expectedVersion === 'number' ? input.expectedVersion : undefined)
              if (!['manual', 'paused', 'reconciling'].includes(v.board.control)) this.awaitUser(v.id, false)
            } else if (['takeover', 'resume', 'recheck', 'disconnect'].includes(String(input.action)) && this.boardHandler) {
              await this.boardHandler(v.id, input.action as BoardAction)
            } else { res.writeHead(400).end(); return }
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(this.snapshot(v))); return
          }
          if (req.method === 'POST' && route === 'frame' && req.headers.origin === this.origin) {
            let body = ''
            for await (const chunk of req) { body += String(chunk); if (body.length > 2048) { res.writeHead(413).end(); return } }
            const input = JSON.parse(body) as Record<string, unknown>
            const c = v.connections.get(String(input.connectionId))
            this.update(v)
            if (!c || !c.media || input.challenge !== c.challenge || input.deviceId !== c.deviceId || input.visible !== true || this.now() - c.issued > 10_000 || v.phase === 'closed') { res.writeHead(409).end(); return }
            c.painted = this.now()
            if (!v.error) {
              v.readyDevices.add(c.deviceId)
              if (v.devices.every(d => [...v.connections.values()].some(x => x.deviceId === d.id && x.media && this.now() - x.painted < 2000))) {
                v.firstFrameMs ??= this.now() - (v.deadline - 30_000)
                v.established = true; v.phase = 'ready'
                this.taskChanged(v.id)
              }
            }
            c.challenge = randomBytes(24).toString('base64url'); c.issued = this.now()
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ challenge: c.challenge })); return
          }
          res.writeHead(404).end()
        }
        void handle().catch((error: unknown) => {
          if (res.headersSent) { res.end(); return }
          const message = error instanceof OpenGuiError ? error.code : error instanceof Error ? error.message : ''
          const advice = message.startsWith('finish_task_before_account_change') ? '请先结束当前任务，再切换账号或服务'
            : message.startsWith('account_change_in_progress') ? '账号操作正在进行，请稍候'
            : message.startsWith('invalid_phone') || message.startsWith('invalid_login') ? '请检查手机号和六位验证码'
            : message === 'service_route_unavailable: auth' ? '账号服务暂不可用（HTTP 404），请稍后重试或联系管理员'
            : message.startsWith('service_fixed') ? '账号服务由插件内置，无需设置'
            : message.startsWith('service_not_configured') ? '当前版本未内置账号服务，暂时无法登录'
            : message === 'service_route_unavailable: models' ? '模型配置接口不存在（HTTP 404），请检查该服务是否已部署现有模型配置；可选择跟随 WorkBuddy'
            : message.startsWith('unified_service_error') ? '统一服务请求失败，请检查服务是否已部署、登录状态和验证码'
            : message.startsWith('model_locked') ? '任务已启动，请在下一次任务开始前选择模型'
            : message === 'login_required: sign in before starting' ? '请先登录，再开始执行'
            : message.startsWith('login_required') ? '登录已过期，请重新登录'
            : message.startsWith('task_already_started') ? '任务已经开始执行'
            : message.startsWith('task_request_required') ? '请填写要执行的任务（最多 4000 字）'
            : message.startsWith('workbench_model_required') ? '请在上方选择执行模型，工作台新任务由所选模型直接执行'
            : message.startsWith('model_not_configured') ? '所选模型已不可用，请重新选择'
            : message.startsWith('preview_unavailable') ? '该设备暂时无法预览'
            : message.startsWith('invalid_input_event') || message.startsWith('unsupported_key') ? '不支持的输入操作'
            : message.startsWith('emulator_busy') ? '模拟器正在安装或启动，请稍候'
            : message.startsWith('emulator_license_required') ? '请先阅读并同意 Android SDK 许可协议'
            : message.startsWith('emulator_unsupported') ? '当前电脑暂不支持一键安装模拟器（支持 macOS 与 64 位 Windows）'
            : message.startsWith('start_input_invalid') || message.startsWith('one_device_required') ? '请选择一台执行设备'
            : message.startsWith('review_version_changed') ? '草稿已被另一处更新。你的输入保留，请查看版本并选择要批准的内容。'
            : message.startsWith('comment_budget_exhausted') ? '已达到约定停止条件，本次评论任务已停止'
            : message.startsWith('comment_slots_reserved') ? '已有发送结果待核验，请先确认，不能补发占用的新名额'
            : message.startsWith('device_frozen') ? '当前任务已绑定原设备，不能切换'
            : message.startsWith('device_busy') ? '该设备正在被另一任务占用，请等待释放'
            : message.startsWith('device_unauthorized') ? '请在手机上允许 USB 调试授权，再重新检测'
            : message.startsWith('device_offline') ? '原设备已断开，请重新连接并检测'
            : message.startsWith('device_version_conflict') ? '设备版本不兼容，需要 Android 5.0 或更新版本'
            : '操作未完成，请检查原设备、任务状态或本地存储后重试'
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: advice }))
        })
      })
      this.server = server
      server.on('upgrade', (req, socket, head) => {
        if (!this.local(req, true)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
        const url = new URL(req.url ?? '/', this.origin)
        const [token, route] = url.pathname.slice(1).split('/')
        const v = [...this.viewers.values()].find(v => v.token === token)
        if (v && route === 'presence' && v.phase !== 'closed' && v.pages.size < 16) {
          const page = acceptStreamWebSocket(req, socket, head)
          v.pages.add(page)
          page.onClose(() => v.pages.delete(page))
          return
        }
        if (v && route === 'preview-stream') { void this.previewStream(v, url.searchParams.get('deviceId') ?? '', req, socket, head); return }
        const device = v?.devices.find(d => d.id === url.searchParams.get('deviceId'))
        if (!v || !device || route !== 'stream' || v.phase === 'closed' || v.connections.size >= 16) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
        const sink = acceptStreamWebSocket(req, socket, head)
        const c: Connection = { id: randomUUID(), deviceId: device.id, sink, challenge: randomBytes(24).toString('base64url'), issued: this.now(), painted: 0, connectedAt: this.now(), media: false }
        // The grace timestamp is not a rendered-frame receipt.
        v.connections.set(c.id, c)
        sink.sendText(JSON.stringify({ type: 'connection', connectionId: c.id, challenge: c.challenge }))
        let closed = false
        sink.onClose(() => {
          closed = true; c.release?.(); v.connections.delete(c.id)
          if (v.connections.size === 0 && v.phase !== 'closed' && !v.error) v.phase = 'disconnected'
        })
        const wrapped: ScrcpyStreamSink = { ...sink, sendBinary: data => { c.media = true; sink.sendBinary(data) }, sendText: text => {
          const event = JSON.parse(text) as { type: string; message?: string }
          if (event.type === 'error') { v.phase = 'disconnected'; sink.sendText(text); return }
          if (event.type === 'session' || event.type === 'reset') {
            c.media = false; c.challenge = randomBytes(24).toString('base64url'); c.issued = this.now()
            sink.sendText(JSON.stringify({ type: 'connection', connectionId: c.id, challenge: c.challenge }))
          }
          sink.sendText(text)
        } }
        void this.streams.subscribe(device, wrapped).then(release => { if (closed) release(); else c.release = release }).catch(error => {
          sink.sendText(JSON.stringify({ type: 'error', message: String(error) })); sink.close(1011, 'video_failed')
        })
      })
      // A stable port keeps 打开控制台 links valid across restarts; a busy one falls back to any free port.
      const listen = (port: number): void => {
        const failed = (error: NodeJS.ErrnoException): void => { if (port && ['EADDRINUSE', 'EACCES'].includes(error.code ?? '')) listen(0); else reject(error) }
        server.once('error', failed)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', failed)
          const address = server.address()
          if (!address || typeof address === 'string') { reject(new Error('viewer_listen_failed')); return }
          this.origin = `http://127.0.0.1:${address.port}`; resolve()
        })
      }
      listen(this.options.port ?? 0)
    })
    return this.starting
  }
}
