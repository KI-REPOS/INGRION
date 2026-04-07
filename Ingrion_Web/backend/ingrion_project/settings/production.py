"""Production settings — import via DJANGO_SETTINGS_MODULE=ingrion_project.settings.production"""
from .base import *  # noqa

DEBUG = False

# Force HTTPS in production
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
