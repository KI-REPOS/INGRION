"""
KYC Views — Government Archive Platform
"""
import logging
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser

from gov_project.apps.accounts.permissions import IsCitizen, IsAdmin
from .models import KYCSubmission, KYCDocument, KYCStatus, REQUIRED_DOC_TYPES, DOC_TYPE_CHOICES

logger = logging.getLogger('gov_archive.kyc')


def _submission_data(sub):
    docs = {d.doc_type: {
        'id': str(d.id),
        'doc_type': d.doc_type,
        'doc_type_label': d.get_doc_type_display(),
        'filename': d.filename,
        'uploaded_at': d.uploaded_at.isoformat(),
        'url': d.file.url,
    } for d in sub.documents.all()}

    return {
        'id': str(sub.id),
        'status': sub.status,
        'status_label': sub.get_status_display(),
        'can_submit': sub.can_submit,
        'documents': docs,
        'required_docs': REQUIRED_DOC_TYPES,
        'admin_remarks': sub.admin_remarks,
        'submitted_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
        'reviewed_at': sub.reviewed_at.isoformat() if sub.reviewed_at else None,
        'citizen': {
            'name': sub.citizen.name,
            'aadhaar_number': sub.citizen.aadhaar_number,
        }
    }


class MyKYCView(APIView):
    """Citizen: get or create their own KYC submission."""
    permission_classes = [IsCitizen]

    def get(self, request):
        citizen = request.user.citizen
        sub, _ = KYCSubmission.objects.get_or_create(citizen=citizen)
        return Response(_submission_data(sub))


class UploadDocumentView(APIView):
    """Citizen: upload a KYC document (PDF)."""
    permission_classes = [IsCitizen]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        citizen = request.user.citizen
        doc_type = request.data.get('doc_type', '').strip()
        file = request.FILES.get('file')

        valid_types = [dt[0] for dt in DOC_TYPE_CHOICES]
        if doc_type not in valid_types:
            return Response(
                {'detail': f'Invalid doc_type. Must be one of: {valid_types}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not file:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        if not file.name.lower().endswith('.pdf'):
            return Response({'detail': 'Only PDF files are accepted.'}, status=status.HTTP_400_BAD_REQUEST)

        if file.size > 10 * 1024 * 1024:  # 10MB limit
            return Response({'detail': 'File too large. Max 10MB.'}, status=status.HTTP_400_BAD_REQUEST)

        sub, _ = KYCSubmission.objects.get_or_create(citizen=citizen)

        if sub.status in [KYCStatus.SUBMITTED, KYCStatus.UNDER_REVIEW, KYCStatus.APPROVED]:
            return Response(
                {'detail': 'Cannot modify documents after submission.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Replace existing doc of same type if exists
        KYCDocument.objects.filter(submission=sub, doc_type=doc_type).delete()

        doc = KYCDocument.objects.create(
            submission=sub,
            doc_type=doc_type,
            file=file,
            filename=file.name,
        )

        logger.info('Document uploaded: %s for %s', doc_type, citizen.aadhaar_number)
        return Response({
            'detail': 'Document uploaded.',
            'document': {
                'id': str(doc.id),
                'doc_type': doc.doc_type,
                'doc_type_label': doc.get_doc_type_display(),
                'filename': doc.filename,
                'url': doc.file.url,
            }
        }, status=status.HTTP_201_CREATED)


class SubmitKYCView(APIView):
    """Citizen: submit their KYC for admin review."""
    permission_classes = [IsCitizen]

    def post(self, request):
        citizen = request.user.citizen
        sub, _ = KYCSubmission.objects.get_or_create(citizen=citizen)

        if sub.status == KYCStatus.APPROVED:
            return Response({'detail': 'Already approved.'}, status=status.HTTP_400_BAD_REQUEST)

        if sub.status in [KYCStatus.SUBMITTED, KYCStatus.UNDER_REVIEW]:
            return Response({'detail': 'Already submitted and under review.'}, status=status.HTTP_400_BAD_REQUEST)

        if not sub.can_submit:
            uploaded = set(sub.documents.values_list('doc_type', flat=True))
            missing = [d for d in REQUIRED_DOC_TYPES if d not in uploaded]
            return Response(
                {'detail': f'Missing documents: {missing}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Require facial embedding
        if not citizen.facial_embedding_b64:
            return Response(
                {'detail': 'Facial scan is required before submission.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        sub.status = KYCStatus.SUBMITTED
        sub.submitted_at = timezone.now()
        sub.admin_remarks = ''
        sub.save()

        logger.info('KYC submitted by %s', citizen.aadhaar_number)
        return Response({'detail': 'KYC submitted for review.', 'submission': _submission_data(sub)})


# ─── Admin Views ─────────────────────────────────────────────────


class AdminKYCListView(APIView):
    """Admin: list all KYC submissions filtered by status."""
    permission_classes = [IsAdmin]

    def get(self, request):
        filter_status = request.query_params.get('status', '')
        qs = KYCSubmission.objects.select_related('citizen', 'reviewed_by').prefetch_related('documents')

        if filter_status:
            qs = qs.filter(status=filter_status)
        else:
            # Default: show submitted and under_review first
            qs = qs.filter(status__in=[
                KYCStatus.SUBMITTED, KYCStatus.UNDER_REVIEW,
                KYCStatus.APPROVED, KYCStatus.REJECTED
            ])

        return Response({
            'submissions': [_submission_data(s) for s in qs],
            'counts': {
                'submitted': KYCSubmission.objects.filter(status=KYCStatus.SUBMITTED).count(),
                'under_review': KYCSubmission.objects.filter(status=KYCStatus.UNDER_REVIEW).count(),
                'approved': KYCSubmission.objects.filter(status=KYCStatus.APPROVED).count(),
                'rejected': KYCSubmission.objects.filter(status=KYCStatus.REJECTED).count(),
            }
        })


class AdminKYCDetailView(APIView):
    """Admin: view a single KYC submission."""
    permission_classes = [IsAdmin]

    def get(self, request, submission_id):
        try:
            sub = KYCSubmission.objects.select_related(
                'citizen', 'reviewed_by'
            ).prefetch_related('documents').get(id=submission_id)
        except KYCSubmission.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = _submission_data(sub)
        # Include citizen profile photo and embedding info
        data['citizen_profile'] = {
            'name': sub.citizen.name,
            'aadhaar_number': sub.citizen.aadhaar_number,
            'date_of_birth': str(sub.citizen.date_of_birth) if sub.citizen.date_of_birth else None,
            'address': sub.citizen.address,
            'phone': sub.citizen.phone,
            'email': sub.citizen.email,
            'profile_photo': sub.citizen.profile_photo.url if sub.citizen.profile_photo else None,
            'has_facial_embedding': bool(sub.citizen.facial_embedding_b64),
            'public_key_b64': sub.citizen.public_key_b64,
        }
        if sub.reviewed_by:
            data['reviewed_by'] = {'name': sub.reviewed_by.name, 'username': sub.reviewed_by.username}

        return Response(data)


class AdminReviewKYCView(APIView):
    """Admin: approve or reject a KYC submission."""
    permission_classes = [IsAdmin]

    def post(self, request, submission_id):
        try:
            sub = KYCSubmission.objects.select_related('citizen').get(id=submission_id)
        except KYCSubmission.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if sub.status not in [KYCStatus.SUBMITTED, KYCStatus.UNDER_REVIEW]:
            return Response(
                {'detail': 'Can only review submitted or under-review submissions.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        decision = request.data.get('decision', '').strip()
        remarks = request.data.get('remarks', '').strip()

        if decision not in ['approved', 'rejected']:
            return Response(
                {'detail': 'decision must be "approved" or "rejected".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        sub.status = KYCStatus.APPROVED if decision == 'approved' else KYCStatus.REJECTED
        sub.admin_remarks = remarks
        sub.reviewed_by = request.user.admin
        sub.reviewed_at = timezone.now()
        sub.save()

        logger.info(
            'KYC %s %s by admin %s',
            sub.id, decision, request.user.admin.username
        )

        return Response({'detail': f'Submission {decision}.', 'submission': _submission_data(sub)})
