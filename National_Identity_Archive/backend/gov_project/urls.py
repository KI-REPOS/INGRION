"""Government Archive Platform URL Configuration"""
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('api/auth/', include('gov_project.apps.accounts.urls')),
    path('api/kyc/', include('gov_project.apps.kyc.urls')),
    path('api/archive/', include('gov_project.apps.archive.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
