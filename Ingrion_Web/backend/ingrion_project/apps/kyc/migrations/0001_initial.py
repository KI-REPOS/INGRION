from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='KYCSubmission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('archive_link', models.URLField(help_text='Government archive document URL', max_length=2048)),
                ('public_key_b64', models.CharField(help_text='Ed25519 public key in base64 (44 chars)', max_length=128, unique=True)),
                ('password_hash', models.CharField(max_length=256)),
                ('facial_embedding_b64', models.TextField()),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('submitted', 'Submitted to Government'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                        ('failed', 'Failed — Government Unreachable'),
                    ],
                    db_index=True,
                    default='pending',
                    max_length=16,
                )),
                ('government_reference', models.CharField(blank=True, max_length=256, null=True)),
                ('government_message', models.TextField(blank=True, null=True)),
                ('submitter_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['status', 'created_at'], name='kyc_submiss_status_idx'),
                    models.Index(fields=['public_key_b64'], name='kyc_submiss_pub_key_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='GovernmentCallbackLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('submission', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='callback_logs',
                    to='kyc.kycsubmission',
                )),
                ('raw_payload', models.JSONField()),
                ('hmac_valid', models.BooleanField()),
                ('processed_at', models.DateTimeField(auto_now_add=True)),
                ('source_ip', models.GenericIPAddressField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-processed_at'],
            },
        ),
    ]
