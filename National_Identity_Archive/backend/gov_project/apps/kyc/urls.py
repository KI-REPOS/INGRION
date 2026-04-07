from django.urls import path
from . import views

urlpatterns = [
    path('my/', views.MyKYCView.as_view()),
    path('upload/', views.UploadDocumentView.as_view()),
    path('submit/', views.SubmitKYCView.as_view()),
    path('admin/list/', views.AdminKYCListView.as_view()),
    path('admin/<uuid:submission_id>/', views.AdminKYCDetailView.as_view()),
    path('admin/<uuid:submission_id>/review/', views.AdminReviewKYCView.as_view()),
]
