from rest_framework import serializers

from .models import ImportedCalendarEvent, OutlookConnection


class OutlookStatusSerializer(serializers.Serializer):
    connected = serializers.BooleanField()
    email = serializers.EmailField(allow_null=True)
    connected_at = serializers.DateTimeField(allow_null=True)
    configured = serializers.BooleanField()


class OutlookEventSerializer(serializers.Serializer):
    """Shape returned to the frontend event picker."""
    outlook_event_id = serializers.CharField()
    subject = serializers.CharField()
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    duration_hours = serializers.FloatField()
    body_preview = serializers.CharField(allow_blank=True, required=False)
    organizer = serializers.CharField(allow_blank=True, required=False)
    web_link = serializers.URLField(allow_blank=True, required=False)
    already_imported = serializers.BooleanField()


class MarkImportedSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedCalendarEvent
        fields = ['id', 'outlook_event_id', 'time_entry', 'event_subject', 'event_start', 'event_end', 'imported_at']
        read_only_fields = ['id', 'imported_at']


__all__ = [
    'OutlookStatusSerializer',
    'OutlookEventSerializer',
    'MarkImportedSerializer',
    'OutlookConnection',
]
