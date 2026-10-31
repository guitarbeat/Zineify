import { test, expect } from '@playwright/test';
import { computeMiniZineFoldState } from '../../src/utils/miniZineFold.js';

const DIMENSIONS = { w: 1, h: 1.414, stackDepthStep: 0.008 };

function getHeight(bounds) {
  return bounds.max.y - bounds.min.y;
}

function getWidth(bounds) {
  return bounds.max.x - bounds.min.x;
}

function getDepth(bounds) {
  return bounds.max.z - bounds.min.z;
}

test.describe('Mini Zine Fold State', () => {
  test('progress 0 keeps the full 2x4 sheet flat', () => {
    const state = computeMiniZineFoldState(0, DIMENSIONS);

    expect(state.pages[5].position).toEqual({ x: -1.5, y: 0.707, z: 0 });
    expect(state.pages[6].position).toEqual({ x: -1.5, y: -0.707, z: 0 });
    expect(state.pages[1].position).toEqual({ x: 1.5, y: -0.707, z: 0 });
    expect(getWidth(state.bounds)).toBeCloseTo(4, 5);
    expect(getHeight(state.bounds)).toBeCloseTo(2.828, 5);
    expect(Math.max(...state.seamGaps.map((seam) => seam.gap))).toBeCloseTo(0, 5);
  });

  test('progress 1 folds top pages onto the bottom strip', () => {
    const state = computeMiniZineFoldState(1, DIMENSIONS);

    expect(state.stages.horizontalFold).toBe(1);
    expect(state.stages.diamondOpen).toBe(0);
    expect(state.stages.bookletClose).toBe(0);
    expect(state.pages[5].position.y).toBeCloseTo(state.pages[6].position.y, 5);
    expect(state.pages[4].position.y).toBeCloseTo(state.pages[7].position.y, 5);
    expect(state.pages[3].position.y).toBeCloseTo(state.pages[8].position.y, 5);
    expect(state.pages[2].position.y).toBeCloseTo(state.pages[1].position.y, 5);
    expect(getHeight(state.bounds)).toBeCloseTo(1.414, 3);
  });

  test('progress 2 opens the slit into a compact diamond while keeping hinges connected', () => {
    const state = computeMiniZineFoldState(2, DIMENSIONS);

    expect(state.pages[5].position.x).toBeLessThan(0);
    expect(state.pages[1].position.x).toBeGreaterThan(0);
    expect(Math.abs(state.pages[4].position.x)).toBeLessThan(0.01);
    expect(Math.abs(state.pages[3].position.x)).toBeLessThan(0.01);
    expect(state.pages[7].position.z).toBeGreaterThan(state.pages[6].position.z);
    expect(state.pages[4].position.z).toBeLessThan(state.pages[5].position.z);
    expect(getWidth(state.bounds)).toBeLessThan(2.1);
    expect(getDepth(state.bounds)).toBeLessThan(2.1);
    expect(Math.max(...state.seamGaps.map((seam) => seam.gap))).toBeLessThan(0.001);
  });

  test('progress 3 closes into a narrow booklet stack with only a small sheet offset', () => {
    const state = computeMiniZineFoldState(3, DIMENSIONS);

    expect(getWidth(state.bounds)).toBeLessThan(0.01);
    expect(getDepth(state.bounds)).toBeLessThan(1.1);
    expect(Math.max(...state.seamGaps.map((seam) => seam.gap))).toBeLessThan(0.02);
    expect(state.pages[5].position.z).toBeLessThan(state.pages[2].position.z);
    expect(state.pages[4].position.z).toBeLessThan(state.pages[1].position.z);
  });
});
