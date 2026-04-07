"""
Custom token authentication for Government Archive Platform.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils import timezone
from .models import AuthToken


class SessionTokenAuthentication(BaseAuthentication):
    """
    Authenticate via Authorization: Token <token> header.
    Returns (user_obj, token) where user_obj has .user_type, .citizen, .admin.
    """

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Token '):
            return None

        token_str = auth_header[6:].strip()
        if not token_str:
            return None

        try:
            token = AuthToken.objects.select_related('citizen', 'admin').get(token=token_str)
        except AuthToken.DoesNotExist:
            raise AuthenticationFailed('Invalid token.')

        if token.is_expired:
            raise AuthenticationFailed('Token expired.')

        # Build a simple user-like object
        if token.admin:
            user = _AdminProxy(token.admin)
        else:
            user = _CitizenProxy(token.citizen)

        return (user, token)

    def authenticate_header(self, request):
        return 'Token'


class _CitizenProxy:
    user_type = 'citizen'
    is_authenticated = True

    def __init__(self, citizen):
        self.citizen = citizen
        self.id = citizen.id
        self.pk = citizen.pk

    def __str__(self):
        return str(self.citizen)


class _AdminProxy:
    user_type = 'admin'
    is_authenticated = True

    def __init__(self, admin):
        self.admin = admin
        self.id = admin.id
        self.pk = admin.pk

    def __str__(self):
        return str(self.admin)
