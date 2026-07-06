/**
 * Renders a row of source chips from a list of `SourceRef`. Each chip shows
 * `[N]` (the citation id used in-line in the answer) plus the hostname and
 * optional provider label. Appended under answer boxes so users can see
 * at a glance which sources the agent cited.
 */
import { Container, Text } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import type { SourceRef } from '../tools/types.js';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.length > 30 ? `${url.slice(0, 30)}…` : url;
  }
}

export class SourceChipsComponent extends Container {
  constructor(refs: ReadonlyArray<SourceRef> | ReadonlyArray<string>) {
    super();
    const normalized: SourceRef[] = isSourceRefArray(refs)
      ? refs.slice()
      : (refs as ReadonlyArray<string>).map((url, i) => ({ id: i + 1, url }));

    if (normalized.length === 0) return;

    // Dedupe by URL, preserving the lowest id.
    const seen = new Map<string, SourceRef>();
    for (const r of normalized) {
      if (!seen.has(r.url)) seen.set(r.url, r);
    }

    // Sort by id ascending so chips mirror the order they appear in the answer.
    const ordered = [...seen.values()].sort((a, b) => a.id - b.id);

    const chips = ordered
      .map((r) => {
        const id = theme.warning(`[${r.id}]`);
        const host = theme.primary(hostOf(r.url));
        return `${id} ${host}`;
      })
      .join('  ');
    this.addChild(new Text(`${theme.muted('sources: ')}${chips}`, 0, 0));
  }
}

function isSourceRefArray(arr: ReadonlyArray<SourceRef | string>): arr is ReadonlyArray<SourceRef> {
  return arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'url' in (arr[0] as object);
}