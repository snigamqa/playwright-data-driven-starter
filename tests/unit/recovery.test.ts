import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LocatorNotFoundError,
  RecoveryAudit,
  resolveCandidate,
  type Candidate,
} from '../../src/locators/recovery.js';

function candidate(description: string, matches: boolean, probes: string[]): Candidate<string> {
  return {
    description,
    value: description,
    probe: async () => {
      probes.push(description);
      return matches;
    },
  };
}

const fixedNow = () => new Date('2026-01-01T00:00:00.000Z');

describe('resolveCandidate', () => {
  it('returns the primary without recording an audit event', async () => {
    const probes: string[] = [];
    const audit = new RecoveryAudit();
    const result = await resolveCandidate(
      'Login.username',
      [candidate('primary', true, probes), candidate('fallback', true, probes)],
      audit,
      { recoveryEnabled: true },
    );
    assert.equal(result, 'primary');
    assert.deepEqual(probes, ['primary']);
    assert.equal(audit.hasRecoveries, false);
  });

  it('falls back in order and records which locator was used', async () => {
    const probes: string[] = [];
    const audit = new RecoveryAudit();
    const result = await resolveCandidate(
      'Login.username',
      [
        candidate('primary', false, probes),
        candidate('second', false, probes),
        candidate('third', true, probes),
        candidate('fourth', true, probes),
      ],
      audit,
      { recoveryEnabled: true, now: fixedNow },
    );
    assert.equal(result, 'third');
    assert.deepEqual(probes, ['primary', 'second', 'third']);
    assert.deepEqual(audit.events, [
      {
        element: 'Login.username',
        primary: 'primary',
        used: 'third',
        attempted: ['primary', 'second', 'third'],
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
    assert.match(audit.summary(), /primary \[primary\] failed, used \[third\]/);
  });

  it('only tries the primary when recovery is disabled', async () => {
    const probes: string[] = [];
    const audit = new RecoveryAudit();
    await assert.rejects(
      resolveCandidate(
        'Login.username',
        [candidate('primary', false, probes), candidate('fallback', true, probes)],
        audit,
        { recoveryEnabled: false },
      ),
      (error: unknown) =>
        error instanceof LocatorNotFoundError && error.attempted.join() === 'primary',
    );
    assert.deepEqual(probes, ['primary']);
    assert.equal(audit.hasRecoveries, false);
  });

  it('throws with every attempted locator when none match', async () => {
    const probes: string[] = [];
    await assert.rejects(
      resolveCandidate(
        'Cart.badge',
        [candidate('a', false, probes), candidate('b', false, probes)],
        new RecoveryAudit(),
        { recoveryEnabled: true },
      ),
      /No locator matched "Cart.badge"\. Tried: a \| b/,
    );
  });

  it('rejects an empty candidate list', async () => {
    await assert.rejects(
      resolveCandidate('X', [], new RecoveryAudit(), { recoveryEnabled: true }),
      /No locator candidates defined for "X"/,
    );
  });
});
