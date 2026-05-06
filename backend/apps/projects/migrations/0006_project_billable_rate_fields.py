from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0005_task_default_billable_rate'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='billable_rate_strategy',
            field=models.CharField(
                choices=[
                    ('person', 'Person billable rate'),
                    ('task', 'Task billable rate'),
                    ('project', 'Project billable rate'),
                    ('none', 'None / non-billable'),
                ],
                default='person',
                help_text='How billable revenue is computed for this project.',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='project',
            name='flat_billable_rate',
            field=models.DecimalField(
                blank=True, decimal_places=2,
                help_text='Single billable rate applied when billable_rate_strategy=project. NULL otherwise.',
                max_digits=10, null=True,
            ),
        ),
        migrations.AddField(
            model_name='projecttask',
            name='billable_rate',
            field=models.DecimalField(
                blank=True, decimal_places=2,
                help_text='Per-project override for this task. NULL = fall back to Task.default_billable_rate.',
                max_digits=10, null=True,
            ),
        ),
    ]
