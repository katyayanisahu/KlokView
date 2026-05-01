from rest_framework.permissions import BasePermission


class IsOwnerOrAdmin(BasePermission):
    message = 'Only owners and admins can perform this action.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in ('owner', 'admin'))


class IsOwnerOrAdminForWrite(BasePermission):
    """Safe methods allowed for any authenticated user; mutations restricted to owner/admin."""

    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in self.SAFE_METHODS:
            return True
        return user.role in ('owner', 'admin')
