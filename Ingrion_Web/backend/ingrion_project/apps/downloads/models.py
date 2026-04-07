"""
Download Token Model — INGRION Blockchain Platform

One-time expiring tokens that unlock the 32MB application binary.
"""
import uuid
from datetime import timedelta

from django.db import models
from django.conf import settings
from django.utils import timezone


class DownloadToken(models.Model):
    token = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.ForeignKey(
        'kyc.KYCSubmission',
        on_delete=models.CASCADE,
        related_name='download_tokens',
    )
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    downloader_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.expires_at:
            expiry = getattr(settings, 'DOWNLOAD_TOKEN_EXPIRY_SECONDS', 900)
            self.expires_at = timezone.now() + timedelta(seconds=expiry)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired

    def consume(self, ip=None):
        """Mark token as used. Call once download begins."""
        self.is_used = True
        self.used_at = timezone.now()
        self.downloader_ip = ip
        self.save(update_fields=['is_used', 'used_at', 'downloader_ip'])

    def __str__(self):
        return f'Token {self.token} used={self.is_used} expired={self.is_expired}'
