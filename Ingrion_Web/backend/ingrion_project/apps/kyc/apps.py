from django.apps import AppConfig


class KYCConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ingrion_project.apps.kyc'
    label = 'kyc'
    verbose_name = 'KYC Verification'
