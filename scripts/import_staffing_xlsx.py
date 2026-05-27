from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg
from dotenv import load_dotenv


STAFF_SHEET = "position_supervisor_flags"
ARTIFACT_SHEET = "artifact_text_flat"
STAFF_LEVEL_COLUMNS = ["Уровень 1", "Уровень 2", "Уровень 3", "Уровень 4", "Уровень 5"]
ARTIFACT_PATH_COLUMNS = ["path_L1", "path_L2", "path_L3", "path_L4", "path_L5"]
FTE_QUANT = Decimal("0.01")
CHUNK_RE = re.compile(r"^text_chunk_(\d+)$")


@dataclass(frozen=True)
class OrgRecord:
    name: str
    full_path: str
    level: int
    parent_full_path: str | None


@dataclass(frozen=True)
class PositionRecord:
    org_full_path: str
    title: str
    planned_fte: Decimal
    occupied_fte: Decimal
    is_supervisor: bool


@dataclass(frozen=True)
class ArtifactRecord:
    artifact_type: str
    title: str
    source_file_path: str
    source_file_name: str
    cleaned_text: str


@dataclass(frozen=True)
class ArtifactLinkRecord:
    artifact_key: tuple[str, str]
    target_type: str
    target_key: tuple[str, str] | str
    relation_type: str
    link_confidence: Decimal
    review_status: str


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import staffing, org units, positions, artifacts, and artifact links from Excel."
    )
    parser.add_argument(
        "xlsx_path",
        nargs="?",
        default="data/staffing_with_artifact_text_links.xlsx",
        help="Path to staffing_with_artifact_text_links.xlsx.",
    )
    parser.add_argument(
        "--confidence-threshold",
        type=Decimal,
        default=Decimal("0.75"),
        help="Links below this confidence are imported as needs_review.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read and validate the workbook without writing to PostgreSQL.",
    )
    args = parser.parse_args()

    workbook = Path(args.xlsx_path)
    if not workbook.exists():
        raise SystemExit(f"Workbook not found: {workbook}")

    import_data = build_import_data(workbook, args.confidence_threshold)
    print_summary(import_data)

    if args.dry_run:
        print("dry run complete; no database changes made")
        return

    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is not set")

    with psycopg.connect(database_url) as conn:
        upsert_import_data(conn, import_data)

    print("import complete")


def build_import_data(workbook: Path, confidence_threshold: Decimal) -> dict[str, Any]:
    staff = pd.read_excel(workbook, sheet_name=STAFF_SHEET, dtype=object)
    artifacts = pd.read_excel(workbook, sheet_name=ARTIFACT_SHEET, dtype=object)

    validate_columns(
        staff,
        [
            *STAFF_LEVEL_COLUMNS,
            "org_unit_id",
            "position_id",
            "Должность",
            "Ед. по ШР",
            "Занято",
            "is_supervisor",
        ],
        STAFF_SHEET,
    )
    validate_columns(
        artifacts,
        [
            "artifact_type",
            "source_file_name",
            "source_file_path",
            "link_confidence",
            "org_unit_id",
            "position_id",
            *ARTIFACT_PATH_COLUMNS,
            "position_title",
        ],
        ARTIFACT_SHEET,
    )

    raw_staff_rows = len(staff)
    raw_artifact_rows = len(artifacts)
    staff = staff.drop_duplicates().copy()
    exact_staff_duplicates = raw_staff_rows - len(staff)

    normalize_staff(staff)
    normalize_artifact_frame(artifacts)

    org_records, excel_org_paths = build_org_records(staff, artifacts)
    position_records, excel_position_keys = build_position_records(staff)
    artifact_records, artifact_source_keys = build_artifact_records(artifacts)
    artifact_links = build_artifact_links(
        artifacts=artifacts,
        artifact_source_keys=artifact_source_keys,
        excel_org_paths=excel_org_paths,
        excel_position_keys=excel_position_keys,
        confidence_threshold=confidence_threshold,
    )

    return {
        "raw_staff_rows": raw_staff_rows,
        "raw_artifact_rows": raw_artifact_rows,
        "exact_staff_duplicates": exact_staff_duplicates,
        "org_records": org_records,
        "excel_org_paths": excel_org_paths,
        "position_records": position_records,
        "excel_position_keys": excel_position_keys,
        "artifact_records": artifact_records,
        "artifact_links": artifact_links,
        "confidence_threshold": confidence_threshold,
    }


def validate_columns(frame: pd.DataFrame, required: list[str], sheet_name: str) -> None:
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise SystemExit(f"Sheet {sheet_name} is missing columns: {', '.join(missing)}")


def normalize_staff(staff: pd.DataFrame) -> None:
    staff["org_unit_id"] = staff["org_unit_id"].map(normalize_source_id)
    staff["position_id"] = staff["position_id"].map(normalize_source_id)
    staff["Должность"] = staff["Должность"].map(normalize_required_text)
    staff["planned_fte"] = staff["Ед. по ШР"].map(to_decimal)
    staff["occupied_fte"] = staff["Занято"].map(to_decimal)
    staff["is_supervisor_bool"] = staff["is_supervisor"].map(to_bool)
    staff["staff_full_path"] = staff.apply(
        lambda row: path_from_columns(row, STAFF_LEVEL_COLUMNS),
        axis=1,
    )


def normalize_artifact_frame(artifacts: pd.DataFrame) -> None:
    artifacts["org_unit_id"] = artifacts["org_unit_id"].map(normalize_source_id)
    artifacts["position_id"] = artifacts["position_id"].map(normalize_source_id)
    artifacts["artifact_type"] = artifacts["artifact_type"].map(normalize_artifact_type)
    artifacts["source_file_name"] = artifacts["source_file_name"].map(normalize_required_text)
    artifacts["source_file_path"] = artifacts["source_file_path"].map(normalize_required_text)
    artifacts["position_title"] = artifacts["position_title"].map(normalize_optional_text)
    artifacts["artifact_full_path"] = artifacts.apply(
        lambda row: path_from_columns(row, ARTIFACT_PATH_COLUMNS),
        axis=1,
    )


def build_org_records(
    staff: pd.DataFrame,
    artifacts: pd.DataFrame,
) -> tuple[dict[str, OrgRecord], dict[str, str]]:
    records: dict[str, OrgRecord] = {}
    excel_org_paths: dict[str, str] = {}

    for _, row in staff.iterrows():
        add_org_path(records, level_parts(row, STAFF_LEVEL_COLUMNS))
        remember_mapping(excel_org_paths, row["org_unit_id"], row["staff_full_path"], "org_unit_id")

    for _, row in artifacts.iterrows():
        artifact_path = row["artifact_full_path"]
        if artifact_path:
            add_org_path(records, level_parts(row, ARTIFACT_PATH_COLUMNS))
        if has_value(row["org_unit_id"]):
            remember_mapping(excel_org_paths, row["org_unit_id"], artifact_path, "org_unit_id")

    return records, excel_org_paths


def add_org_path(records: dict[str, OrgRecord], parts: list[str]) -> None:
    parent_full_path: str | None = None
    path_parts: list[str] = []

    for level, part in enumerate(parts, start=1):
        path_parts.append(part)
        full_path = " / ".join(path_parts)
        records[full_path] = OrgRecord(
            name=part,
            full_path=full_path,
            level=level,
            parent_full_path=parent_full_path,
        )
        parent_full_path = full_path


def build_position_records(
    staff: pd.DataFrame,
) -> tuple[dict[tuple[str, str], PositionRecord], dict[str, tuple[str, str]]]:
    excel_position_keys: dict[str, tuple[str, str]] = {}

    for _, row in staff.iterrows():
        key = (row["staff_full_path"], row["Должность"])
        remember_mapping(excel_position_keys, row["position_id"], key, "position_id")

    grouped = (
        staff.groupby(["staff_full_path", "Должность"], sort=True)
        .agg(
            planned_fte=("planned_fte", sum_decimals),
            occupied_fte=("occupied_fte", sum_decimals),
            is_supervisor=("is_supervisor_bool", "max"),
        )
        .reset_index()
    )

    records: dict[tuple[str, str], PositionRecord] = {}
    for _, row in grouped.iterrows():
        key = (row["staff_full_path"], row["Должность"])
        records[key] = PositionRecord(
            org_full_path=row["staff_full_path"],
            title=row["Должность"],
            planned_fte=quantize_decimal(row["planned_fte"]),
            occupied_fte=quantize_decimal(row["occupied_fte"]),
            is_supervisor=bool(row["is_supervisor"]),
        )

    return records, excel_position_keys


def build_artifact_records(
    artifacts: pd.DataFrame,
) -> tuple[dict[tuple[str, str], ArtifactRecord], set[tuple[str, str]]]:
    chunk_columns = sorted(
        [column for column in artifacts.columns if CHUNK_RE.match(str(column))],
        key=lambda column: int(CHUNK_RE.match(str(column)).group(1)),  # type: ignore[union-attr]
    )
    if not chunk_columns:
        raise SystemExit("No text_chunk_N columns found in artifact_text_flat")

    records: dict[tuple[str, str], ArtifactRecord] = {}
    for _, row in artifacts.iterrows():
        cleaned_text = "".join(
            str(row[column])
            for column in chunk_columns
            if not is_missing(row[column])
        )
        if not cleaned_text:
            raise SystemExit(f"Artifact has empty text: {row['source_file_path']}")

        key = (row["source_file_path"], row["source_file_name"])
        records[key] = ArtifactRecord(
            artifact_type=row["artifact_type"],
            title=row["source_file_name"],
            source_file_path=row["source_file_path"],
            source_file_name=row["source_file_name"],
            cleaned_text=cleaned_text,
        )

    return records, set(records)


def build_artifact_links(
    artifacts: pd.DataFrame,
    artifact_source_keys: set[tuple[str, str]],
    excel_org_paths: dict[str, str],
    excel_position_keys: dict[str, tuple[str, str]],
    confidence_threshold: Decimal,
) -> list[ArtifactLinkRecord]:
    links: list[ArtifactLinkRecord] = []

    for _, row in artifacts.iterrows():
        artifact_key = (row["source_file_path"], row["source_file_name"])
        if artifact_key not in artifact_source_keys:
            raise SystemExit(f"Artifact source key was not imported: {artifact_key}")

        confidence = to_decimal(row["link_confidence"])
        review_status = "needs_review" if confidence < confidence_threshold else "auto_accepted"

        if has_value(row["position_id"]):
            position_key = excel_position_keys.get(row["position_id"])
            if not position_key:
                raise SystemExit(f"position_id has no matching staffing row: {row['position_id']}")
            links.append(
                ArtifactLinkRecord(
                    artifact_key=artifact_key,
                    target_type="position",
                    target_key=position_key,
                    relation_type="describes",
                    link_confidence=confidence,
                    review_status=review_status,
                )
            )
            continue

        if has_value(row["org_unit_id"]):
            org_full_path = excel_org_paths.get(row["org_unit_id"])
            if not org_full_path:
                raise SystemExit(f"org_unit_id has no matching org path: {row['org_unit_id']}")
            links.append(
                ArtifactLinkRecord(
                    artifact_key=artifact_key,
                    target_type="org_unit",
                    target_key=org_full_path,
                    relation_type="regulates",
                    link_confidence=confidence,
                    review_status=review_status,
                )
            )
            continue

        raise SystemExit(f"Artifact link has no target: {artifact_key}")

    return links


def upsert_import_data(conn: psycopg.Connection[Any], import_data: dict[str, Any]) -> None:
    org_ids = upsert_org_units(conn, import_data["org_records"])
    position_ids = upsert_positions(conn, import_data["position_records"], org_ids)
    artifact_ids = upsert_artifacts(conn, import_data["artifact_records"])
    upsert_artifact_links(
        conn=conn,
        artifact_links=import_data["artifact_links"],
        artifact_ids=artifact_ids,
        org_ids=org_ids,
        position_ids=position_ids,
    )


def upsert_org_units(
    conn: psycopg.Connection[Any],
    org_records: dict[str, OrgRecord],
) -> dict[str, Any]:
    ids: dict[str, Any] = {}
    ordered = sorted(org_records.values(), key=lambda record: (record.level, record.full_path))

    with conn.cursor() as cur:
        for record in ordered:
            parent_id = ids.get(record.parent_full_path) if record.parent_full_path else None
            cur.execute(
                """
                INSERT INTO org_units (parent_id, name, full_path, level)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (full_path) DO UPDATE SET
                  parent_id = EXCLUDED.parent_id,
                  name = EXCLUDED.name,
                  level = EXCLUDED.level,
                  updated_at = now()
                RETURNING id
                """,
                (parent_id, record.name, record.full_path, record.level),
            )
            ids[record.full_path] = cur.fetchone()[0]

    print(f"upserted org_units: {len(ids)}")
    return ids


def upsert_positions(
    conn: psycopg.Connection[Any],
    position_records: dict[tuple[str, str], PositionRecord],
    org_ids: dict[str, Any],
) -> dict[tuple[str, str], Any]:
    ids: dict[tuple[str, str], Any] = {}

    with conn.cursor() as cur:
        for key, record in sorted(position_records.items()):
            org_id = org_ids[record.org_full_path]
            cur.execute(
                """
                INSERT INTO positions (org_unit_id, title, planned_fte, occupied_fte, is_supervisor)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (org_unit_id, title) DO UPDATE SET
                  planned_fte = EXCLUDED.planned_fte,
                  occupied_fte = EXCLUDED.occupied_fte,
                  is_supervisor = EXCLUDED.is_supervisor,
                  is_active = true,
                  updated_at = now()
                RETURNING id
                """,
                (
                    org_id,
                    record.title,
                    record.planned_fte,
                    record.occupied_fte,
                    record.is_supervisor,
                ),
            )
            ids[key] = cur.fetchone()[0]

    print(f"upserted positions: {len(ids)}")
    return ids


def upsert_artifacts(
    conn: psycopg.Connection[Any],
    artifact_records: dict[tuple[str, str], ArtifactRecord],
) -> dict[tuple[str, str], Any]:
    ids: dict[tuple[str, str], Any] = {}

    with conn.cursor() as cur:
        for key, record in sorted(artifact_records.items()):
            cur.execute(
                """
                INSERT INTO artifacts (
                  artifact_type,
                  title,
                  source_file_path,
                  source_file_name,
                  cleaned_text,
                  status
                )
                VALUES (%s, %s, %s, %s, %s, 'ready')
                ON CONFLICT (source_file_path, source_file_name) DO UPDATE SET
                  artifact_type = EXCLUDED.artifact_type,
                  title = EXCLUDED.title,
                  cleaned_text = EXCLUDED.cleaned_text,
                  status = 'ready',
                  updated_at = now()
                RETURNING id
                """,
                (
                    record.artifact_type,
                    record.title,
                    record.source_file_path,
                    record.source_file_name,
                    record.cleaned_text,
                ),
            )
            ids[key] = cur.fetchone()[0]

    print(f"upserted artifacts: {len(ids)}")
    return ids


def upsert_artifact_links(
    conn: psycopg.Connection[Any],
    artifact_links: list[ArtifactLinkRecord],
    artifact_ids: dict[tuple[str, str], Any],
    org_ids: dict[str, Any],
    position_ids: dict[tuple[str, str], Any],
) -> None:
    with conn.cursor() as cur:
        for link in artifact_links:
            artifact_id = artifact_ids[link.artifact_key]
            if link.target_type == "position":
                target_id = position_ids[link.target_key]  # type: ignore[index]
            elif link.target_type == "org_unit":
                target_id = org_ids[link.target_key]  # type: ignore[index]
            else:
                raise SystemExit(f"Unsupported target_type: {link.target_type}")

            cur.execute(
                """
                INSERT INTO artifact_links (
                  artifact_id,
                  target_type,
                  target_id,
                  relation_type,
                  link_confidence,
                  review_status
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (artifact_id, target_type, target_id, relation_type) DO UPDATE SET
                  link_confidence = EXCLUDED.link_confidence,
                  review_status = EXCLUDED.review_status,
                  updated_at = now()
                """,
                (
                    artifact_id,
                    link.target_type,
                    target_id,
                    link.relation_type,
                    link.link_confidence,
                    link.review_status,
                ),
            )

    print(f"upserted artifact_links: {len(artifact_links)}")


def print_summary(import_data: dict[str, Any]) -> None:
    artifact_links = import_data["artifact_links"]
    low_confidence = sum(1 for link in artifact_links if link.review_status == "needs_review")
    position_links = sum(1 for link in artifact_links if link.target_type == "position")
    org_links = sum(1 for link in artifact_links if link.target_type == "org_unit")

    print("import summary")
    print(f"  raw staffing rows: {import_data['raw_staff_rows']}")
    print(f"  exact staffing duplicates removed: {import_data['exact_staff_duplicates']}")
    print(f"  raw artifact/link rows: {import_data['raw_artifact_rows']}")
    print(f"  org_units to upsert: {len(import_data['org_records'])}")
    print(f"  positions to upsert: {len(import_data['position_records'])}")
    print(f"  artifacts to upsert: {len(import_data['artifact_records'])}")
    print(f"  artifact_links to upsert: {len(artifact_links)}")
    print(f"  position artifact links: {position_links}")
    print(f"  org_unit artifact links: {org_links}")
    print(f"  links needing review: {low_confidence}")
    print(f"  confidence threshold: {import_data['confidence_threshold']}")


def remember_mapping(mapping: dict[Any, Any], source_id: Any, target: Any, label: str) -> None:
    if not has_value(source_id):
        return
    existing = mapping.get(source_id)
    if existing is not None and existing != target:
        raise SystemExit(f"{label} maps to multiple targets: {source_id}")
    mapping[source_id] = target


def path_from_columns(row: pd.Series, columns: list[str]) -> str:
    parts = level_parts(row, columns)
    if not parts:
        raise SystemExit(f"Row has empty org path in columns: {columns}")
    return " / ".join(parts)


def level_parts(row: pd.Series, columns: list[str]) -> list[str]:
    return [
        str(row[column]).strip()
        for column in columns
        if column in row and not is_missing(row[column]) and str(row[column]).strip()
    ]


def sum_decimals(values: pd.Series) -> Decimal:
    total = Decimal("0")
    for value in values:
        total += value
    return total


def normalize_source_id(value: Any) -> str | None:
    if is_missing(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    if text.lower() in {"", "nan", "none", "null"}:
        return None
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def normalize_required_text(value: Any) -> str:
    text = normalize_optional_text(value)
    if text is None:
        raise SystemExit("Required text value is empty")
    return text


def normalize_optional_text(value: Any) -> str | None:
    if is_missing(value):
        return None
    text = str(value).strip()
    if text.lower() in {"", "nan", "none", "null"}:
        return None
    return text or None


def normalize_artifact_type(value: Any) -> str:
    text = normalize_required_text(value)
    if text == "department_regulation":
        return "org_unit_regulation"
    return text


def to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = normalize_required_text(value).upper()
    if text == "TRUE":
        return True
    if text == "FALSE":
        return False
    raise SystemExit(f"Invalid boolean value: {value}")


def to_decimal(value: Any) -> Decimal:
    if is_missing(value):
        return Decimal("0.00")
    try:
        return quantize_decimal(Decimal(str(value).strip()))
    except (InvalidOperation, AttributeError) as error:
        raise SystemExit(f"Invalid decimal value: {value}") from error


def quantize_decimal(value: Decimal) -> Decimal:
    return value.quantize(FTE_QUANT, rounding=ROUND_HALF_UP)


def is_missing(value: Any) -> bool:
    return pd.isna(value)


def has_value(value: Any) -> bool:
    if is_missing(value):
        return False
    if isinstance(value, str) and value.strip().lower() in {"", "nan", "none", "null"}:
        return False
    return True


if __name__ == "__main__":
    main()
