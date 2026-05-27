from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply SQL migrations to PostgreSQL.")
    parser.add_argument(
        "--migrations-dir",
        default="db/migrations",
        help="Directory with .sql migration files.",
    )
    args = parser.parse_args()

    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is not set")

    migrations_dir = Path(args.migrations_dir)
    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        raise SystemExit(f"No migration files found in {migrations_dir}")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version text PRIMARY KEY,
                  applied_at timestamptz NOT NULL DEFAULT now()
                )
                """
            )

            for migration_file in migration_files:
                version = migration_file.name
                cur.execute("SELECT 1 FROM schema_migrations WHERE version = %s", (version,))
                if cur.fetchone():
                    print(f"skip {version}")
                    continue

                sql = migration_file.read_text(encoding="utf-8")
                print(f"apply {version}")
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s)",
                    (version,),
                )

    print("migrations complete")


if __name__ == "__main__":
    main()
