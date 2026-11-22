import { describe, expect, it } from 'vitest';
import {
  parseAbbreviatedSubText,
  parseYoutubeChannelInput,
} from '../server/youtube/subTracker.js';

describe('parseYoutubeChannelInput', () => {
  it('parses @handle and bare handle cleanly', () => {
    expect(parseYoutubeChannelInput('@Mythpat')).toEqual({
      kind: 'handle',
      value: '@Mythpat',
      normalizedDisplay: '@Mythpat',
    });
    expect(parseYoutubeChannelInput('Mythpat')).toEqual({
      kind: 'handle',
      value: '@Mythpat',
      normalizedDisplay: '@Mythpat',
    });
  });

  it('parses full YouTube handle URLs and channel ID URLs', () => {
    expect(parseYoutubeChannelInput('https://www.youtube.com/@Mythpat/streams')).toEqual({
      kind: 'handle',
      value: '@Mythpat',
      normalizedDisplay: '@Mythpat',
    });
    expect(
      parseYoutubeChannelInput('https://youtube.com/channel/UCx6F-rETGiz7xf_vkMmX2yQ')
    ).toEqual({
      kind: 'channelId',
      value: 'UCx6F-rETGiz7xf_vkMmX2yQ',
      normalizedDisplay: 'UCx6F-rETGiz7xf_vkMmX2yQ',
    });
    expect(parseYoutubeChannelInput('UCx6F-rETGiz7xf_vkMmX2yQ')).toEqual({
      kind: 'channelId',
      value: 'UCx6F-rETGiz7xf_vkMmX2yQ',
      normalizedDisplay: 'UCx6F-rETGiz7xf_vkMmX2yQ',
    });
  });

  it('rejects non-YouTube hosts (SSRF protection) and empty inputs', () => {
    expect(() => parseYoutubeChannelInput('https://evil.com/@Mythpat')).toThrow(/Unsupported host/i);
    expect(() => parseYoutubeChannelInput('http://127.0.0.1:8080/@Mythpat')).toThrow(/Unsupported host/i);
    expect(() => parseYoutubeChannelInput('   ')).toThrow(/Enter a YouTube handle/i);
  });
});

describe('parseAbbreviatedSubText', () => {
  it('converts K/M/B subscriber strings into integer counts', () => {
    expect(parseAbbreviatedSubText('17.8M subscribers')).toBe(17_800_000);
    expect(parseAbbreviatedSubText('619K subscribers')).toBe(619_000);
    expect(parseAbbreviatedSubText('1.25B subscribers')).toBe(1_250_000_000);
    expect(parseAbbreviatedSubText('942 subscribers')).toBe(942);
    expect(parseAbbreviatedSubText('')).toBeNull();
  });
});
