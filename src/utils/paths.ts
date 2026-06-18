import { join } from 'node:path';

const ANTOINE_DIR = '.antoine';

export function getAntoineDir(): string {
  return ANTOINE_DIR;
}

export function antoinePath(...segments: string[]): string {
  return join(getAntoineDir(), ...segments);
}
