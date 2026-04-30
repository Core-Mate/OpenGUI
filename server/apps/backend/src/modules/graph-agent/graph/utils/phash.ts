import { Jimp } from "jimp";

const PHASH_RESIZE = 32;
const PHASH_SIZE = 8;

/**
 *
 *
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

					const idx = (y * width + x) * 4;
					sum += data[idx];
				}
			}
			values.push(sum / (blockSize * blockSize));
		}
	}


	const sorted = [...values].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];

	return values.map((v) => (v >= median ? "1" : "0")).join("");
}

/**
 */
export function hammingDistance(h1: string, h2: string): number {
	let d = 0;
	for (let i = 0; i < h1.length; i++) {
		if (h1[i] !== h2[i]) d++;
	}
	return d;
}
