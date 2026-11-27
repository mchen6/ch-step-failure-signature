'use strict';
// For the temp-name rule's next round (moved to a later release): the cases
// its last review found. Each is a todo until the rule handles it.
const test = require('node:test');
const assert = require('node:assert');
const {signatureOf} = require('../lib/normalise');
const one = (text) => [{text, kind: 'error'}, {text: '##[error]Process completed with exit code 1.', kind: 'exit'}];
const same = (a, b) => signatureOf('Run docs', one(a)) === signatureOf('Run docs', one(b));

test('a file inside a generated temp directory reduces as fs1 reduced it', {todo: true}, () => {
  assert.ok(same('  wrote /tmp/tmpab12cd3e/run42/out.txt', '  wrote /tmp/tmpzz99yy88/run43/out.txt'));
  assert.ok(same('  wrote C:\\Users\\R\\AppData\\Local\\Temp\\tmpab12cd3e\\sub\\out.txt', '  wrote C:\\Users\\R\\AppData\\Local\\Temp\\tmpzz99yy88\\sub\\out.txt'));
});

test('names a person writes stay distinct, even in a temp directory', {todo: true}, () => {
  for (const [a, b] of [['/tmp/tmptest_001.py', '/tmp/tmptest_002.py'], ['/tmp/tmpdata2024.csv', '/tmp/tmpdata2025.csv'], ['/tmp/tmp.Config2024', '/tmp/tmp.Backup2024'],
    ['D:\\a\\repo\\tests\\Temp\\tmpcase01_a.py', 'D:\\a\\repo\\tests\\Temp\\tmpcase02_b.py']]) assert.ok(!same(`  failed ${a}`, `  failed ${b}`), `${a} / ${b}`);
});

test('the system temp directory and file:// URLs are temp directories too', {todo: true}, () => {
  assert.ok(same('  open C:\\Windows\\TEMP\\tmpab12cd3e.txt', '  open C:\\Windows\\TEMP\\tmpzz99yy88.txt'));
  assert.ok(same('  open file:///tmp/tmpab12cd3e.py', '  open file:///tmp/tmpzz99yy88.py'));
});
