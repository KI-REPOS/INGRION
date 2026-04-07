from django.urls import path
from .views import ApplicationDownloadView, TokenValidateView

urlpatterns = [
    path('application/', ApplicationDownloadView.as_view(), name='download-application'),
    path('validate/', TokenValidateView.as_view(), name='download-validate'),
]
