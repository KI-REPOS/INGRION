from django.urls import path
from .views import WhitepaperView, WhitepaperPDFView

urlpatterns = [
    path('', WhitepaperView.as_view(), name='whitepaper'),
    path('pdf/', WhitepaperPDFView.as_view(), name='whitepaper-pdf'),
]
