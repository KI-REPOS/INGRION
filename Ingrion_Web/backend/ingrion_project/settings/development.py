# """Development settings"""
# from .base import *  # noqa

# DEBUG = True
# ALLOWED_HOSTS = ['*']
# CORS_ALLOW_ALL_ORIGINS = True

"""Development settings"""
from .base import *  # noqa

DEBUG = True
ALLOWED_HOSTS = ['*']
CORS_ALLOW_ALL_ORIGINS = True

# Dev ports: INGRION backend = 8000, Gov-Archive backend = 8001
# The gov-archive calls back to INGRION at this URL after verifying identity
GOVERNMENT_CALLBACK_URL = 'http://localhost:8000/api/kyc/callback/'