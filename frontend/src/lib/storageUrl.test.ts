import { describe, it, expect } from 'vitest';
import { toPublicStorageUrl } from './storageUrl';

describe('toPublicStorageUrl', () => {
  const base = 'http://127.0.0.1:54321';

  it('rewrites an internal Docker host to the public Supabase URL', () => {
    expect(toPublicStorageUrl('http://kong:8000/storage/v1/object/sign/manuals/a.pdf?token=t', base))
      .toBe('http://127.0.0.1:54321/storage/v1/object/sign/manuals/a.pdf?token=t');
  });

  it('leaves URLs on the public origin unchanged', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/sign/manuals/a.pdf?token=t';
    expect(toPublicStorageUrl(url, 'https://abc.supabase.co')).toBe(url);
  });

  it('leaves non-storage URLs and empty values alone', () => {
    expect(toPublicStorageUrl('https://example.com/file.pdf', base)).toBe('https://example.com/file.pdf');
    expect(toPublicStorageUrl(null, base)).toBeNull();
  });
});
