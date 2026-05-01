"""
Reports API — to be built in Phase 4.

ROLE-BASED SCOPING (Harvest pattern) — required when implementing real views:

    role = request.user.role
    qs = TimeEntry.objects.filter(account_id=request.user.account_id)

    if role in ('owner', 'admin'):
        pass  # see everything in the workspace
    elif role == 'manager':
        # Own entries + entries on projects this user manages
        managed_project_ids = ProjectMembership.objects.filter(
            user=request.user, is_project_manager=True,
        ).values('project_id')
        qs = qs.filter(Q(user=request.user) | Q(project_id__in=managed_project_ids))
    else:  # member
        qs = qs.filter(user=request.user)

The Reports tab is visible to ALL roles in the navbar; the data is what's filtered.
This matches Harvest, where every user can see "their own reports" but nothing else.
"""
