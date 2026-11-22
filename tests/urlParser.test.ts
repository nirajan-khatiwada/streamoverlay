import { describe, expect, it } from 'vitest';
import { parseCrexMatchInput } from '../server/crex/urlParser.js';

describe('parseCrexMatchInput', () => {
  it('extracts matchKey from standard Crex live match URL', () => {
    const res = parseCrexMatchInput(
      'https://crex.com/cricket-live-score/ind-vs-nz-1st-test-india-tour-of-new-zealand-2026-match-updates-12JM'
    );
    expect(res.matchKey).toBe('12JM');
    expect(res.canonicalUrl).toBe(
      'https://crex.com/cricket-live-score/ind-vs-nz-1st-test-india-tour-of-new-zealand-2026-match-updates-12JM'
    );
  });

  it('strips /match-details, /match-scorecard, /stats, query strings, and trailing slashes', () => {
    const details = parseCrexMatchInput(
      'https://crex.com/cricket-live-score/ind-vs-nz-1st-test-india-tour-of-new-zealand-2026-match-updates-12JM/match-details?utm=1'
    );
    expect(details.matchKey).toBe('12JM');

    const scorecard = parseCrexMatchInput(
      'https://www.crex.com/cricket-live-score/aus-vs-eng-1st-t20i-england-tour-of-australia-2026-match-updates-11BO/match-scorecard/'
    );
    expect(scorecard.matchKey).toBe('11BO');
  });

  it('extracts matchKey from /social/ discussions URL and direct matchKey input', () => {
    const social = parseCrexMatchInput(
      'https://crex.com/social/ind-vs-nz-1st-test-match-updates-12JM/comments-abc'
    );
    expect(social.matchKey).toBe('12JM');

    const raw = parseCrexMatchInput('12XY');
    expect(raw.matchKey).toBe('12XY');
  });

  it('rejects non-Crex hosts and SSRF attempts', () => {
    expect(() => parseCrexMatchInput('http://169.254.169.254/latest/meta-data-12JM')).toThrow(/Unsupported host/i);
    expect(() => parseCrexMatchInput('https://evil.com/cricket-live-score/foo-12JM')).toThrow(/Unsupported host/i);
    expect(() => parseCrexMatchInput('https://crex.com/')).toThrow(/homepage/i);
    expect(() => parseCrexMatchInput('   ')).toThrow(/provide a Crex/i);
  });
});
