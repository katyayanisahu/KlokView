from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_jobrole_user_job_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='employee_id',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Optional unique identifier for this employee within the organization.',
                max_length=100,
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='weekly_capacity_hours',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('35'),
                help_text='Hours per week this person is available to work. Used for utilization reports.',
                max_digits=5,
            ),
        ),
    ]
