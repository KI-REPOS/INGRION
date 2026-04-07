from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='KYCSubmission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('status', models.CharField(
                    choices=[
                        ('draft', 'Draft'),
                        ('submitted', 'Submitted for Review'),
                        ('under_review', 'Under Review'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                    ],
                    db_index=True,
                    default='draft',
                    max_length=16,
                )),
                ('admin_remarks', models.TextField(blank=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('citizen', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='kyc_submission',
                    to='accounts.citizenuser',
                )),
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviews',
                    to='accounts.adminuser',
                )),
            ],
            options={
                'ordering': ['-submitted_at', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='KYCDocument',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('doc_type', models.CharField(
                    choices=[
                        ('aadhaar', 'Aadhaar Card'),
                        ('pan', 'PAN Card'),
                        ('passport', 'Passport'),
                        ('voter_id', 'Voter ID'),
                        ('driving_license', 'Driving License'),
                        ('birth_certificate', 'Birth Certificate'),
                    ],
                    max_length=32,
                )),
                ('file', models.FileField(upload_to='kyc_docs/')),
                ('filename', models.CharField(max_length=256)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('submission', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='documents',
                    to='kyc.kycsubmission',
                )),
            ],
            options={
                'ordering': ['doc_type'],
                'unique_together': {('submission', 'doc_type')},
            },
        ),
    ]
