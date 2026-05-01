from django.contrib import admin

from .models import ImportedCalendarEvent, OutlookConnection


@admin.register(OutlookConnection)
class OutlookConnectionAdmin(admin.ModelAdmin):
    list_display = ('user', 'ms_account_email', 'token_expires_at', 'connected_at')
    search_fields = ('user__email', 'ms_account_email')
    readonly_fields = ('access_token_encrypted', 'refresh_token_encrypted', 'connected_at', 'updated_at')


@admin.register(ImportedCalendarEvent)
class ImportedCalendarEventAdmin(admin.ModelAdmin):
    list_display = ('user', 'event_subject', 'event_start', 'time_entry', 'imported_at')
    search_fields = ('user__email', 'event_subject', 'outlook_event_id')
    readonly_fields = ('imported_at',)
