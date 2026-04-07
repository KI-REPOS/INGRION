from django.urls import path
from . import views

urlpatterns = [
    path('citizen/login/', views.CitizenLoginView.as_view()),
    path('admin/login/', views.AdminLoginView.as_view()),
    path('logout/', views.LogoutView.as_view()),
    path('me/', views.MeView.as_view()),
    path('profile/', views.CitizenProfileView.as_view()),
]
