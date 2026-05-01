from django.db import migrations


DEFAULT_ACCOUNT_NAME = 'TrackFlow Default'


def backfill(apps, schema_editor):
    Account = apps.get_model('accounts', 'Account')
    User = apps.get_model('accounts', 'User')
    Client = apps.get_model('clients', 'Client')
    Project = apps.get_model('projects', 'Project')
    Task = apps.get_model('projects', 'Task')

    account, _ = Account.objects.get_or_create(name=DEFAULT_ACCOUNT_NAME)

    first_owner = User.objects.filter(role='owner', is_active=True).order_by('id').first()
    if first_owner and account.owner_id is None:
        account.owner = first_owner
        account.save(update_fields=['owner', 'updated_at'])

    User.objects.filter(account__isnull=True).update(account=account)
    Client.objects.filter(account__isnull=True).update(account=account)
    Project.objects.filter(account__isnull=True).update(account=account)
    Task.objects.filter(account__isnull=True).update(account=account)


def reverse(apps, schema_editor):
    Account = apps.get_model('accounts', 'Account')
    User = apps.get_model('accounts', 'User')
    Client = apps.get_model('clients', 'Client')
    Project = apps.get_model('projects', 'Project')
    Task = apps.get_model('projects', 'Task')

    default = Account.objects.filter(name=DEFAULT_ACCOUNT_NAME).first()
    if default:
        User.objects.filter(account=default).update(account=None)
        Client.objects.filter(account=default).update(account=None)
        Project.objects.filter(account=default).update(account=None)
        Task.objects.filter(account=default).update(account=None)
        default.owner = None
        default.save(update_fields=['owner'])
        default.delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_account_user_account'),
        ('clients', '0002_client_account'),
        ('projects', '0003_project_account_task_account_alter_task_name_and_more'),
    ]
    operations = [migrations.RunPython(backfill, reverse_code=reverse)]
