"""
KYC Models — INGRION Blockchain Platform

No private keys are ever stored. Only the Ed25519 public key is persisted.
"""
import uuid
from django.db import models


class KYCStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    SUBMITTED = 'submitted', 'Submitted to Government'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'
    FAILED = 'failed', 'Failed — Government Unreachable'


class KYCSubmission(models.Model):
    """
    Represents a single KYC verification attempt.

    Security notes:
    - private_key is NEVER stored
    - password_hash is the client-side hashed password (we never see plaintext)
    - facial_embedding_b64 is base64-encoded embedding vector (NOT the raw image)
    - public_key_b64 is the Ed25519 public key in base64
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    archive_link = models.URLField(max_length=2048, help_text='Government archive document URL')
    public_key_b64 = models.CharField(
        max_length=128,
        unique=True,
        help_text='Ed25519 public key in base64 (44 chars)'
    )
    # Client-side hashed password — we never receive plaintext
    password_hash = models.CharField(max_length=256)
    # Base64-encoded facial embedding vector
    facial_embedding_b64 = models.TextField()

    status = models.CharField(
        max_length=16,
        choices=KYCStatus.choices,
        default=KYCStatus.PENDING,
        db_index=True,
    )

    # Reference token returned by the Government Archive API
    government_reference = models.CharField(max_length=256, blank=True, null=True)
    government_message = models.TextField(blank=True, null=True)

    # IP address for rate-limiting and audit
    submitter_ip = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['public_key_b64']),
        ]

    def __str__(self):
        return f'KYC {self.id} [{self.status}]'


class GovernmentCallbackLog(models.Model):
    """Audit log for every callback received from the Government Archive API."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.ForeignKey(
        KYCSubmission,
        on_delete=models.SET_NULL,
        null=True,
        related_name='callback_logs',
    )
    raw_payload = models.JSONField()
    hmac_valid = models.BooleanField()
    processed_at = models.DateTimeField(auto_now_add=True)
    source_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-processed_at']

    def __str__(self):
        return f'Callback {self.id} valid={self.hmac_valid}'
