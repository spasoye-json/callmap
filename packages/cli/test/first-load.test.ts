import { beforeAll, describe, expect, it } from 'vitest';
import { countTextOf } from '../page/words.ts';
import { featureBranchRepo } from './fixture-repo.ts';
import { reviewHtmlOf, startCostsOf } from './reader-page.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

describe('the start of the page before its first drawing', () => {
  it('measures nothing, so the browser lays out the page once, for the first drawing', async () => {
    const { measures } = await startCostsOf(html, { width: 1200, height: 800 });

    expect(measures).toBe(0);
  });

  it('formats no number with Intl, whose first use costs about 10 ms in Chromium', async () => {
    const { localeFormats } = await startCostsOf(html, { width: 1200, height: 800 });

    expect(localeFormats).toBe(0);
  });
});

describe('the text of a count', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [12_345, '12,345'],
    [1_234_567, '1,234,567'],
  ])('writes %i as %s', (count, text) => {
    expect(countTextOf(count)).toBe(text);
  });
});
