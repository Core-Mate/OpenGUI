import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common'
import { AsyncLocalStorage } from 'async_hooks'
import { Observable } from 'rxjs'
import { v4 as uuidv4 } from 'uuid'

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, any>>()

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest()

        // Get trace_id from header or generate new one
        const traceId =
            request.headers['x-trace-id'] ||
            request.headers['trace-id'] ||
            uuidv4()

        // Store trace_id in request for downstream usage
        request.traceId = traceId

        // Create a new storage map for this request
        const store = new Map<string, any>()
        store.set('traceId', traceId)
        store.set('requestId', request.id || uuidv4())
        store.set('userId', request.body?.userId || '1')
        store.set('path', request.url)
        store.set('method', request.method)

        // Run the request handler within the async local storage context
        return new Observable((subscriber) => {
            asyncLocalStorage.run(store, () => {
                next.handle().subscribe({
                    next: (value) => subscriber.next(value),
                    error: (err) => subscriber.error(err),
                    complete: () => subscriber.complete(),
                })
            })
        })
    }
}

/**
 * Get the current trace ID from async local storage
 */
export function getTraceId(): string | undefined {
    const store = asyncLocalStorage.getStore()
    return store?.get('traceId')
}

/**
 * Set the execution ID in the current async local storage context
 * Used to correlate logs across multiple HTTP requests within the same task execution
 */
export function setExecutionId(id: number): void {
    const store = asyncLocalStorage.getStore()
    if (store) {
        store.set('executionId', id)
    }
}

/**
 * Get the current execution ID from async local storage
 */
export function getExecutionId(): number | undefined {
    const store = asyncLocalStorage.getStore()
    return store?.get('executionId')
}

/**
 * Get the current request context from async local storage
 */
export function getRequestContext(): {
    traceId?: string
    requestId?: string
    userId?: string
    path?: string
    method?: string
    executionId?: number
} {
    const store = asyncLocalStorage.getStore()
    if (!store) {
        return {}
    }

    return {
        traceId: store.get('traceId'),
        requestId: store.get('requestId'),
        userId: store.get('userId'),
        path: store.get('path'),
        method: store.get('method'),
        executionId: store.get('executionId'),
    }
}
