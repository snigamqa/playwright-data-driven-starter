export interface RuntimeSettings {
  baseURL: string;
  recoveryEnabled: boolean;
  candidateTimeoutMs: number;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export const settings: RuntimeSettings = {
  baseURL: process.env.BASE_URL ?? 'https://www.saucedemo.com',
  recoveryEnabled: process.env.LOCATOR_RECOVERY !== 'off',
  candidateTimeoutMs: readPositiveInt('LOCATOR_CANDIDATE_TIMEOUT_MS', 3000),
};
