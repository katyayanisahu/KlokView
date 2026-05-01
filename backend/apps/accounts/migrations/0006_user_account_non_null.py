from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0005_backfill_default_account'),
    ]
    operations = [
        migrations.AlterField(
            model_name='user',
            name='account',
            field=models.ForeignKey(
                on_delete=models.deletion.PROTECT,
                related_name='users',
                to='accounts.account',
            ),
        ),
    ]
