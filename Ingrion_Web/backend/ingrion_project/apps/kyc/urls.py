from django.urls import path
from .views import KYCSubmitView, KYCStatusView, GovernmentCallbackView

urlpatterns = [
    path('submit/', KYCSubmitView.as_view(), name='kyc-submit'),
    path('status/<uuid:submission_id>/', KYCStatusView.as_view(), name='kyc-status'),
    path('callback/', GovernmentCallbackView.as_view(), name='kyc-callback'),
]
