from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_user_employee_id_capacity'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='cost_rate',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0'),
                help_text='Cost rate for this user (what we pay per hour). Used in Profitability reports.',
                max_digits=10,
            ),
        ),
    ]
