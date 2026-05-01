from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0003_project_account_task_account_alter_task_name_and_more'),
        ('accounts', '0005_backfill_default_account'),
    ]
    operations = [
        migrations.AlterField(
            model_name='project',
            name='account',
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name='projects',
                to='accounts.account',
            ),
        ),
        migrations.AlterField(
            model_name='task',
            name='account',
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name='tasks',
                to='accounts.account',
            ),
        ),
    ]
