import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('strings', () => {
  it('nama aplikasi huruf kecil', () => {
    expect(strings.appName).toBe('blackchat');
  });
});
