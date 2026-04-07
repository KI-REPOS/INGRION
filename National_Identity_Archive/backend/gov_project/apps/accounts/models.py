"""
Accounts Models — Government Archive Platform

Users are citizens with Aadhaar numbers.
Admins are government officials who review KYC submissions.
Sessions use simple token auth (no Django auth framework needed).
"""
import uuid
import hashlib
import secrets
from django.db import models
from django.utils import timezone


def profile_photo_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1]
    return f'profiles/{instance.aadhaar_number}.{ext}'


class CitizenUser(models.Model):
    """
    Pre-seeded citizen accounts. Password stored as SHA-256 hash.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    aadhaar_number = models.CharField(max_length=12, unique=True, db_index=True)
    name = models.CharField(max_length=256)
    date_of_birth = models.DateField(null=True, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)

    password_hash = models.CharField(max_length=256)

    # Profile photo (uploaded during registration/KYC)
    profile_photo = models.ImageField(upload_to=profile_photo_path, null=True, blank=True)

    # Facial embedding stored as base64 (extracted from camera, matched against INGRION)
    facial_embedding_b64 = models.TextField(blank=True)

    # Ed25519 public key submitted by INGRION during KYC verification
    public_key_b64 = models.CharField(max_length=128, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.aadhaar_number})'

    def set_password(self, raw_password):
        self.password_hash = hashlib.sha256(raw_password.encode()).hexdigest()

    def check_password(self, raw_password):
        return self.password_hash == hashlib.sha256(raw_password.encode()).hexdigest()


class AdminUser(models.Model):
    """Government officials who review and approve/reject KYC submissions."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=256)
    department = models.CharField(max_length=256, blank=True)
    password_hash = models.CharField(max_length=256)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_password(self, raw_password):
        self.password_hash = hashlib.sha256(raw_password.encode()).hexdigest()

    def check_password(self, raw_password):
        return self.password_hash == hashlib.sha256(raw_password.encode()).hexdigest()

    def __str__(self):
        return f'{self.name} ({self.username})'


class AuthToken(models.Model):
    """
    Simple session tokens for both citizen users and admins.
    """
    token = models.CharField(max_length=64, unique=True, db_index=True)

    # One of these will be set, not both
    citizen = models.ForeignKey(
        CitizenUser, null=True, blank=True,
        on_delete=models.CASCADE, related_name='tokens'
    )
    admin = models.ForeignKey(
        AdminUser, null=True, blank=True,
        on_delete=models.CASCADE, related_name='tokens'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_hex(32)
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(hours=12)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def user_type(self):
        if self.admin_id:
            return 'admin'
        return 'citizen'

    def __str__(self):
        return f'Token for {self.citizen or self.admin}'
