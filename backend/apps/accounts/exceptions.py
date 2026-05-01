from rest_framework.views import exception_handler


def envelope_exception_handler(exc, context):
    """Wraps DRF error responses in the project's {success,data,error} envelope."""
    response = exception_handler(exc, context)
    if response is None:
        return response

    detail = response.data
    if isinstance(detail, dict) and 'detail' in detail and len(detail) == 1:
        message = detail['detail']
    else:
        message = detail

    response.data = {
        'success': False,
        'data': None,
        'error': message,
    }
    return response
