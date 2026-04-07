import re
import base64
from rest_framework import serializers
from .models import KYCSubmission


class KYCSubmissionSerializer(serializers.Serializer):
    archive_link = serializers.URLField(max_length=2048)
    public_key_b64 = serializers.CharField(max_length=128)
    password_hash = serializers.CharField(max_length=256)
    facial_embedding_b64 = serializers.CharField()

    def validate_public_key_b64(self, value):
        try:
            decoded = base64.b64decode(value)
        except Exception:
            raise serializers.ValidationError('public_key_b64 is not valid base64.')
        if len(decoded) != 32:
            raise serializers.ValidationError(
                f'Ed25519 public key must be 32 bytes; got {len(decoded)}.'
            )
        # Reject duplicate public keys
        if KYCSubmission.objects.filter(public_key_b64=value).exists():
            raise serializers.ValidationError(
                'A submission with this public key already exists.'
            )
        return value

    def validate_facial_embedding_b64(self, value):
        try:
            decoded = base64.b64decode(value)
        except Exception:
            raise serializers.ValidationError('facial_embedding_b64 is not valid base64.')
        # Expect a float32 vector — typical embedding is 128–512 floats = 512–2048 bytes
        if len(decoded) < 128 or len(decoded) > 8192:
            raise serializers.ValidationError(
                'facial_embedding_b64 size out of expected range (128–8192 bytes).'
            )
        return value

    def validate_password_hash(self, value):
        # Expect a hex string from a strong hash (SHA-256 or Argon2id output)
        if not re.match(r'^[a-fA-F0-9]{64,}$', value):
            raise serializers.ValidationError(
                'password_hash must be a hex-encoded hash of at least 64 characters.'
            )
        return value


class KYCStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = KYCSubmission
        fields = ['id', 'status', 'government_message', 'created_at', 'updated_at']
        read_only_fields = fields


class GovernmentCallbackSerializer(serializers.Serializer):
    """Inbound payload from the Government Archive API callback."""
    reference = serializers.CharField(max_length=256)
    status = serializers.ChoiceField(choices=['approved', 'rejected'])
    message = serializers.CharField(required=False, allow_blank=True, default='')
    submission_id = serializers.UUIDField()
