from django.apps import AppConfig


class ProjectsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.projects'
    label = 'projects'

    def ready(self):
        from . import signals  # noqa: F401  — registers post_save handlers
