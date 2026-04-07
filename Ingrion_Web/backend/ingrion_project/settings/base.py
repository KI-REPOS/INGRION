"""
INGRION Blockchain Platform — Django Base Settings
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'CHANGE-THIS-IN-PRODUCTION-use-secrets-module')

DEBUG = False

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'ingrion_project.apps.kyc',
    'ingrion_project.apps.downloads',
    'ingrion_project.apps.whitepaper',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ingrion_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'backend' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
            ],
        },
    },
]

WSGI_APPLICATION = 'ingrion_project.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'UNAUTHENTICATED_USER': None,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/minute',
        'kyc_submit': '5/hour',
        'download': '3/hour',
    },
}

# CORS — allow only the frontend origin in production
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# CSRF
CSRF_TRUSTED_ORIGINS = os.environ.get(
    'CSRF_TRUSTED_ORIGINS',
    'http://localhost:5173'
).split(',')

# Security headers (enforce in production with HTTPS)
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# Government Archive API integration
GOVERNMENT_ARCHIVE_API_URL = os.environ.get(
    'GOVERNMENT_ARCHIVE_API_URL',
    'https://api.gov-archive.example.com/v1/verify'
)
GOVERNMENT_API_KEY = os.environ.get('GOVERNMENT_API_KEY', '')
# Shared HMAC secret for validating government callbacks
GOVERNMENT_CALLBACK_HMAC_SECRET = os.environ.get(
    'GOVERNMENT_CALLBACK_HMAC_SECRET',
    'CHANGE-THIS-SHARED-SECRET'
)
GOVERNMENT_CALLBACK_URL = os.environ.get(
    'GOVERNMENT_CALLBACK_URL',
    'https://your-domain.com/api/kyc/callback/'
)

# Download token expiry in seconds (default 15 minutes)
DOWNLOAD_TOKEN_EXPIRY_SECONDS = int(os.environ.get('DOWNLOAD_TOKEN_EXPIRY_SECONDS', 900))

# Path to the 32MB application binary
APPLICATION_BINARY_PATH = os.environ.get(
    'APPLICATION_BINARY_PATH',
    str(BASE_DIR / 'protected' / 'ingrion-app.bin')
)

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'ingrion': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}