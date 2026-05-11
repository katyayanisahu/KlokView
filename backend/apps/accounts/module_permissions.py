"""Module-flag enforcement.

`Account.enabled_modules` is a JSON map of `{module_key: bool}` toggled from the
workspace Settings → Modules page. When a module is OFF, any endpoint guarded by
its key returns 403.

Usage:

    from apps.accounts.module_permissions import module_required

    class MyView(APIView):
        permission_classes = [IsAuthenticated, module_required('reports')]
"""

from rest_framework.permissions import BasePermission


# Default state when no value has been set yet for a module key on Account.enabled_modules.
# Mirrors the `defaultOn` flags in frontend/src/pages/settings/ModulesPage.tsx.
DEFAULT_MODULE_STATE: dict[str, bool] = {
    'time_tracking': True,
    'team': True,
    'timesheet_approval': True,
    'reports': True,
    'activity_log': True,
    'jira_sync': False,
    'outlook_sync': False,
}


def is_module_enabled(account, module_key: str) -> bool:
    """Return True if `module_key` is enabled for this `account`.

    Falls back to `DEFAULT_MODULE_STATE` when the key is missing from the JSON.
    """
    if account is None:
        return False
    flags = getattr(account, 'enabled_modules', None) or {}
    if module_key in flags:
        return bool(flags[module_key])
    return DEFAULT_MODULE_STATE.get(module_key, True)


def module_required(module_key: str) -> type[BasePermission]:
    """Build a DRF permission class that gates a view behind a workspace module."""

    class _ModuleEnabledPermission(BasePermission):
        message = (
            f'The "{module_key}" module is disabled for this workspace. '
            f'An owner or admin can enable it from Settings → Modules.'
        )

        def has_permission(self, request, view) -> bool:
            user = getattr(request, 'user', None)
            if not user or not getattr(user, 'is_authenticated', False):
                return False
            account = getattr(user, 'account', None)
            return is_module_enabled(account, module_key)

    _ModuleEnabledPermission.__name__ = f'ModuleEnabled_{module_key}'
    return _ModuleEnabledPermission
