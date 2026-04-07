"""
Download Views — INGRION Blockchain Platform

Streams the protected 32MB application binary using one-time expiring tokens.
Streaming avoids loading the entire file into memory.
"""
import os
import logging
import mimetypes

from django.conf import settings
from django.http import StreamingHttpResponse, HttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import AnonRateThrottle

from .models import DownloadToken

logger = logging.getLogger('ingrion.downloads')

CHUNK_SIZE = 8 * 1024  # 8 KB chunks


def _get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _file_iterator(file_path, chunk_size=CHUNK_SIZE):
    """Generator that yields file chunks."""
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield chunk


class DownloadThrottle(AnonRateThrottle):
    rate = '3/hour'
    scope = 'download'


class ApplicationDownloadView(APIView):
    """
    GET /api/downloads/application/?token=<uuid>

    Validates the one-time download token and streams the binary.
    """
    throttle_classes = [DownloadThrottle]
    # No authentication — token IS the auth
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        token_str = request.query_params.get('token', '').strip()
        if not token_str:
            return Response(
                {'detail': 'Token parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = DownloadToken.objects.select_related('submission').get(token=token_str)
        except (DownloadToken.DoesNotExist, Exception):
            logger.warning('Download attempt with invalid token: %s', token_str)
            return Response(
                {'detail': 'Invalid or expired token.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not token.is_valid:
            logger.warning(
                'Download attempt with %s token: %s',
                'used' if token.is_used else 'expired', token_str
            )
            return Response(
                {'detail': 'Token has already been used or has expired.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify the associated submission is approved
        if token.submission.status != 'approved':
            return Response(
                {'detail': 'Submission not approved.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        file_path = settings.APPLICATION_BINARY_PATH
        if not os.path.exists(file_path):
            logger.error('Application binary not found at: %s', file_path)
            return Response(
                {'detail': 'Application binary not available. Contact support.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Consume the token before streaming (prevents race condition on fast double-click)
        token.consume(ip=_get_client_ip(request))

        file_size = os.path.getsize(file_path)
        filename = os.path.basename(file_path)
        content_type, _ = mimetypes.guess_type(filename)
        content_type = content_type or 'application/octet-stream'

        logger.info(
            'Download started for submission=%s token=%s ip=%s size=%d',
            token.submission.id, token_str, _get_client_ip(request), file_size,
        )

        response = StreamingHttpResponse(
            _file_iterator(file_path),
            content_type=content_type,
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Content-Length'] = file_size
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class TokenValidateView(APIView):
    """
    GET /api/downloads/validate/?token=<uuid>

    Lightweight check — used by the frontend to show download button state.
    Does NOT consume the token.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        token_str = request.query_params.get('token', '').strip()
        if not token_str:
            return Response({'valid': False, 'reason': 'No token provided.'})

        try:
            token = DownloadToken.objects.get(token=token_str)
        except DownloadToken.DoesNotExist:
            return Response({'valid': False, 'reason': 'Token not found.'})

        if token.is_used:
            return Response({'valid': False, 'reason': 'Token already used.'})
        if token.is_expired:
            return Response({'valid': False, 'reason': 'Token expired.'})

        return Response({
            'valid': True,
            'expires_at': token.expires_at.isoformat(),
        })
