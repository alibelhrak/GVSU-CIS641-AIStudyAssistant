import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCompletion } from '../src/routes/notes.js';

test('code suggestions: fences, repeats and overlap are removed', () => {
  assert.equal(cleanCompletion('```python\n    return a + b\n```', 'def add(a, b):\n', ''), '    return a + b');
  assert.equal(cleanCompletion('for i in range(10):', 'for i in ', ''), 'range(10):');
  assert.equal(cleanCompletion('total += x\n    return total', '    for x in xs:\n        ', ''), 'total += x\n    return total');
  assert.equal(cleanCompletion('<think>hmm</think>len(xs)', 'n = ', ''), 'len(xs)');
  assert.equal(cleanCompletion('', 'x = ', ''), '');
});
