export interface Candidate<T> {
  description: string;
  value: T;
  /** Resolves true when the candidate matches a usable element. Must not throw. */
  probe: () => Promise<boolean>;
}

export interface RecoveryEvent {
  element: string;
  primary: string;
  used: string;
  attempted: string[];
  timestamp: string;
}

export class LocatorNotFoundError extends Error {
  constructor(
    readonly element: string,
    readonly attempted: string[],
  ) {
    super(`No locator matched "${element}". Tried: ${attempted.join(' | ')}`);
    this.name = 'LocatorNotFoundError';
  }
}

/** Collects every time a fallback locator was used instead of the primary one. */
export class RecoveryAudit {
  readonly events: RecoveryEvent[] = [];

  record(event: RecoveryEvent): void {
    this.events.push(event);
  }

  get hasRecoveries(): boolean {
    return this.events.length > 0;
  }

  summary(): string {
    return this.events
      .map((e) => `"${e.element}": primary [${e.primary}] failed, used [${e.used}]`)
      .join('\n');
  }
}

export interface ResolveOptions {
  recoveryEnabled: boolean;
  now?: () => Date;
}

/**
 * Returns the first candidate whose probe succeeds. Candidates are tried in order; the first one
 * is the primary. A fallback match is recorded in the audit. When recovery is disabled only the
 * primary is tried.
 */
export async function resolveCandidate<T>(
  element: string,
  candidates: Candidate<T>[],
  audit: RecoveryAudit,
  options: ResolveOptions,
): Promise<T> {
  const [primary] = candidates;
  if (!primary) throw new Error(`No locator candidates defined for "${element}"`);

  const pool = options.recoveryEnabled ? candidates : [primary];
  const attempted: string[] = [];

  for (const candidate of pool) {
    attempted.push(candidate.description);
    if (await candidate.probe()) {
      if (candidate !== primary) {
        audit.record({
          element,
          primary: primary.description,
          used: candidate.description,
          attempted: [...attempted],
          timestamp: (options.now ?? (() => new Date()))().toISOString(),
        });
      }
      return candidate.value;
    }
  }

  throw new LocatorNotFoundError(element, attempted);
}
