from django.contrib import admin

from .models import Client, ClientContact


class ClientContactInline(admin.TabularInline):
    model = ClientContact
    extra = 0


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('name', 'currency', 'is_active', 'account')
    list_filter = ('is_active', 'currency')
    search_fields = ('name',)
    inlines = [ClientContactInline]


@admin.register(ClientContact)
class ClientContactAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'email', 'client')
    search_fields = ('first_name', 'last_name', 'email')
    list_filter = ('client',)
