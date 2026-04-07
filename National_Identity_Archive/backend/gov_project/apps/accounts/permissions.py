from rest_framework.permissions import BasePermission


class IsCitizen(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) == 'citizen'
        )


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            getattr(request.user, 'user_type', None) == 'admin'
        )
