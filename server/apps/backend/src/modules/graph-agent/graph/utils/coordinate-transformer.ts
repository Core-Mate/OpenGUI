/**
 * 统一坐标转换器
 *
 * 将 GUI（已归一化为 0-1）坐标转换为设备像素坐标
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
	 * 从已归一化坐标（0-1 范围，已除以 1000）转换为设备像素中心点
	 * GUI 通道使用：坐标已被 parseAction 除以 1000 归一化
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
	 * 根据通道类型自动选择坐标转换方式
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
