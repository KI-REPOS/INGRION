"""
Accounts Views — Auth endpoints
"""
import base64
import logging
from django.utils import timezone
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import CitizenUser, AdminUser, AuthToken
from .permissions import IsCitizen, IsAdmin

logger = logging.getLogger('gov_archive.accounts')


def _cosine_similarity(a, b):
    """Compute cosine similarity between two numpy vectors."""
    import numpy as np
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


@method_decorator(csrf_exempt, name='dispatch')
class CitizenLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        aadhaar = request.data.get('aadhaar_number', '').strip()
        password = request.data.get('password', '')

        if not aadhaar or not password:
            return Response(
                {'detail': 'Aadhaar number and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            citizen = CitizenUser.objects.get(aadhaar_number=aadhaar, is_active=True)
        except CitizenUser.DoesNotExist:
            return Response(
                {'detail': 'Invalid Aadhaar number or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not citizen.check_password(password):
            return Response(
                {'detail': 'Invalid Aadhaar number or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        token = AuthToken.objects.create(
            citizen=citizen,
            expires_at=timezone.now() + timezone.timedelta(hours=12)
        )

        logger.info('Citizen login: %s', aadhaar)
        return Response({
            'token': token.token,
            'user_type': 'citizen',
            'user': _citizen_data(citizen),
        })


@method_decorator(csrf_exempt, name='dispatch')
class AdminLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        try:
            admin = AdminUser.objects.get(username=username, is_active=True)
        except AdminUser.DoesNotExist:
            return Response(
                {'detail': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not admin.check_password(password):
            return Response(
                {'detail': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        token = AuthToken.objects.create(
            admin=admin,
            expires_at=timezone.now() + timezone.timedelta(hours=12)
        )

        logger.info('Admin login: %s', username)
        return Response({
            'token': token.token,
            'user_type': 'admin',
            'user': {'id': str(admin.id), 'name': admin.name, 'username': admin.username, 'department': admin.department},
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Delete the current token
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Token '):
            token_str = auth_header[6:].strip()
            AuthToken.objects.filter(token=token_str).delete()
        return Response({'detail': 'Logged out.'})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.user_type == 'admin':
            a = request.user.admin
            return Response({
                'user_type': 'admin',
                'user': {'id': str(a.id), 'name': a.name, 'username': a.username, 'department': a.department},
            })
        else:
            return Response({
                'user_type': 'citizen',
                'user': _citizen_data(request.user.citizen),
            })


class CitizenProfileView(APIView):
    permission_classes = [IsCitizen]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request):
        """Update profile photo and/or facial embedding."""
        citizen = request.user.citizen

        if 'profile_photo' in request.FILES:
            citizen.profile_photo = request.FILES['profile_photo']

        if 'facial_embedding_b64' in request.data:
            citizen.facial_embedding_b64 = request.data['facial_embedding_b64']

        citizen.save()
        return Response({'detail': 'Profile updated.', 'user': _citizen_data(citizen)})


def _citizen_data(citizen):
    from django.conf import settings
    photo_url = None
    if citizen.profile_photo:
        photo_url = citizen.profile_photo.url

    return {
        'id': str(citizen.id),
        'name': citizen.name,
        'aadhaar_number': citizen.aadhaar_number,
        'date_of_birth': str(citizen.date_of_birth) if citizen.date_of_birth else None,
        'address': citizen.address,
        'phone': citizen.phone,
        'email': citizen.email,
        'profile_photo': photo_url,
        'has_facial_embedding': bool(citizen.facial_embedding_b64),
        'public_key_b64': citizen.public_key_b64,
    }