"""Backfill User.cost_rate so Profitability has non-zero numbers out of the box.

For users where cost_rate=0 and hourly_rate>0, assume cost_rate is ~60% of the
billable rate (typical employer cost ratio: salary + overhead ÷ what's charged).
Operators can override this from the Edit Team Member page.

Reversible: sets cost_rate back to 0 for any user that still has a non-zero
hourly_rate (unchanged-by-user data).
"""
from decimal import Decimal

from django.db import migrations


COST_RATIO = Decimal('0.60')


def forwards(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    qs = User.objects.filter(cost_rate=0).exclude(hourly_rate=0)
    for user in qs:
        user.cost_rate = (user.hourly_rate * COST_RATIO).quantize(Decimal('0.01'))
        user.save(update_fields=['cost_rate', 'updated_at'])


def backwards(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    # Best-effort revert: zero out cost_rates that match the 60% assumption,
    # leaving any operator-customized values alone.
    for user in User.objects.exclude(hourly_rate=0).exclude(cost_rate=0):
        expected = (user.hourly_rate * COST_RATIO).quantize(Decimal('0.01'))
        if user.cost_rate == expected:
            user.cost_rate = Decimal('0')
            user.save(update_fields=['cost_rate', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_user_cost_rate'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
