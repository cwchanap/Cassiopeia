export type HudRect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export function avoidHud(
	label: HudRect,
	viewport: { width: number; height: number },
	obstacles: HudRect[]
): { x: number; y: number } | null {
	function available(x: number, y: number): boolean {
		const left = label.left + x;
		const top = label.top + y;
		const right = label.right + x;
		const bottom = label.bottom + y;
		return (
			left >= 0 &&
			top >= 0 &&
			right <= viewport.width &&
			bottom <= viewport.height &&
			obstacles.every(
				(rect) =>
					right <= rect.left || left >= rect.right || bottom <= rect.top || top >= rect.bottom
			)
		);
	}

	if (available(0, 0)) return { x: 0, y: 0 };
	const xs = [0, -label.left, viewport.width - label.right];
	const ys = [0, -label.top, viewport.height - label.bottom];
	for (const obstacle of obstacles) {
		xs.push(obstacle.left - label.right - 4, obstacle.right - label.left + 4);
		ys.push(obstacle.top - label.bottom - 4, obstacle.bottom - label.top + 4);
	}

	// The nearest available position lies on a viewport or obstacle edge.
	const candidates = xs.flatMap((x) => ys.map((y) => ({ x, y })));
	candidates.sort((a, b) => a.x ** 2 + a.y ** 2 - b.x ** 2 - b.y ** 2);
	for (const offset of candidates) {
		if (available(offset.x, offset.y)) return offset;
	}
	return null;
}
