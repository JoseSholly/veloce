// Small helpers for scroll-driven animation.

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
