from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('clients', '0003_client_account_non_null'),
    ]
    operations = [
        migrations.CreateModel(
            name='ClientContact',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=100)),
                ('last_name', models.CharField(blank=True, default='', max_length=100)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('title', models.CharField(blank=True, default='', max_length=100)),
                ('office_number', models.CharField(blank=True, default='', max_length=40)),
                ('mobile_number', models.CharField(blank=True, default='', max_length=40)),
                ('fax_number', models.CharField(blank=True, default='', max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name='contacts',
                    to='clients.client',
                )),
            ],
            options={
                'db_table': 'client_contacts',
                'ordering': ['first_name', 'last_name'],
            },
        ),
    ]
