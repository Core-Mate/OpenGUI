/**
 *
 */

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(v, max));
}

export class CoordinateTransformer {
	constructor(
		private screenWidth: number,
		private screenHeight: number,
	) {}

	/**
	 */
	fromNormalized(x1: number, y1: number, x2 = x1, y2 = y1): [number, number] {
		const rawX = ((x1 + x2) / 2) * this.screenWidth;
		const rawY = ((y1 + y2) / 2) * this.screenHeight;
		return [
			Math.round(clamp(rawX, 0, this.screenWidth - 1)),
			Math.round(clamp(rawY, 0, this.screenHeight - 1)),
		];
	}

	/**
	 * GUI-only: always uses fromNormalized
	 */
	fromChannel(
		ch: "gui",
		x1: number,
		y1: number,
		x2?: number,
		y2?: number,
	): [number, number] {
		return this.fromNormalized(x1, y1, x2, y2);
	}
}
