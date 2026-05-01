from django.db import migrations


DEFAULT_TASKS = [
    ('Business Development', False),
    ('Design', True),
    ('Marketing', True),
    ('Programming', True),
    ('Project Management', True),
]

DEMO_CLIENTS = [
    ('[SAMPLE] Client A', ''),
    ('[SAMPLE] Client B', ''),
    ('Example Client', ''),
]

DEMO_PROJECTS = [
    # (client_name, project_name, project_type, budget_type, budget_amount)
    ('[SAMPLE] Client A', '[SAMPLE] Fixed Fee Project', 'fixed_fee', 'total_fees', 18340),
    ('[SAMPLE] Client A', '[SAMPLE] Time & Materials Project', 'time_materials', 'total_hours', 156),
    ('[SAMPLE] Client B', '[SAMPLE] Monthly Retainer', 'time_materials', 'total_fees', 6020),
    ('[SAMPLE] Client B', '[SAMPLE] Non-Billable Project', 'non_billable', 'total_hours', 170),
    ('Example Client', 'Example Project', 'time_materials', 'total_hours', 50),
]


def seed(apps, schema_editor):
    Task = apps.get_model('projects', 'Task')
    Project = apps.get_model('projects', 'Project')
    ProjectTask = apps.get_model('projects', 'ProjectTask')
    ProjectMembership = apps.get_model('projects', 'ProjectMembership')
    Client = apps.get_model('clients', 'Client')
    User = apps.get_model('accounts', 'User')

    # Tasks (global library)
    task_objs = {}
    for name, is_default in DEFAULT_TASKS:
        task_objs[name] = Task.objects.create(name=name, is_default=is_default, default_is_billable=True)

    # Clients
    client_objs = {}
    for name, address in DEMO_CLIENTS:
        client_objs[name] = Client.objects.create(name=name, address=address)

    # Projects + seed each project with default tasks
    default_task_names = [name for name, is_default in DEFAULT_TASKS if is_default]
    project_objs = {}
    for client_name, project_name, project_type, budget_type, budget_amount in DEMO_PROJECTS:
        project = Project.objects.create(
            client=client_objs[client_name],
            name=project_name,
            project_type=project_type,
            budget_type=budget_type,
            budget_amount=budget_amount,
        )
        project_objs[project_name] = project
        for task_name in default_task_names:
            ProjectTask.objects.create(
                project=project,
                task=task_objs[task_name],
                is_billable=True,
            )

    # Assign the first active owner as project manager on every demo project
    owner = User.objects.filter(role='owner', is_active=True).order_by('id').first()
    if owner is not None:
        for project in project_objs.values():
            ProjectMembership.objects.create(
                project=project, user=owner, is_project_manager=True
            )


def unseed(apps, schema_editor):
    apps.get_model('projects', 'ProjectMembership').objects.all().delete()
    apps.get_model('projects', 'ProjectTask').objects.all().delete()
    apps.get_model('projects', 'Project').objects.all().delete()
    apps.get_model('projects', 'Task').objects.all().delete()
    apps.get_model('clients', 'Client').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0001_initial'),
        ('clients', '0001_initial'),
        ('accounts', '0003_user_first_name_user_invitation_token_and_more'),
    ]
    operations = [migrations.RunPython(seed, reverse_code=unseed)]
