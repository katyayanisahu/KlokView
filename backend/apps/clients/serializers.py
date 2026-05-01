from rest_framework import serializers

from .models import Client, ClientContact


class ClientContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientContact
        fields = (
            'id', 'client', 'first_name', 'last_name', 'email',
            'title', 'office_number', 'mobile_number', 'fax_number',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class ClientSerializer(serializers.ModelSerializer):
    active_project_count = serializers.SerializerMethodField()
    contacts = ClientContactSerializer(many=True, read_only=True)

    class Meta:
        model = Client
        fields = (
            'id', 'name', 'address', 'currency',
            'invoice_due_date_type', 'tax_rate', 'discount_rate',
            'is_active', 'active_project_count', 'contacts',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'active_project_count', 'contacts')

    def get_active_project_count(self, obj) -> int:
        return obj.projects.filter(is_active=True).count()
