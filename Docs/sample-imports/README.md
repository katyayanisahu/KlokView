# Sample CSVs for Settings → Import / Export → Import time

Drop any of these into the **Import time** modal to test the flow. They use the
real users, projects, and tasks that already exist in the workspace.

| File | What it tests | Rows |
|---|---|---|
| `1_basic_my_week.csv` | Minimal columns, no `person` column → defaults to logged-in user | 5 |
| `2_multi_user_team_week.csv` | Mixed teammates referenced by email + full name | 10 |
| `3_sample_projects_smart_match.csv` | Sample projects WITHOUT the `[SAMPLE]` prefix — the smart matcher should still resolve them | 6 |
| `4_backfill_two_months.csv` | Older dates spanning March–April 2026, mix of users and projects | 15 |
| `5_date_format_variants.csv` | Mixes `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` to verify date parsing | 4 |

## Column reference

| Column | Required? | Notes |
|---|---|---|
| `date` | ✅ | `YYYY-MM-DD` / `DD/MM/YYYY` / `MM/DD/YYYY` / `DD-MM-YYYY` |
| `project` | ✅ | Exact project name. `[SAMPLE]` prefix is stripped during lookup, so `Monthly Retainer` matches `[SAMPLE] Monthly Retainer` |
| `task` | ✅ | Task name as configured on that project |
| `hours` | ✅ | Decimal `0–24` (e.g. `1.5`) |
| `person` | ⬜ | Email or full name. Defaults to **you** (the logged-in user) when blank |
| `notes` | ⬜ | Free text |
| `billable` | ⬜ | `yes` / `no` / `true` / `false` / `1` / `0`. Defaults to the project-task default |

## Reverting

Every import creates an `ImportBatch`. Use **Settings → Import / Export → Revert
an import** to undo a batch — only the rows from that import disappear, your
manually-tracked entries stay untouched.
