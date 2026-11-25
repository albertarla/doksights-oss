import { useAuth } from '@/contexts/AuthContext';

export type PermissionKey =
    | 'page.portal'
    | 'page.manuals'
    | 'page.analytics'
    | 'page.users';

export function usePermissions() {
    const { permissions, loading, isSuperadmin } = useAuth();

    const hasPermission = (key: PermissionKey): boolean => {
        return isSuperadmin || permissions.includes(key);
    };

    const hasAnyPermission = (keys: PermissionKey[]): boolean => {
        return isSuperadmin || keys.some(key => permissions.includes(key));
    };

    const hasAllPermissions = (keys: PermissionKey[]): boolean => {
        return isSuperadmin || keys.every(key => permissions.includes(key));
    };

    return {
        permissions,
        loading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        // Convenience booleans
        canEditPortal: hasPermission('page.portal'),
        canEditManuals: hasPermission('page.manuals'),
        canViewAnalytics: hasPermission('page.analytics'),
        canManageUsers: hasPermission('page.users'),
    };
}
