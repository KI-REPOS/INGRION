from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('kyc', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DownloadToken',
            fields=[
                ('token', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('submission', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='download_tokens',
                    to='kyc.kycsubmission',
                )),
                ('is_used', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used_at', models.DateTimeField(null=True, blank=True)),
                ('downloader_ip', models.GenericIPAddressField(null=True, blank=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
