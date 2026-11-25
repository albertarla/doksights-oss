import { describe, it, expect, vi, beforeAll } from 'vitest';

// We want to test the real initialised client.
vi.unmock('@/integrations/supabase/client');

let supabaseInstance: any;

describe('Supabase Client', () => {
  beforeAll(async () => {
    // Mock env vars for module evaluation
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'placeholder');
    
    // Import dynamically after stubbing env
    const { supabase } = await import('./client');
    supabaseInstance = supabase;
  }, 20000); // High timeout for heavy module evaluation in CI/Docker

  it('exports a supabase client instance', () => {
    expect(supabaseInstance).toBeDefined();
    expect(supabaseInstance.auth).toBeDefined();
    expect(typeof supabaseInstance.from).toBe('function');
  });

  it('client is initialised with the configured Supabase URL', () => {
    // The expected URL should match what's in the environment at evaluation time
    const expectedUrl = import.meta.env.VITE_SUPABASE_URL;
    expect(supabaseInstance.supabaseUrl).toBe(expectedUrl);
  });
});