// Usage-limit classifier for `claude -p --output-format json` results (harness/lib/classify.ts).
import { describe, expect, it } from 'vitest';
import { classify, EXIT_CODE } from '../lib/classify.ts';

const result = (fields: Record<string, unknown>) => ({ type: 'result', num_turns: 3, ...fields });
const errorResult = (text: string) => result({ subtype: 'success', is_error: true, result: text });

describe('classify', () => {
  it('success with exit 0 is ok', () => {
    expect(classify(result({ subtype: 'success', is_error: false, result: 'done' }), 0)).toBe('ok');
  });

  it('success JSON with a non-zero exit is not ok', () => {
    expect(classify(result({ subtype: 'success', is_error: false, result: 'done' }), 1)).toBe('error');
  });

  it('max turns', () => {
    expect(classify(result({ subtype: 'error_max_turns', is_error: true }), 1)).toBe('max-turns');
    expect(classify(result({ subtype: 'error_max_turns', is_error: false }), 0)).toBe('max-turns');
  });

  it.each([
    ['usage limit', "Claude AI usage limit reached|1761700000"],
    ['rate limit', 'API Error: Rate limit exceeded'],
    ['429', 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}'],
    ['overloaded', 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'],
  ])('%s is a usage limit', (_name, text) => {
    expect(classify(errorResult(text), 1)).toBe('usage-limit');
  });

  it('hitting --max-budget-usd stops the night (captured on subscription auth, Claude Code 2.1.304)', () => {
    expect(classify(result({ subtype: 'error_max_budget_usd', is_error: true, num_turns: 1, result: null }), 1)).toBe('error');
  });

  it('a 429 reported only in api_error_status is a usage limit', () => {
    expect(classify(result({ subtype: 'success', is_error: true, api_error_status: 429, result: 'API Error' }), 1))
      .toBe('usage-limit');
  });

  it('auth failure and other errors are errors (and stop the night like a limit)', () => {
    // Both captured from Claude Code 2.1.304 in the sandbox: no token, and an invalid token.
    expect(classify(errorResult('Not logged in · Please run /login'), 1)).toBe('error');
    expect(classify(result({
      subtype: 'success', is_error: true, api_error_status: 401, terminal_reason: 'api_error',
      result: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.',
    }), 1)).toBe('error');
    expect(classify(result({ subtype: 'error_during_execution', is_error: true }), 1)).toBe('error');
  });

  it('missing, malformed or non-result JSON is an error', () => {
    expect(classify(undefined, 0)).toBe('error');
    expect(classify(null, 0)).toBe('error');
    expect(classify('not json', 0)).toBe('error');
    expect(classify({ type: 'assistant', subtype: 'success', is_error: false }, 0)).toBe('error');
  });

  it('non-zero exit with no JSON is an error', () => {
    expect(classify(undefined, 137)).toBe('error');
  });

  it('takes the last result from an array of messages', () => {
    const msgs = [{ type: 'system' }, result({ subtype: 'success', is_error: false })];
    expect(classify(msgs, 0)).toBe('ok');
  });

  it('exit codes match the agent-run.sh contract', () => {
    expect(EXIT_CODE).toEqual({ ok: 0, 'usage-limit': 10, error: 10, 'max-turns': 11, timeout: 12 });
  });
});
