from django.contrib import admin

from .models import Submission, TimeEntry


@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'project', 'project_task', 'date', 'hours', 'is_billable', 'is_running')
    list_filter = ('is_billable', 'is_running', 'date')
    search_fields = ('user__email', 'user__full_name', 'project__name', 'notes')
    autocomplete_fields = ()
    raw_id_fields = ('account', 'user', 'project', 'project_task')
    date_hierarchy = 'date'


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'start_date', 'end_date', 'status', 'submitted_at', 'decided_by')
    list_filter = ('status', 'start_date')
    search_fields = ('user__email', 'user__full_name')
    raw_id_fields = ('account', 'user', 'decided_by')
    date_hierarchy = 'submitted_at'
