from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('clients', '0002_client_account'),
        ('accounts', '0005_backfill_default_account'),
    ]
    operations = [
        migrations.AlterField(
            model_name='client',
            name='account',
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name='clients',
                to='accounts.account',
            ),
        ),
    ]
