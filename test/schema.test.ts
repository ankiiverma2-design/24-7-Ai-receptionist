import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentDefinition, validateCreateAgent } from '../src/agents/schema.ts';
import { getTemplate } from '../src/agents/templates.ts';

const validDefinition = getTemplate('dental')!.definition;

test('accepts a valid template definition', () => {
  const res = validateAgentDefinition(validDefinition);
  assert.equal(res.ok, true);
});

test('rejects empty persona', () => {
  const res = validateAgentDefinition({ ...validDefinition, persona: '' });
  assert.equal(res.ok, false);
});

test('rejects unsupported language codes', () => {
  const res = validateAgentDefinition({ ...validDefinition, languages: ['en', 'zzz'] });
  assert.equal(res.ok, false);
});

test('rejects empty language list', () => {
  const res = validateAgentDefinition({ ...validDefinition, languages: [] });
  assert.equal(res.ok, false);
});

test('validateCreateAgent requires name + valid definition', () => {
  assert.equal(validateCreateAgent({ definition: validDefinition }).ok, false);
  assert.equal(validateCreateAgent({ name: 'A', definition: validDefinition }).ok, true);
});
