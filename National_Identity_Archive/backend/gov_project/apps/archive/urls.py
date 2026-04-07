from django.urls import path
from . import views

urlpatterns = [
    path('links/generate/', views.GenerateArchiveLinkView.as_view()),
    path('links/', views.ArchiveLinkListView.as_view()),
    path('links/<uuid:link_id>/revoke/', views.RevokeArchiveLinkView.as_view()),
    path('verify/<str:token>/', views.VerifyArchiveLinkView.as_view()),
    path('admin/requests/', views.AdminRequestListView.as_view()),
]
