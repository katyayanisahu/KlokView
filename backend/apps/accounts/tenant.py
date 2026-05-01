class TenantScopedMixin:
    """Filters queryset by request.user.account_id and auto-assigns on create.

    Use on ViewSets whose model has an `account` FK. For models where the account
    is inherited transitively (junction tables), scope via the parent's queryset.
    """

    tenant_field = 'account'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user and user.is_authenticated:
            return qs.filter(**{self.tenant_field: user.account_id})
        return qs.none()

    def perform_create(self, serializer):
        serializer.save(**{self.tenant_field: self.request.user.account})
