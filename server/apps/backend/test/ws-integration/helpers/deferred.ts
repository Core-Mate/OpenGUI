/**
 * Deferred<T> - Promise control helper
 *
 * Allows tests to control Promise resolve/reject timing externally,
 * Used to precisely control async execution timing for GraphRunner and similar code.
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
