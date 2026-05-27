# AI Profiling V2

MVP system for structured job profiling interviews, expected profile generation
from official artifacts, and comparison of interview-derived profiles with
expected profiles.

## Database

Database and entity reference:

- [docs/database.md](docs/database.md)

Create a `.env` file with:

```env
DATABASE_URL=postgresql://profiling:profiling@localhost:5432/profiling_db
OPENAI_API_KEY=<your-openai-api-key>
```

Apply migrations:

```bash
uv run python scripts/apply_migrations.py
```

Import the staffing workbook:

```bash
uv run python scripts/import_staffing_xlsx.py data/staffing_with_artifact_text_links.xlsx
```

Check the workbook without writing to the database:

```bash
uv run python scripts/import_staffing_xlsx.py --dry-run data/staffing_with_artifact_text_links.xlsx
```

The importer removes exact duplicate staffing rows, builds the full
`org_units` tree, aggregates staffing FTEs into `positions`, stores artifacts,
and creates artifact links. Artifact links below confidence `0.75` are imported
with `review_status = 'needs_review'`; the rest are `auto_accepted`.
