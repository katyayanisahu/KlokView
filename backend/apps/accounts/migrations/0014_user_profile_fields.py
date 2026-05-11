from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_account_allow_google_sso_account_allow_microsoft_sso_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='timezone',
            field=models.CharField(
                blank=True,
                default='',
                help_text='IANA timezone name (e.g. "Asia/Kolkata"). Blank falls back to account timezone.',
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='home_show_welcome',
            field=models.BooleanField(
                default=True,
                help_text='Show the dashboard welcome banner for this user.',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='notification_prefs',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Per-user notification preferences. Keys: '
                    'reminder_personal_daily, reminder_team_wide, weekly_email, '
                    'approval_email_people, approval_email_projects, approval_email_approved, '
                    'project_deleted_email, product_updates_email.'
                ),
            ),
        ),
    ]
