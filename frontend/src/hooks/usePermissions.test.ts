import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePermissions } from './usePermissions';
import * as AuthContextModule from '@/contexts/AuthContext';

describe('usePermissions Hook', () => {
  it('correctly reports individual permissions', () => {
    // Mock the useAuth hook to return a specific set of permissions
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      permissions: ['page.portal', 'page.analytics'],
      loading: false,
    } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.hasPermission('page.portal')).toBe(true);
    expect(result.current.hasPermission('page.analytics')).toBe(true);
    expect(result.current.hasPermission('page.manuals')).toBe(false);
    expect(result.current.hasPermission('page.users')).toBe(false);
    
    // Convenience booleans
    expect(result.current.canEditPortal).toBe(true);
    expect(result.current.canViewAnalytics).toBe(true);
    expect(result.current.canEditManuals).toBe(false);
  });

  it('correctly evaluates hasAnyPermission', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      permissions: ['page.users'],
      loading: false,
    } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.hasAnyPermission(['page.users', 'page.analytics'])).toBe(true);
    expect(result.current.hasAnyPermission(['page.portal', 'page.manuals'])).toBe(false);
  });

  it('correctly evaluates hasAllPermissions', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      permissions: ['page.manuals', 'page.analytics'],
      loading: false,
    } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.hasAllPermissions(['page.manuals', 'page.analytics'])).toBe(true);
    // Missing page.users
    expect(result.current.hasAllPermissions(['page.manuals', 'page.analytics', 'page.users'])).toBe(false);
  });
});
