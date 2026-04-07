"""INGRION URL Configuration"""
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('api/kyc/', include('ingrion_project.apps.kyc.urls')),
    path('api/downloads/', include('ingrion_project.apps.downloads.urls')),
    path('api/whitepaper/', include('ingrion_project.apps.whitepaper.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
