from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import EventViewSet, LanguageViewSet, InterpreterViewSet, connections_count

router = DefaultRouter()
router.register(r'events', EventViewSet)
router.register(r'languages', LanguageViewSet)
router.register(r'interpreters', InterpreterViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/admin/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/admin/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/connections/<str:lang_code>/', connections_count, name='connections_count'),
]
