/**
 * Deferred<T> — Promise 控制工具
 *
 * 允许测试在外部控制 Promise 的 resolve/reject 时机，
 * 用于模拟 GraphRunner 等异步执行的精确时序控制。
 */
export class Deferred<T> {
	promise: Promise<T>;
	resolve!: (value: T | PromiseLike<T>) => void;
	reject!: (reason?: any) => void;
	private _settled = false;

	constructor() {
		this.promise = new Promise<T>((res, rej) => {
			this.resolve = (v) => {
				this._settled = true;
				res(v);
			};
			this.reject = (r) => {
				this._settled = true;
				rej(r);
			};
		});
	}

	get settled(): boolean {
		return this._settled;
	}
}
