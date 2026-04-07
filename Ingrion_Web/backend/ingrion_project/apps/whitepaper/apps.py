from django.apps import AppConfig


class WhitepaperConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ingrion_project.apps.whitepaper'
    label = 'whitepaper'
    verbose_name = 'Whitepaper'
