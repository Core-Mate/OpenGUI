import { Injectable, LoggerService, Scope } from '@nestjs/common'
import { getExecutionId, getTraceId } from './trace-id.interceptor'


const MUTED_CONTEXTS = new Set([
    'InstanceLoader',
    'RoutesResolver',
    'RouterExplorer',
    'NestFactory',
])


const COLORS: Record<string, string> = {
    INFO: '\x1b[32m',
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
    DEBUG: '\x1b[35m',
    VERBOSE: '\x1b[36m',
}
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/**
 */
function extractParams(params: any[]): { context?: string; metadata?: Record<string, any>; stack?: string } {
    if (params.length === 0) return {}
    if (params.length === 1) {
        if (typeof params[0] === 'string') return { context: params[0] }
        if (params[0] && typeof params[0] === 'object') return { metadata: params[0] }
        return {}
    }
    if (params[0] && typeof params[0] === 'object' && typeof params[1] === 'string') {
        return { metadata: params[0], stack: params[1] }
    }
    if (typeof params[0] === 'string' && typeof params[1] === 'string') {
        return { stack: params[0], context: params[1] }
    }
    return {}
}

/**
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
    private context?: string

    constructor() {}

    setContext(context: string) {
        this.context = context
    }

    private output(level: string, message: any, context?: string, metadata?: Record<string, any>, stack?: string): void {
        const ctx = context || this.context
        if (ctx && MUTED_CONTEXTS.has(ctx)) return

        const time = new Date().toLocaleTimeString('en-GB', { hour12: false })
        const color = COLORS[level] || ''
        const msg = typeof message === 'string' ? message : JSON.stringify(message)
        const ctxStr = ctx ? ` ${DIM}[${ctx}]${RESET}` : ''
        const traceId = getTraceId()
        const executionId = getExecutionId()
        const traceStr = traceId ? ` ${DIM}tid=${traceId.slice(0, 8)}${RESET}` : ''
        const execStr = executionId ? ` ${DIM}eid=${executionId}${RESET}` : ''

        console.log(`${DIM}${time}${RESET} ${color}${level.padEnd(5)}${RESET}${ctxStr}${traceStr}${execStr} ${msg}`)

        if (metadata && Object.keys(metadata).length > 0) {
            console.log(`       ${DIM}${JSON.stringify(metadata)}${RESET}`)
        }
        if (stack) {
            console.log(`       ${DIM}${stack}${RESET}`)
        }
    }

    log(message: any, ...optionalParams: any[]) {
        const { context, metadata, stack } = extractParams(optionalParams)
        this.output('INFO', message, context, metadata, stack)
    }

    error(message: any, ...optionalParams: any[]) {
        const { context, metadata, stack } = extractParams(optionalParams)
        this.output('ERROR', message, context, metadata, stack)
    }

    warn(message: any, ...optionalParams: any[]) {
        const { context, metadata, stack } = extractParams(optionalParams)
        this.output('WARN', message, context, metadata, stack)
    }

    debug(message: any, ...optionalParams: any[]) {
        const { context, metadata, stack } = extractParams(optionalParams)
        this.output('DEBUG', message, context, metadata, stack)
    }

    verbose(message: any, ...optionalParams: any[]) {
        const { context, metadata, stack } = extractParams(optionalParams)
        this.output('VERBOSE', message, context, metadata, stack)
    }
}
