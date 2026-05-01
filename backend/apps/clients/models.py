from django.db import models


class Client(models.Model):
    class InvoiceDueDate(models.TextChoices):
        CUSTOM = 'custom', 'Custom'
        NET_15 = 'net_15', 'Net 15'
        NET_30 = 'net_30', 'Net 30'
        UPON_RECEIPT = 'upon_receipt', 'Upon receipt'

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE, related_name='clients',
    )
    name = models.CharField(max_length=150)
    address = models.TextField(blank=True, default='')
    currency = models.CharField(max_length=3, default='USD')
    invoice_due_date_type = models.CharField(
        max_length=20, choices=InvoiceDueDate.choices, default=InvoiceDueDate.CUSTOM
    )
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    discount_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'clients'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class ClientContact(models.Model):
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name='contacts',
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    title = models.CharField(max_length=100, blank=True, default='')
    office_number = models.CharField(max_length=40, blank=True, default='')
    mobile_number = models.CharField(max_length=40, blank=True, default='')
    fax_number = models.CharField(max_length=40, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'client_contacts'
        ordering = ['first_name', 'last_name']

    def __str__(self) -> str:
        full = f'{self.first_name} {self.last_name}'.strip()
        return full or self.email or f'Contact #{self.pk}'
