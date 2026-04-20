import { Jimp } from "jimp";

/** pHash 图像缩放尺寸（中间步骤） */
const PHASH_RESIZE = 32;
/** pHash 最终 hash 尺寸（PHASH_RESIZE / BLOCK_SIZE） */
const PHASH_SIZE = 8;

/**
 * 计算图片的感知哈希（简化 pHash）
 *
 * 算法：
 * 1. 缩放到 32×32 灰度图
 * 2. 分为 8×8 块，每块 4×4 像素取均值
 * 3. 以中值为阈值，生成 64 位二进制 hash
 *
 * @param imageBuffer 图片二进制数据
 * @returns 64 位二进制字符串
 */
export async function computePHash(imageBuffer: Buffer): Promise<string> {
	const img = await Jimp.read(imageBuffer);
	img.resize({ w: PHASH_RESIZE, h: PHASH_RESIZE });
	img.greyscale();

	const blockSize = PHASH_RESIZE / PHASH_SIZE; // 4
	const { data, width } = img.bitmap;
	const values: number[] = [];

	for (let by = 0; by < PHASH_SIZE; by++) {
		for (let bx = 0; bx < PHASH_SIZE; bx++) {
			let sum = 0;
			for (let y = by * blockSize; y < (by + 1) * blockSize; y++) {
				for (let x = bx * blockSize; x < (bx + 1) * blockSize; x++) {
					// greyscale 后 R=G=B，取 R 通道
					const idx = (y * width + x) * 4;
					sum += data[idx];
				}
			}
			values.push(sum / (blockSize * blockSize));
		}
	}

	// 中值阈值
	const sorted = [...values].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];

	return values.map((v) => (v >= median ? "1" : "0")).join("");
}

/**
 * 计算两个 hash 的 Hamming 距离
 */
export function hammingDistance(h1: string, h2: string): number {
	let d = 0;
	for (let i = 0; i < h1.length; i++) {
		if (h1[i] !== h2[i]) d++;
	}
	return d;
}
