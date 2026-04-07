"""
KYC Views — INGRION Blockchain Platform

Endpoints:
  POST /api/kyc/submit/        — Accept KYC submission, forward to Government Archive API
  GET  /api/kyc/status/<id>/   — Poll submission status
  POST /api/kyc/callback/      — Government callback (HMAC-validated, no CSRF)
"""
import hashlib
import hmac
import json
import logging
import urllib.request
import urllib.error
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import AnonRateThrottle

from .models import KYCSubmission, KYCStatus, GovernmentCallbackLog
from .serializers import KYCSubmissionSerializer, KYCStatusSerializer, GovernmentCallbackSerializer
from ..downloads.models import DownloadToken

logger = logging.getLogger('ingrion.kyc')


class KYCSubmitThrottle(AnonRateThrottle):
    rate = '5/hour'
    scope = 'kyc_submit'


def _get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _send_to_government_api(submission: KYCSubmission, callback_url: str) -> dict:
    """
    Forward the KYC submission to the Government Archive API.
    The archive_link field IS the government verify endpoint URL.

    Returns: {'success': bool, 'reference': str | None, 'error': str | None}
    """
    payload = json.dumps({
        'archive_link': submission.archive_link,
        'public_key': submission.public_key_b64,
        'facial_embedding': submission.facial_embedding_b64,
        'callback_url': callback_url,
        'submission_id': str(submission.id),
    }).encode('utf-8')

    # POST directly to the archive link URL (which is the gov verify endpoint)
    target_url = submission.archive_link

    req = urllib.request.Request(
        target_url,
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'X-INGRION-Submission': str(submission.id),
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            return {'success': True, 'reference': body.get('reference', 'GOV-OK'), 'error': None}
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode('utf-8', errors='replace')
        logger.error('Government API HTTP error: %s — %s', exc, body_text)
        return {'success': False, 'reference': None, 'error': f'HTTP {exc.code}: {body_text}'}
    except Exception as exc:
        logger.error('Government API connection error: %s', exc)
        return {'success': False, 'reference': None, 'error': str(exc)}


@method_decorator(csrf_exempt, name='dispatch')
class KYCSubmitView(APIView):
    throttle_classes = [KYCSubmitThrottle]
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = KYCSubmissionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        submission = KYCSubmission.objects.create(
            archive_link=data['archive_link'],
            public_key_b64=data['public_key_b64'],
            password_hash=data['password_hash'],
            facial_embedding_b64=data['facial_embedding_b64'],
            status=KYCStatus.PENDING,
            submitter_ip=_get_client_ip(request),
        )

        # Forward to Government Archive API
        # Build callback URL from actual request host so it works regardless of port
        callback_url = request.build_absolute_uri('/api/kyc/callback/')
        result = _send_to_government_api(submission, callback_url)

        # IMPORTANT: Refresh from DB before saving — the government archive may have
        # already called back SYNCHRONOUSLY and set status to APPROVED/REJECTED.
        # Without refresh_from_db(), we'd overwrite 'approved' back to 'submitted'.
        submission.refresh_from_db()

        if result['success']:
            # Only move to SUBMITTED if callback hasn't already resolved it
            if submission.status == KYCStatus.PENDING:
                submission.status = KYCStatus.SUBMITTED
            submission.government_reference = result['reference']
        else:
            if submission.status == KYCStatus.PENDING:
                submission.status = KYCStatus.FAILED
            submission.government_message = result['error']

        submission.save(update_fields=['status', 'government_reference', 'government_message'])

        logger.info('KYC submission %s → status=%s', submission.id, submission.status)

        return Response(
            {
                'submission_id': str(submission.id),
                'status': submission.status,
                'message': (
                    'Your KYC submission is being processed by the Government Archive.'
                    if result['success']
                    else 'Could not reach the Government Archive API. Please try again later.'
                ),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class KYCStatusView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, submission_id):
        try:
            submission = KYCSubmission.objects.get(id=submission_id)
        except KYCSubmission.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = KYCStatusSerializer(submission)
        response_data = serializer.data

        # If approved, check whether a download token exists
        if submission.status == KYCStatus.APPROVED:
            token = DownloadToken.objects.filter(
                submission=submission, is_used=False
            ).order_by('-created_at').first()

            if token and not token.is_expired:
                response_data['download_token'] = str(token.token)
                response_data['token_expires_at'] = token.expires_at.isoformat()
            else:
                # Generate a fresh token
                token = DownloadToken.objects.create(submission=submission)
                response_data['download_token'] = str(token.token)
                response_data['token_expires_at'] = token.expires_at.isoformat()

        return Response(response_data)


@method_decorator(csrf_exempt, name='dispatch')
class GovernmentCallbackView(APIView):
    """
    Receives the async result from the Government Archive API.

    Security:
    - HMAC-SHA256 signature validated before any processing
    - Entire raw body is used for HMAC (not re-serialized)
    - Logs every attempt for audit purposes
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        raw_body = request.body
        received_sig = request.headers.get('X-INGRION-Signature', '')

        # HMAC validation
        expected_sig = hmac.new(
            settings.GOVERNMENT_CALLBACK_HMAC_SECRET.encode('utf-8'),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        hmac_valid = hmac.compare_digest(expected_sig, received_sig)

        # Always log
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            payload = {'raw': raw_body.decode('utf-8', errors='replace')}

        source_ip = _get_client_ip(request)

        if not hmac_valid:
            logger.warning('Invalid HMAC on government callback from %s', source_ip)
            GovernmentCallbackLog.objects.create(
                submission=None,
                raw_payload=payload,
                hmac_valid=False,
                source_ip=source_ip,
            )
            return Response({'detail': 'Invalid signature.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Validate payload structure
        serializer = GovernmentCallbackSerializer(data=payload)
        if not serializer.is_valid():
            logger.warning('Malformed government callback payload: %s', serializer.errors)
            GovernmentCallbackLog.objects.create(
                submission=None,
                raw_payload=payload,
                hmac_valid=True,
                source_ip=source_ip,
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            submission = KYCSubmission.objects.get(id=data['submission_id'])
        except KYCSubmission.DoesNotExist:
            return Response({'detail': 'Submission not found.'}, status=status.HTTP_404_NOT_FOUND)

        GovernmentCallbackLog.objects.create(
            submission=submission,
            raw_payload=payload,
            hmac_valid=True,
            source_ip=source_ip,
        )

        gov_status = data['status']
        if gov_status == 'approved':
            submission.status = KYCStatus.APPROVED
            # Generate one-time download token
            DownloadToken.objects.create(submission=submission)
        else:
            submission.status = KYCStatus.REJECTED

        submission.government_reference = data['reference']
        submission.government_message = data.get('message', '')
        submission.save(update_fields=[
            'status', 'government_reference', 'government_message', 'updated_at'
        ])

        logger.info(
            'Government callback for %s: %s — ref=%s',
            submission.id, gov_status, data['reference']
        )

        return Response({'detail': 'Processed.'}, status=status.HTTP_200_OK)