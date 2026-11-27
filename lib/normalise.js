'use strict';
// A stable fingerprint for one failed job: the failing step and its error
// lines with what changes from run to run generalised away. A pure function.
//
// Normalisation, in this order (each later rule sees the earlier ones' marks):
//   ISO dates and times, and bare hh:mm:ss times   -> T
//   UUIDs                                           -> U
//   durations, compound ones too: 2.1ms, 1m30s, 1.5h, 300us, 20ns, 7µs -> D
//   absolute paths, file:// URLs, POSIX or Windows  -> P/<basename>
//   first, before the rest: a file a temp-file maker generated, in a
//        temporary directory, by its default shape -> P/tmp~ (its extension
//        kept): Python's tempfile, "tmp" and eight of a-z, 0-9 and _ holding
//        a digit and not starting with _ (CPython Lib/tempfile.py,
//        _RandomNameSequence); GNU mktemp's default template, "tmp." and ten
//        letters or digits holding a digit, a capital and a lowercase letter
//        (coreutils: "tmp.XXXXXXXXXX", the X's replaced by alphanumeric
//        characters). Anything else is left alone: tmp_test_01.py and
//        tmp.Dockerfile are real names, and a missed merge signs as before,
//        a false one would merge two failures
//   hex: 0x… and runs of 7+ hex digits holding both a digit and a letter,
//        bounded by anything but a letter or digit (commit SHAs, cache keys
//        after an underscore; "defaced" is a word, "1066192" a number)  -> H
//   numbers not glued to a letter (TS2304 keeps its code), and not an exit
//        code (an OOM kill's 137 is not an ordinary failure's 1)          -> #
//   quoted strings longer than 40 characters, measured after the rules
//        above so a number's width cannot decide                          -> "…"
//   whitespace collapsed, ends trimmed.
const crypto = require('node:crypto');

// The name of this normalisation and signing: every signature says which
// algorithm made it, so a cache of signatures rebuilds when it changes.
// Rename it (fs2, …) whenever a rule changes what is signed; the test pins
// fs2's signature of a fixed input.
const ALGORITHM = 'fs2';

// A temporary directory: Python's tempfile search list's platform defaults
// (/tmp, /var/tmp, /usr/tmp), macOS's per-user /var/folders/…/T (and its
// /private form), Windows' …\Temp\
const TEMP_DIR = String.raw`(?:(?<![\w.~/:])/(?:private/)?var/folders/[^\s/'"]+/[^\s/'"]+/T|(?<![\w.~/:])/(?:var/|usr/)?tmp|\b[A-Za-z]:\\(?:[^\\\s'"]+\\)*Temp)[/\\]`;
// the generated part: Python's eight (a digit among them, never a leading _),
// or mktemp's default ten (a digit, a capital and a lowercase letter among
// them); then any extension; a sentence's final period may follow
const TEMP_NAME = String.raw`(?:tmp(?!_)(?=[a-z0-9_]{0,7}\d)[a-z0-9_]{8}|tmp\.(?=[A-Za-z0-9]{0,9}\d)(?=[A-Za-z0-9]{0,9}[A-Z])(?=[A-Za-z0-9]{0,9}[a-z])[A-Za-z0-9]{10})((?:\.[A-Za-z0-9]+)*)(?!\.?[\w@+-])`;

const RULES = [
  [new RegExp(TEMP_DIR + TEMP_NAME, 'g'), 'P/tmp~$1'],
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

module.exports = {ALGORITHM, normaliseLine, signatureOf, signedLines, KINDS: ['error', 'assert', 'stack', 'exit', 'tail']};
