"""Seed sample hourly_rate + cost_rate by role so Profitability has visible data.

Why this exists: every existing user has hourly_rate=0 and cost_rate=0, so
Revenue/Cost/Profit all come out to $0.00 in reports. This migration sets
sensible sample rates per role so filters show real differences. Operators
can override any value from the Edit Team Member page.

Reversible: backwards() resets each user back to 0/0 only when their values
still exactly match the seeded defaults (so manual edits aren't lost).
"""
from decimal import Decimal

from django.db import migrations


# (hourly billable rate, cost rate) keyed by role
ROLE_RATES = {
    'owner':   (Decimal('120.00'), Decimal('72.00')),
    'admin':   (Decimal('100.00'), Decimal('60.00')),
    'manager': (Decimal('85.00'),  Decimal('51.00')),
    'member':  (Decimal('70.00'),  Decimal('42.00')),
}


def forwards(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    for user in User.objects.filter(hourly_rate=0, cost_rate=0):
        seeds = ROLE_RATES.get(user.role)
        if not seeds:
            continue
        user.hourly_rate, user.cost_rate = seeds
        user.save(update_fields=['hourly_rate', 'cost_rate', 'updated_at'])


def backwards(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    for user in User.objects.exclude(hourly_rate=0):
        seeds = ROLE_RATES.get(user.role)
        if not seeds:
            continue
        if user.hourly_rate == seeds[0] and user.cost_rate == seeds[1]:
            user.hourly_rate = Decimal('0')
            user.cost_rate = Decimal('0')
            user.save(update_fields=['hourly_rate', 'cost_rate', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_backfill_cost_rate'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
