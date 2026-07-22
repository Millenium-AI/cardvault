import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePrices, tradeCreditValue, roundCents } from "./transactionMath.ts";

const sum = (xs: number[]) => roundCents(xs.reduce((a, b) => a + b, 0));

test("3-item bundle sale: allocations sum exactly to the total", () => {
  const items = [
    { marketPrice: 10, qty: 1 },
    { marketPrice: 20, qty: 1 },
    { marketPrice: 30, qty: 1 },
  ];
  const result = allocatePrices(items, 100);
  assert.deepEqual(result, [16.67, 33.33, 50]);
  assert.equal(sum(result), 100);
});

test("bundle sale with a rounding residual still sums exactly", () => {
  // Equal weights over $10 → 3.333… each; residual must land on the last row.
  const items = [
    { marketPrice: 5, qty: 1 },
    { marketPrice: 5, qty: 1 },
    { marketPrice: 5, qty: 1 },
  ];
  const result = allocatePrices(items, 10);
  assert.equal(sum(result), 10);
  assert.deepEqual(result, [3.33, 3.33, 3.34]);
});

test("quantity is factored into the allocation weight", () => {
  const items = [
    { marketPrice: 10, qty: 3 }, // weight 30
    { marketPrice: 10, qty: 1 }, // weight 10
  ];
  const result = allocatePrices(items, 100);
  assert.deepEqual(result, [75, 25]);
  assert.equal(sum(result), 100);
});

test("zero / missing market prices fall back to an equal split", () => {
  const items = [
    { marketPrice: 0, qty: 1 },
    { marketPrice: null, qty: 2 },
    { marketPrice: undefined, qty: 1 },
  ];
  const result = allocatePrices(items, 90);
  assert.equal(sum(result), 90);
  assert.deepEqual(result, [30, 30, 30]);
});

test("a single zero-price row among priced rows gets nothing", () => {
  const items = [
    { marketPrice: 0, qty: 1 },
    { marketPrice: 10, qty: 1 },
  ];
  const result = allocatePrices(items, 100);
  assert.deepEqual(result, [0, 100]);
  assert.equal(sum(result), 100);
});

test("single item receives the full total", () => {
  assert.deepEqual(allocatePrices([{ marketPrice: 5, qty: 2 }], 99.99), [99.99]);
});

test("empty item list returns an empty allocation", () => {
  assert.deepEqual(allocatePrices([], 100), []);
});

test("trade credit valuation with mixed per-row percents", () => {
  assert.equal(tradeCreditValue(100, 0.8), 80);
  assert.equal(tradeCreditValue(50, 0.9), 45);
  assert.equal(tradeCreditValue(19.99, 0.7), 13.99);
});

test("trade credit valuation handles missing inputs as zero", () => {
  assert.equal(tradeCreditValue(null, 0.8), 0);
  assert.equal(tradeCreditValue(100, null), 0);
  assert.equal(tradeCreditValue(undefined, undefined), 0);
});
