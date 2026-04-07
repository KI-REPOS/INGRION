"""
Archive Views — Government Archive Platform

Endpoints:
  POST /api/archive/links/generate/   — Citizen generates an expirable archive link
  GET  /api/archive/links/            — Citizen lists their archive links
  POST /api/archive/links/<id>/revoke/ — Citizen revokes a link
  GET  /api/archive/verify/<token>/   — INGRION calls this to verify identity (the archive_link URL)
  GET  /api/archive/admin/requests/   — Admin views all INGRION KYC requests
"""
import base64
import hashlib
import hmac
import json
import logging
import urllib.request
import urllib.error
import numpy as np
from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from gov_project.apps.accounts.permissions import IsCitizen, IsAdmin
from gov_project.apps.kyc.models import KYCSubmission, KYCStatus
from .models import ArchiveLink, IngrionKYCRequest

logger = logging.getLogger('gov_archive.archive')


def _cosine_similarity(a_b64: str, b_b64: str) -> float:
    """Decode two base64 float32 embeddings and compute cosine similarity."""
    try:
        a_bytes = base64.b64decode(a_b64)
        b_bytes = base64.b64decode(b_b64)
        a = np.frombuffer(a_bytes, dtype=np.float32)
        b = np.frombuffer(b_bytes, dtype=np.float32)

        if len(a) != len(b) or len(a) == 0:
            return 0.0

        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(np.dot(a, b) / (norm_a * norm_b))
    except Exception as e:
        logger.error('Embedding comparison error: %s', e)
        return 0.0


def _get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _send_ingrion_callback(kyc_request: IngrionKYCRequest, approved: bool):
    """
    Send HMAC-signed callback to INGRION with the verification result.
    Mirrors the protocol expected by INGRION's GovernmentCallbackView.
    """
    payload_dict = {
        'submission_id': kyc_request.ingrion_submission_id,
        'reference': f'GOV-ARCH-{str(kyc_request.id)[:8].upper()}',
        'status': 'approved' if approved else 'rejected',
        'message': (
            'Identity verified against Government Archive records.'
            if approved else
            'Identity could not be verified. Facial biometric mismatch or record not found.'
        ),
    }
    payload_bytes = json.dumps(payload_dict, separators=(',', ':')).encode('utf-8')

    sig = hmac.new(
        settings.INGRION_HMAC_SECRET.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()

    req = urllib.request.Request(
        kyc_request.callback_url,
        data=payload_bytes,
        headers={
            'Content-Type': 'application/json',
            'X-INGRION-Signature': sig,
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info(
                'Callback sent to INGRION for submission %s: %s',
                kyc_request.ingrion_submission_id, 'approved' if approved else 'rejected'
            )
            return True
    except Exception as e:
        logger.error('Failed to send INGRION callback: %s', e)
        return False


def _link_data(link, request=None):
    return {
        'id': str(link.id),
        'token': link.token,
        'url': link.get_url(request),
        'expires_at': link.expires_at.isoformat(),
        'is_valid': link.is_valid,
        'is_expired': link.is_expired,
        'is_revoked': link.is_revoked,
        'access_count': link.access_count,
        'accessed_at': link.accessed_at.isoformat() if link.accessed_at else None,
        'created_at': link.created_at.isoformat(),
    }


class GenerateArchiveLinkView(APIView):
    """Citizen: generate an expirable archive link (only if KYC approved)."""
    permission_classes = [IsCitizen]

    def post(self, request):
        citizen = request.user.citizen

        # Must be KYC approved
        try:
            kyc = KYCSubmission.objects.get(citizen=citizen)
        except KYCSubmission.DoesNotExist:
            return Response(
                {'detail': 'No KYC submission found. Complete KYC first.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if kyc.status != KYCStatus.APPROVED:
            return Response(
                {'detail': 'KYC must be approved before generating an archive link.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Optional custom expiry (hours), default from settings
        expiry_hours = int(request.data.get('expiry_hours', 24))
        expiry_hours = max(1, min(expiry_hours, 168))  # 1h to 7 days

        link = ArchiveLink.objects.create(
            citizen=citizen,
            expires_at=timezone.now() + timezone.timedelta(hours=expiry_hours)
        )

        logger.info('Archive link generated for %s', citizen.aadhaar_number)
        return Response({
            'detail': 'Archive link generated.',
            'link': _link_data(link, request),
        }, status=status.HTTP_201_CREATED)


class ArchiveLinkListView(APIView):
    """Citizen: list all their archive links."""
    permission_classes = [IsCitizen]

    def get(self, request):
        citizen = request.user.citizen
        links = ArchiveLink.objects.filter(citizen=citizen)
        return Response({'links': [_link_data(l, request) for l in links]})


class RevokeArchiveLinkView(APIView):
    """Citizen: revoke a specific archive link."""
    permission_classes = [IsCitizen]

    def post(self, request, link_id):
        citizen = request.user.citizen
        try:
            link = ArchiveLink.objects.get(id=link_id, citizen=citizen)
        except ArchiveLink.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        link.is_revoked = True
        link.save()
        return Response({'detail': 'Link revoked.', 'link': _link_data(link, request)})


@method_decorator(csrf_exempt, name='dispatch')
class VerifyArchiveLinkView(APIView):
    """
    INGRION calls this endpoint with a KYC payload.
    This is the gov archive endpoint — it verifies identity and sends a callback.

    POST /api/archive/verify/<token>/
    Body: {
        "archive_link": "...",
        "public_key": "...",
        "facial_embedding": "<base64 float32>",
        "callback_url": "...",
        "submission_id": "..."
    }
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, token):
        try:
            link = ArchiveLink.objects.select_related('citizen').get(token=token)
        except ArchiveLink.DoesNotExist:
            return Response({'detail': 'Archive link not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not link.is_valid:
            reason = 'revoked' if link.is_revoked else 'expired'
            return Response(
                {'detail': f'Archive link is {reason}.'},
                status=status.HTTP_403_FORBIDDEN
            )

        citizen = link.citizen
        source_ip = _get_client_ip(request)

        # Parse payload
        submission_id = request.data.get('submission_id', '')
        public_key = request.data.get('public_key', '')
        facial_embedding = request.data.get('facial_embedding', '')
        callback_url = request.data.get('callback_url', '')

        if not all([submission_id, public_key, facial_embedding, callback_url]):
            return Response(
                {'detail': 'Missing required fields: submission_id, public_key, facial_embedding, callback_url'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Mark link as accessed
        link.access_count += 1
        link.accessed_at = timezone.now()
        link.save(update_fields=['access_count', 'accessed_at'])

        # Store public key on citizen profile
        if public_key and not citizen.public_key_b64:
            citizen.public_key_b64 = public_key
            citizen.save(update_fields=['public_key_b64'])

        # Compare facial embeddings
        similarity = 0.0
        matched = False
        if citizen.facial_embedding_b64 and facial_embedding:
            similarity = _cosine_similarity(citizen.facial_embedding_b64, facial_embedding)
            threshold = getattr(settings, 'FACIAL_SIMILARITY_THRESHOLD', 0.75)
            matched = similarity >= threshold
            logger.info(
                'Facial similarity for %s: %.4f (threshold=%.2f, matched=%s)',
                citizen.aadhaar_number, similarity, threshold, matched
            )
        else:
            logger.warning(
                'Missing embedding for comparison: citizen_has=%s, ingrion_has=%s',
                bool(citizen.facial_embedding_b64), bool(facial_embedding)
            )

        # Create KYC request record
        kyc_request = IngrionKYCRequest.objects.create(
            archive_link=link,
            citizen=citizen,
            ingrion_submission_id=submission_id,
            public_key_b64=public_key,
            facial_embedding_b64=facial_embedding,
            callback_url=callback_url,
            facial_similarity=similarity,
            matched=matched,
            source_ip=source_ip,
        )

        # Also check KYC approval status
        kyc_approved = False
        try:
            kyc = KYCSubmission.objects.get(citizen=citizen)
            kyc_approved = (kyc.status == KYCStatus.APPROVED)
        except KYCSubmission.DoesNotExist:
            pass

        approved = matched and kyc_approved

        # Send callback to INGRION
        callback_sent = _send_ingrion_callback(kyc_request, approved)

        kyc_request.status = 'verified' if approved else 'rejected'
        kyc_request.callback_sent_at = timezone.now() if callback_sent else None
        kyc_request.save(update_fields=['status', 'callback_sent_at'])

        return Response({
            'detail': 'Verification processed.',
            'reference': f'GOV-ARCH-{str(kyc_request.id)[:8].upper()}',
            'matched': approved,
        })

    def get(self, request, token):
        """Allow INGRION to GET basic archive info (citizen name, status)."""
        try:
            link = ArchiveLink.objects.select_related('citizen').get(token=token)
        except ArchiveLink.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not link.is_valid:
            return Response({'detail': 'Link expired or revoked.'}, status=status.HTTP_403_FORBIDDEN)

        citizen = link.citizen
        return Response({
            'citizen_name': citizen.name,
            'aadhaar_number': citizen.aadhaar_number,
            'link_valid': link.is_valid,
            'expires_at': link.expires_at.isoformat(),
        })


class AdminRequestListView(APIView):
    """Admin: view all INGRION KYC requests."""
    permission_classes = [IsAdmin]

    def get(self, request):
        reqs = IngrionKYCRequest.objects.select_related('citizen', 'archive_link')
        return Response({
            'requests': [{
                'id': str(r.id),
                'citizen': r.citizen.name if r.citizen else None,
                'aadhaar': r.citizen.aadhaar_number if r.citizen else None,
                'ingrion_submission_id': r.ingrion_submission_id,
                'public_key_b64': r.public_key_b64,
                'facial_similarity': r.facial_similarity,
                'matched': r.matched,
                'status': r.status,
                'callback_sent_at': r.callback_sent_at.isoformat() if r.callback_sent_at else None,
                'created_at': r.created_at.isoformat(),
            } for r in reqs]
        })
