'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
require('./support');
const {normaliseLine, signatureOf, ALGORITHM} = require('../lib/normalise');
const sign = require('../handlers/signatureService/sign');

const run1 = [
  {text: '✖ adds two numbers (2.1ms)', kind: 'error'},
  {text: '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 3 !== 4', kind: 'assert'},
  {text: '      at TestContext.<anonymous> (/home/runner/work/widgets/widgets/test/add.test.js:7:10)', kind: 'stack'},
  {text: '##[error]Process completed with exit code 1.', kind: 'exit'}
];
const run2 = [
  {text: '✖ adds two numbers (14.7ms)', kind: 'error'},
  {text: '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 5 !== 6', kind: 'assert'},
  {text: '    at TestContext.<anonymous>   (/Users/runner/work/widgets/widgets/test/add.test.js:9:3)', kind: 'stack'},
  {text: '##[error]Process completed with exit code 1.', kind: 'exit'}
];

test('the same failure with different numbers and paths has one signature', () => {
  assert.strictEqual(signatureOf('Run npm test', run1), signatureOf('Run npm test', run2));
});

test('a different error line changes the signature', () => {
  const other = run1.map((l, i) => (i === 1 ? {...l, text: '  TypeError: Cannot read properties of undefined'} : l));
  assert.notStrictEqual(signatureOf('Run npm test', run1), signatureOf('Run npm test', other));
});

test('the step is part of the signature', () => {
  assert.notStrictEqual(signatureOf('Run npm test', run1), signatureOf('Run npm run lint', run1));
  assert.notStrictEqual(signatureOf(null, run1), signatureOf('Run npm test', run1));
});

test('tail lines do not affect the signature', () => {
  const withTail = [{text: '> widgets@1.0.0 test', kind: 'tail'}, ...run1, {text: 'took 4123 ms, random 9f8e7d', kind: 'tail'}];
  assert.strictEqual(signatureOf('Run npm test', withTail), signatureOf('Run npm test', run1));
});

test('the signature is sha256 of the step and the normalised lines, JSON-encoded', () => {
  const expected = crypto.createHash('sha256')
    .update(JSON.stringify(['Run npm test', run1.map((l) => normaliseLine(l.text))]))
    .digest('hex');
  assert.strictEqual(signatureOf('Run npm test', run1), expected);
});

test('normaliseLine examples', () => {
  const cases = [
    ['2026-11-11T19:00:11.1066192Z boom at 19:00:11', 'T boom at T'],
    ['✖ adds two numbers (2.1ms) after 3s and 2m', '✖ adds two numbers (D) after D and D'],
    ['      at TestContext.<anonymous> (/home/runner/work/widgets/widgets/test/add.test.js:7:10)', 'at TestContext.<anonymous> (P/add.test.js:#:#)'],
    ["  Error: ENOENT: no such file or directory, open 'C:\\a\\widgets\\widgets\\config.json'", "Error: ENOENT: no such file or directory, open 'P/config.json'"],
    ['expected 3 to equal 4.5 at commit 1f2e3d4c5b6a', 'expected # to equal # at commit H'],
    ["error TS2304: Cannot find name 'x' in 12 files", "error TS2304: Cannot find name 'x' in # files"],
    ['message: "a very long quoted message that goes on and on and on" and "short one"', 'message: "…" and "short one"'],
    ['##[error]Process completed with exit code 137.', '##[error]Process completed with exit code 137.'],
    ['defaced 0xdeadbeef   value', 'defaced H value'],
    ['see https://github.com/o/r/actions/runs/123', 'see https://github.com/o/r/actions/runs/#']
  ];
  for (const [input, expected] of cases) assert.strictEqual(normaliseLine(input), expected, input);
});

// From /code-review medium on PR #6.
test('more normalisation: file URLs, UUIDs, compound durations, hex after an underscore, exit codes kept', () => {
  const cases = [
    ['at file:///home/runner/work/w/w/test/add.test.mjs:7:10', 'at P/add.test.mjs:#:#'],
    ['at file:///Users/runner/work/w/w/test/add.test.mjs:9:3', 'at P/add.test.mjs:#:#'],
    ['request 550e8400-e29b-41d4-a716-446655440000 failed', 'request U failed'],
    ['timed out after 1m30s, then 2m15s, 1.5h, 300us, 20ns and 7µs', 'timed out after D, then D, D, D, D and D'],
    ['cache key node-cache-Linux-x64-npm-abc123_9f8e7d6c5b and run_8f3a2b1c', 'cache key node-cache-Linux-x64-npm-abc123_H and run_H'],
    ['Process completed with exit code 1.', 'Process completed with exit code 1.']
  ];
  for (const [input, expected] of cases) assert.strictEqual(normaliseLine(input), expected, input);
});

test('a quoted message is cut by its normalised length, so its numbers do not decide', () => {
  const pad = 'x'.repeat(36);
  // 40 characters inside the quotes with 9, 45 with 100000: one normalised length.
  assert.strictEqual(normaliseLine(`"n=9 ${pad}"`), normaliseLine(`"n=100000 ${pad}"`));
});

test('an OOM kill and an ordinary failure have different signatures', () => {
  const exit = (code) => [{text: `##[error]Process completed with exit code ${code}.`, kind: 'exit'}];
  assert.notStrictEqual(signatureOf('Run x', exit(137)), signatureOf('Run x', exit(1)));
});

test('when only the tail describes a failure, the tail is signed', () => {
  const tailed = (msg, n) => [{text: `deploying ${n} files`, kind: 'tail'}, {text: msg, kind: 'tail'}, {text: '##[error]Process completed with exit code 1.', kind: 'exit'}];
  assert.notStrictEqual(signatureOf('Run deploy', tailed('upload refused', 3)), signatureOf('Run deploy', tailed('disk full', 3)));
  assert.strictEqual(signatureOf('Run deploy', tailed('upload refused', 3)), signatureOf('Run deploy', tailed('upload refused', 41)));
  assert.notStrictEqual(signatureOf(null, [{text: 'a', kind: 'tail'}]), signatureOf(null, [{text: 'b', kind: 'tail'}]));
});

test('only the failing step\'s lines are signed when lines name their step', () => {
  const failing = run1.map((l, index) => ({...l, step: 'Run npm test', index}));
  const noise = {text: 'Error: Cache not found for key x', kind: 'error', step: 'Run actions/setup-node@v4', index: 0};
  assert.strictEqual(signatureOf('Run npm test', [noise, ...failing]), signatureOf('Run npm test', failing));
});

test('no step and an empty step name are different signatures', () => {
  assert.notStrictEqual(signatureOf(null, run1), signatureOf('', run1));
});

test('handler returns a 64-char hex, the normalised lines and the step', async () => {
  const {output} = await sign({failingStep: 'Run npm test', lines: run1});
  assert.match(output.signature, /^[0-9a-f]{64}$/);
  assert.strictEqual(output.signature, signatureOf('Run npm test', run1));
  assert.deepStrictEqual(output.normalised, run1.map((l) => normaliseLine(l.text)));
  assert.strictEqual(output.step, 'Run npm test');
  // ch-step-error-patterns' output is accepted as it is: step and index ride along.
  const {output: same} = await sign({failingStep: 'Run npm test', lines: run1.map((l, index) => ({...l, step: 'Run npm test', index})), truncated: false});
  assert.strictEqual(same.signature, output.signature);
  assert.strictEqual((await sign({failingStep: null, lines: []})).output.step, null);
});

// The output names the algorithm that made its signature, so a cache of
// signatures can tell when the algorithm changed and must be rebuilt
// (reviewer, 2026-11-12). fs1's signature of a fixed input is pinned: change
// a normalisation rule and this fails until the algorithm is renamed.
test('the output names its algorithm, and fs1 is pinned to its signature of a fixed input', async () => {
  assert.strictEqual(ALGORITHM, 'fs1');
  const {output} = await sign({failingStep: 'Run npm test', lines: run1});
  assert.strictEqual(output.algorithm, 'fs1');
  assert.strictEqual(signatureOf('Run npm test', run1), '9106c1f43e58bf6cf25bbb781a5a5371855c3088239ce57c50f4ed191117926d',
    'a rule changed what fs1 signs: rename ALGORITHM (fs2) and update this pin, so the scenario\'s cache rebuilds');
});

// The scenario learns the current algorithm with this empty call before it
// trusts its cache, so the schema must keep accepting it.
test('the empty probe {failingStep: null, lines: []} is accepted by the handler and by the schema', async () => {
  const probe = {failingStep: null, lines: []};
  const {output} = await sign(probe);
  assert.strictEqual(output.algorithm, ALGORITHM);
  const Ajv2020 = require('ajv/dist/2020');
  const schema = require('../schema.json').signatureService.sign;
  const ajv = new Ajv2020({strict: false});
  assert.ok(ajv.validate(schema.input, probe), JSON.stringify(ajv.errors));
  assert.ok(ajv.validate(schema.output, output), JSON.stringify(ajv.errors));
});

test('handler refuses what is not error-patterns output', async () => {
  const invalid = (err) => err.code === 'ARGUMENTS_INVALID';
  for (const bad of [{}, {failingStep: 3, lines: []}, {failingStep: null}, {failingStep: null, lines: [{text: 'x'}]}, {failingStep: null, lines: [{text: 'x', kind: 'other'}]}, null]) {
    await assert.rejects(sign(bad), invalid, JSON.stringify(bad));
  }
});

test('the module is a part: never listed', () => {
  assert.deepStrictEqual(require('../package.json').countinghouse, {role: 'part'});
});
