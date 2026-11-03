// 2026-11-03: a nightly PR passed gate G1 (tests in the toolchain container, which has Chromium) but
// failed CI (a bare runner with no browser), so its preview never deployed. CI's build job now runs
// in the same Playwright image; this keeps the two pinned to the same digest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('CI runs tests in the harness toolchain image', () => {
  it("the deploy workflow's build container is the Dockerfile's FROM image, by digest", () => {
    const from = /^FROM (\S+@sha256:[0-9a-f]{64})$/m.exec(read('harness/container/Dockerfile'))?.[1];
    expect(from).toBeDefined();
    expect(read('.github/workflows/deploy.yml')).toContain(`image: ${from}`);
  });
});
