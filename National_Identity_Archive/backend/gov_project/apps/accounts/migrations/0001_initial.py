from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='AdminUser',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('username', models.CharField(max_length=64, unique=True)),
                ('name', models.CharField(max_length=256)),
                ('department', models.CharField(blank=True, max_length=256)),
                ('password_hash', models.CharField(max_length=256)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='CitizenUser',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('aadhaar_number', models.CharField(db_index=True, max_length=12, unique=True)),
                ('name', models.CharField(max_length=256)),
                ('date_of_birth', models.DateField(blank=True, null=True)),
                ('address', models.TextField(blank=True)),
                ('phone', models.CharField(blank=True, max_length=15)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('password_hash', models.CharField(max_length=256)),
                ('profile_photo', models.ImageField(blank=True, null=True, upload_to='profiles/')),
                ('facial_embedding_b64', models.TextField(blank=True)),
                ('public_key_b64', models.CharField(blank=True, max_length=128)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='AuthToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('citizen', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='tokens',
                    to='accounts.citizenuser',
                )),
                ('admin', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='tokens',
                    to='accounts.adminuser',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
