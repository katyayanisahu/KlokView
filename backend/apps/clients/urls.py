from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClientContactViewSet, ClientViewSet

clients_router = DefaultRouter()
clients_router.register(r'', ClientViewSet, basename='client')

contacts_router = DefaultRouter()
contacts_router.register(r'', ClientContactViewSet, basename='client-contact')

urlpatterns = [
    path('contacts/', include(contacts_router.urls)),
    path('', include(clients_router.urls)),
]
