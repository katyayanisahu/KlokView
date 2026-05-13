from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsOwnerOrAdminForWrite
from apps.accounts.tenant import TenantScopedMixin

from .models import Client, ClientContact
from .serializers import ClientContactSerializer, ClientSerializer


class ClientViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Client.objects.all().prefetch_related('contacts')
    serializer_class = ClientSerializer
    permission_classes = [IsOwnerOrAdminForWrite]
    filterset_fields = ['is_active']
    search_fields = ['name']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role not in ('owner', 'admin'):
            qs = qs.filter(projects__memberships__user=user).distinct()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1', 'yes'))
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    def destroy(self, request, *args, **kwargs):
        client = self.get_object()
        if client.projects.filter(is_active=True).exists():
            return Response(
                {'detail': f'Cannot archive "{client.name}" because it has active projects.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        client.is_active = False
        client.save(update_fields=['is_active', 'updated_at'])
        return Response({'detail': f'"{client.name}" archived.'}, status=status.HTTP_200_OK)


class ClientContactViewSet(viewsets.ModelViewSet):
    queryset = ClientContact.objects.select_related('client').all()
    serializer_class = ClientContactSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrite]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user and user.is_authenticated):
            return qs.none()
        qs = qs.filter(client__account_id=user.account_id)
        if user.role not in ('owner', 'admin'):
            qs = qs.filter(client__projects__memberships__user=user).distinct()
        client_id = self.request.query_params.get('client')
        if client_id:
            qs = qs.filter(client_id=client_id)
        return qs

    def perform_create(self, serializer):
        client = serializer.validated_data.get('client')
        if client.account_id != self.request.user.account_id:
            raise PermissionDenied('Cannot add contact to a client outside your account.')
        serializer.save()

    def perform_update(self, serializer):
        client = serializer.validated_data.get('client', serializer.instance.client)
        if client.account_id != self.request.user.account_id:
            raise PermissionDenied('Cannot move contact to a client outside your account.')
        serializer.save()
