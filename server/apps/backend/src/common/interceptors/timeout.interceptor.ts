import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
	RequestTimeoutException,
	SetMetadata,
	applyDecorators,
	UseInterceptors,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, throwError, TimeoutError } from 'rxjs'
import { catchError, timeout } from 'rxjs/operators'

export const TIMEOUT_KEY = 'request-timeout'

/**
 */
export const RequestTimeout = (ms: number) =>
	applyDecorators(
		SetMetadata(TIMEOUT_KEY, ms),
		UseInterceptors(TimeoutInterceptor),
	)

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
	constructor(private reflector: Reflector) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const timeoutValue = this.reflector.get<number>(
			TIMEOUT_KEY,
			context.getHandler(),
		)

		if (!timeoutValue) {
			return next.handle()
		}

		return next.handle().pipe(
			timeout(timeoutValue),
			catchError((err) => {
				if (err instanceof TimeoutError) {
					return throwError(() => new RequestTimeoutException())
				}
				return throwError(() => err)
			}),
		)
	}
}
