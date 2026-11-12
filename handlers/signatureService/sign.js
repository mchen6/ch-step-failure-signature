'use strict';
// ch-step-failure-signature/signatureService.sign: ch-step-error-patterns'
// {failingStep, lines} -> {signature, normalised, step}.
const {signatureOf, signedLines, KINDS} = require('../../lib/normalise');

const isLine = (l) => l != null && typeof l.text === 'string' && KINDS.includes(l.kind);

module.exports = async (input) => {
  const step = input != null ? input.failingStep : undefined;
  const lines = input != null ? input.lines : null;
  if (!(step === null || typeof step === 'string') || !Array.isArray(lines) || !lines.every(isLine)) {
    throw new DeviceError('ARGUMENTS_INVALID', 'expected ch-step-error-patterns output: {failingStep: string|null, lines: [{text, kind}]}');
  }
  return {output: {signature: signatureOf(step, lines), normalised: signedLines(lines, step), step}};
};
