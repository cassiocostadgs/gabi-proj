// Run with: TZ=UTC node --test tests/test_utils.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fmtDt, fmtDtShort } = require('../web/static/utils.js');

// fmtDt ──────────────────────────────────────────────────────────────────────

test('fmtDt: empty string returns empty string', () => {
  assert.equal(fmtDt(''), '');
});

test('fmtDt: null returns empty string', () => {
  assert.equal(fmtDt(null), '');
});

test('fmtDt: undefined returns empty string', () => {
  assert.equal(fmtDt(undefined), '');
});

test('fmtDt: formats space-separated UTC datetime (TZ=UTC)', () => {
  assert.equal(fmtDt('2026-06-02 22:59:00'), '02/06/2026 22:59');
});

test('fmtDt: accepts T-format ISO string (TZ=UTC)', () => {
  assert.equal(fmtDt('2026-06-02T22:59:00'), '02/06/2026 22:59');
});

test('fmtDt: pads single-digit day, month, hour and minute', () => {
  assert.equal(fmtDt('2026-01-05 09:03:00'), '05/01/2026 09:03');
});

test('fmtDt: truncates to minute precision', () => {
  assert.equal(fmtDt('2026-12-31 23:59:59'), '31/12/2026 23:59');
});

test('fmtDt: returns original string for invalid input', () => {
  assert.equal(fmtDt('not-a-date'), 'not-a-date');
});

// fmtDtShort ─────────────────────────────────────────────────────────────────

test('fmtDtShort: empty string returns empty string', () => {
  assert.equal(fmtDtShort(''), '');
});

test('fmtDtShort: null returns empty string', () => {
  assert.equal(fmtDtShort(null), '');
});

test('fmtDtShort: formats as DD/MM HH:MM (TZ=UTC)', () => {
  assert.equal(fmtDtShort('2026-06-02 22:59:00'), '02/06 22:59');
});

test('fmtDtShort: pads single-digit values', () => {
  assert.equal(fmtDtShort('2026-01-05 09:03:00'), '05/01 09:03');
});

test('fmtDtShort: returns original string for invalid input', () => {
  assert.equal(fmtDtShort('not-a-date'), 'not-a-date');
});
