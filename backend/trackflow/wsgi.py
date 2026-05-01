"""WSGI config for trackflow project."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'trackflow.settings')

application = get_wsgi_application()
