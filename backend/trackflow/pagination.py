"""Default pagination — extends DRF's PageNumberPagination to accept a
`page_size` query param so importers can fetch large lookup tables (e.g. all
clients during a CSV import) in a single request instead of looping over pages.
"""
from rest_framework.pagination import PageNumberPagination


class WorkspacePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000
