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
            name='ArchiveLink',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('expires_at', models.DateTimeField()),
                ('is_revoked', models.BooleanField(default=False)),
                ('accessed_at', models.DateTimeField(blank=True, null=True)),
                ('access_count', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('citizen', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='archive_links',
                    to='accounts.citizenuser',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='IngrionKYCRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('ingrion_submission_id', models.CharField(max_length=64)),
                ('public_key_b64', models.CharField(max_length=128)),
                ('facial_embedding_b64', models.TextField()),
                ('callback_url', models.URLField(max_length=2048)),
                ('facial_similarity', models.FloatField(blank=True, null=True)),
                ('matched', models.BooleanField(default=False)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('verified', 'Verified — callback sent'),
                        ('rejected', 'Rejected — callback sent'),
                        ('error', 'Error'),
                    ],
                    default='pending',
                    max_length=16,
                )),
                ('callback_sent_at', models.DateTimeField(blank=True, null=True)),
                ('source_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('archive_link', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='kyc_requests',
                    to='archive.archivelink',
                )),
                ('citizen', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='ingrion_requests',
                    to='accounts.citizenuser',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
