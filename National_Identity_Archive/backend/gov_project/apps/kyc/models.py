"""
KYC Models — Government Archive Platform
"""
import uuid
from django.db import models
from gov_project.apps.accounts.models import CitizenUser


def document_upload_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1]
    return f'kyc_docs/{instance.submission.citizen.aadhaar_number}/{instance.doc_type}.{ext}'


class KYCStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    SUBMITTED = 'submitted', 'Submitted for Review'
    UNDER_REVIEW = 'under_review', 'Under Review'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


DOC_TYPE_CHOICES = [
    ('aadhaar', 'Aadhaar Card'),
    ('pan', 'PAN Card'),
    ('passport', 'Passport'),
    ('voter_id', 'Voter ID'),
    ('driving_license', 'Driving License'),
    ('birth_certificate', 'Birth Certificate'),
]

REQUIRED_DOC_TYPES = ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license', 'birth_certificate']


class KYCSubmission(models.Model):
    """One KYC submission per citizen (updated in place until approved)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    citizen = models.OneToOneField(
        CitizenUser, on_delete=models.CASCADE, related_name='kyc_submission'
    )
    status = models.CharField(
        max_length=16, choices=KYCStatus.choices, default=KYCStatus.DRAFT, db_index=True
    )

    # Admin review
    reviewed_by = models.ForeignKey(
        'accounts.AdminUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reviews'
    )
    admin_remarks = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-submitted_at', '-created_at']

    def __str__(self):
        return f'KYC {self.citizen.name} [{self.status}]'

    @property
    def can_submit(self):
        """All 6 required document types uploaded."""
        uploaded = set(self.documents.values_list('doc_type', flat=True))
        return all(dt in uploaded for dt in REQUIRED_DOC_TYPES)


class KYCDocument(models.Model):
    """Individual document attached to a KYC submission."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.ForeignKey(
        KYCSubmission, on_delete=models.CASCADE, related_name='documents'
    )
    doc_type = models.CharField(max_length=32, choices=DOC_TYPE_CHOICES)
    file = models.FileField(upload_to=document_upload_path)
    filename = models.CharField(max_length=256)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('submission', 'doc_type')]
        ordering = ['doc_type']

    def __str__(self):
        return f'{self.get_doc_type_display()} for {self.submission.citizen.name}'
