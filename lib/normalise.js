'use strict';
// A stable fingerprint for one failed job: the failing step and its error
// lines with what changes from run to run generalised away. A pure function.
//
// Normalisation, in this order (each later rule sees the earlier ones' marks):
//   ISO dates and times, and bare hh:mm:ss times   -> T
//   UUIDs                                           -> U
//   durations, compound ones too: 2.1ms, 1m30s, 1.5h, 300us, 20ns, 7µs -> D
//   absolute paths, file:// URLs, POSIX or Windows  -> P/<basename>
//   hex: 0x… and runs of 7+ hex digits holding both a digit and a letter,
//        bounded by anything but a letter or digit (commit SHAs, cache keys
//        after an underscore; "defaced" is a word, "1066192" a number)  -> H
//   numbers not glued to a letter (TS2304 keeps its code), and not an exit
//        code (an OOM kill's 137 is not an ordinary failure's 1)          -> #
//   quoted strings longer than 40 characters, measured after the rules
//        above so a number's width cannot decide                          -> "…"
//   whitespace collapsed, ends trimmed.
const crypto = require('node:crypto');

const RULES = [
  [/\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:?\d\d)?)?/g, 'T'],
  [/\b\d\d:\d\d:\d\d(?:\.\d+)?\b/g, 'T'],
  [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, 'U'],
  [/(?<![A-Za-z_\d.])(?:\d+(?:\.\d+)?(?:ms|us|µs|ns|h|m|s))+(?![A-Za-z])/g, 'D'],
  [/\bfile:\/\/\/?(?:[A-Za-z]:\/)?(?:[^\s/:'"()]+\/)+([^\s/:'"()]*)/g, 'P/$1'],
  [/(?<![\w.~/:])\/(?:[\w.@+-]+\/)+([\w.@+-]*)/g, 'P/$1'],
  [/\b[A-Za-z]:\\(?:[^\\\s'"]+\\)+([^\\\s'":]*)/g, 'P/$1'],
  [/\b0x[0-9a-fA-F]+\b/g, 'H'],
  [/(?<![0-9A-Za-z])(?=[0-9a-fA-F]*\d)(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{7,}(?![0-9A-Za-z])/g, 'H'],
  [/(?<![A-Za-z_\d.])(?<!exit code )\d+(?:\.\d+)*/g, '#'],
  [/"[^"]{41,}"|'[^']{41,}'/g, '"…"'],
  [/\s+/g, ' ']
];

const SIGNED = new Set(['error', 'assert', 'stack', 'exit']);

function normaliseLine(text) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), text).trim();
}

// The lines that go into a signature: the failing step's (when lines name
// their step), all but the tail; when nothing but the exit line is left, the
// tail is the only evidence, so it is signed too.
function signedLines(lines, step) {
  const own = lines.filter((l) => step == null || l.step === undefined || l.step === step);
  const signed = own.filter((l) => SIGNED.has(l.kind));
  const chosen = signed.some((l) => l.kind !== 'exit') ? signed : own;
  return chosen.map((l) => normaliseLine(l.text));
}

// -> sha256 hex of [step, normalised lines], JSON-encoded so no step name or
// line can run into another, and no step (null) differs from an empty one.
function signatureOf(step, lines) {
  return crypto.createHash('sha256').update(JSON.stringify([step == null ? null : step, signedLines(lines, step)])).digest('hex');
}

module.exports = {normaliseLine, signatureOf, signedLines, KINDS: ['error', 'assert', 'stack', 'exit', 'tail']};
