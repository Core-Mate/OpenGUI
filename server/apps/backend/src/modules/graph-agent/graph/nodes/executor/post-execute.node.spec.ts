import {
	detectActionRepetition,
	detectActionCycle,
	detectScreenshotCycle,
} from "./post-execute.node";

describe("detectActionRepetition", () => {
	it("should not warn when there are only two repeated clicks", () => {
		const result = detectActionRepetition([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "click", start_coords: [108, 112] },
		]);

		expect(result.detected).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("should not warn when there are only four repeated clicks (below threshold of 5)", () => {
		const result = detectActionRepetition([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "click", start_coords: [112, 108] },
			{ action_type: "click", start_coords: [118, 115] },
			{ action_type: "click", start_coords: [105, 110] },
		]);

		expect(result.detected).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("should warn when five clicks keep hitting nearby coordinates", () => {
		const result = detectActionRepetition([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "click", start_coords: [112, 108] },
			{ action_type: "click", start_coords: [118, 115] },
			{ action_type: "click", start_coords: [105, 110] },
			{ action_type: "click", start_coords: [110, 105] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("click");
	});

	it("should not warn when repeated clicks are far apart", () => {
		const result = detectActionRepetition([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "click", start_coords: [300, 400] },
			{ action_type: "click", start_coords: [520, 680] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "click", start_coords: [300, 400] },
		]);

		expect(result.detected).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("should warn when click coordinates are missing (non-passive action)", () => {
		const result = detectActionRepetition([
			{ action_type: "click", start_coords: [] },
			{ action_type: "click", start_coords: [] },
			{ action_type: "click", start_coords: [] },
			{ action_type: "click", start_coords: [] },
			{ action_type: "click", start_coords: [] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("click");
	});

	it("should warn for repeated non-coordinate non-passive actions", () => {
		const result = detectActionRepetition([
			{ action_type: "type", start_coords: [] },
			{ action_type: "type", start_coords: [] },
			{ action_type: "type", start_coords: [] },
			{ action_type: "type", start_coords: [] },
			{ action_type: "type", start_coords: [] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("type");
	});

	it("should not warn for repeated passive actions (scroll, press_back)", () => {
		const result = detectActionRepetition([
			{ action_type: "scroll", start_coords: [] },
			{ action_type: "scroll", start_coords: [] },
			{ action_type: "scroll", start_coords: [] },
			{ action_type: "scroll", start_coords: [] },
			{ action_type: "scroll", start_coords: [] },
		]);

		expect(result.detected).toBe(false);
		expect(result.reason).toBeNull();
	});
});

describe("detectActionCycle", () => {
	it("should not detect cycle with too few actions", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [1122, 1688] },
			{ action_type: "scroll", start_coords: [610, 1800] },
			{ action_type: "click", start_coords: [1122, 1688] },
		]);

		expect(result.detected).toBe(false);
	});

	it("should detect 2-step cycle (click → scroll repeated 3 times)", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [1122, 1688] },
			{ action_type: "scroll", start_coords: [610, 1800] },
			{ action_type: "click", start_coords: [1122, 1688] },
			{ action_type: "scroll", start_coords: [610, 1800] },
			{ action_type: "click", start_coords: [1122, 1688] },
			{ action_type: "scroll", start_coords: [610, 1800] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("2 步循环");
		expect(result.reason).toContain("click → scroll");
	});

	it("should detect 2-step cycle with nearby coordinates", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [1122, 1688] },
			{ action_type: "scroll", start_coords: [610, 1800] },
			{ action_type: "click", start_coords: [1125, 1690] },
			{ action_type: "scroll", start_coords: [612, 1798] },
			{ action_type: "click", start_coords: [1120, 1685] },
			{ action_type: "scroll", start_coords: [608, 1802] },
		]);

		expect(result.detected).toBe(true);
	});

	it("should not detect cycle when coordinates differ significantly", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [610, 1800] },
			{ action_type: "click", start_coords: [500, 500] },
			{ action_type: "scroll", start_coords: [610, 1800] },
			{ action_type: "click", start_coords: [900, 200] },
			{ action_type: "scroll", start_coords: [610, 1800] },
		]);

		expect(result.detected).toBe(false);
	});

	it("should detect 3-step cycle", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [200, 200] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [200, 200] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [200, 200] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("3 步循环");
	});

	it("should not detect cycle for non-repeating mixed actions", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "type", start_coords: [] },
			{ action_type: "click", start_coords: [200, 200] },
			{ action_type: "scroll", start_coords: [300, 300] },
			{ action_type: "press_back", start_coords: [] },
		]);

		expect(result.detected).toBe(false);
	});

	it("should not detect single-type repetition as cycle (delegated to detectActionRepetition)", () => {
		const result = detectActionCycle([
			{ action_type: "scroll", start_coords: [500, 1000] },
			{ action_type: "scroll", start_coords: [500, 1000] },
			{ action_type: "scroll", start_coords: [500, 1000] },
			{ action_type: "scroll", start_coords: [500, 1000] },
			{ action_type: "scroll", start_coords: [500, 1000] },
			{ action_type: "scroll", start_coords: [500, 1000] },
		]);

		expect(result.detected).toBe(false);
	});

	it("should prefer shorter cycle length", () => {
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("2 步循环");
	});

	it("should detect cycle at exact boundary of coordinate threshold (distance=50)", () => {
		// Manhattan distance: |100-125| + |100-125| = 50 → within threshold
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [125, 125] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
		]);

		expect(result.detected).toBe(true);
	});

	it("should not detect cycle when coordinate distance exceeds threshold (distance=51)", () => {
		// Manhattan distance: |100-126| + |100-125| = 51 → exceeds threshold
		const result = detectActionCycle([
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [126, 125] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
		]);

		expect(result.detected).toBe(false);
	});

	it("should detect cycle in tail when input has extra non-cycling prefix", () => {
		const result = detectActionCycle([
			{ action_type: "type", start_coords: [] },
			{ action_type: "press_back", start_coords: [] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
			{ action_type: "click", start_coords: [100, 100] },
			{ action_type: "scroll", start_coords: [500, 500] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("2 步循环");
	});

	it("should detect cycle with empty coordinates (different action types)", () => {
		const result = detectActionCycle([
			{ action_type: "type", start_coords: [] },
			{ action_type: "press_back", start_coords: [] },
			{ action_type: "type", start_coords: [] },
			{ action_type: "press_back", start_coords: [] },
			{ action_type: "type", start_coords: [] },
			{ action_type: "press_back", start_coords: [] },
		]);

		expect(result.detected).toBe(true);
		expect(result.reason).toContain("type → press_back");
	});
});

describe("detectScreenshotCycle", () => {
	// Helper: generate a 64-char binary hash
	const makeHash = (seed: number) => {
		const bits: string[] = [];
		for (let i = 0; i < 64; i++) {
			bits.push((seed + i) % 2 === 0 ? "1" : "0");
		}
		return bits.join("");
	};

	// Two hashes that are similar (Hamming distance ≤ 5)
	const hashA1 = "1".repeat(64);
	const hashA2 = "1".repeat(60) + "0".repeat(4); // distance = 4

	// Two hashes that are similar to each other but different from A
	const hashB1 = "0".repeat(64);
	const hashB2 = "0".repeat(60) + "1".repeat(4); // distance = 4

	it("should not detect with fewer than 6 hashes", () => {
		const result = detectScreenshotCycle(
			[hashA1, hashB1, hashA1, hashB1],
			false,
		);
		expect(result.detected).toBe(false);
	});

	it("should detect A-B-A-B-A-B alternating pattern", () => {
		const result = detectScreenshotCycle(
			[hashA1, hashB1, hashA2, hashB2, hashA1, hashB1],
			false,
		);
		expect(result.detected).toBe(true);
		expect(result.reason).toContain("A-B-A-B");
	});

	it("should not detect when all hashes are identical", () => {
		const result = detectScreenshotCycle(
			[hashA1, hashA1, hashA1, hashA1, hashA1, hashA1],
			false,
		);
		// evenOddDifferent will be false since A ≈ A
		expect(result.detected).toBe(false);
	});

	it("should not detect when hashes are all different", () => {
		const hashes = Array.from({ length: 6 }, (_, i) => makeHash(i * 10));
		const result = detectScreenshotCycle(hashes, false);
		expect(result.detected).toBe(false);
	});

	it("should not detect for passive actions", () => {
		const result = detectScreenshotCycle(
			[hashA1, hashB1, hashA2, hashB2, hashA1, hashB1],
			true,
		);
		expect(result.detected).toBe(false);
	});
});
