import type { DraftPayload } from "../types/questionnaire";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  draftAnswerPayloadSchema,
  getIncompleteRequiredQuestionIds,
  submittedAnswerPayloadSchema,
  submitAnswerRequestSchema
} from "../schemas/answerPayload";

type StoredDraft = DraftPayload & {
  status: "draft" | "submitted";
  createdAt: string;
  submittedAt?: string;
};

type InvitationRecord = {
  id: string;
  status: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  position: ReturnType<typeof mapPositionRow>;
};

const drafts = new Map<string, StoredDraft>();
const port = Number(Bun.env.PORT ?? 3001);
const databaseUrl = getEnv("DATABASE_URL");
const webMvpAssignmentId = normalizeUuidParam(getEnv("WEB_MVP_ASSIGNMENT_ID") ?? null);
let sqlClient: Bun.SQL | null | undefined;

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return emptyResponse(204);
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        service: "ai-profiling-web-api"
      });
    }

    if (request.method === "GET" && url.pathname === "/api/directory/org-units") {
      return withDatabase(async (sql) => {
        const query = normalizeSearchParam(url.searchParams.get("query"));
        if (!query) {
          return jsonResponse([]);
        }

        const normalizedQuery = normalizeDirectoryQuery(query);
        const pattern = `%${query}%`;
        const normalizedPattern = `%${normalizedQuery}%`;
        const prefix = `${query}%`;
        const normalizedPrefix = `${normalizedQuery}%`;
        const rows = await sql`
          WITH search AS (
            SELECT
              plainto_tsquery('russian', ${query}) AS text_query,
              plainto_tsquery('russian', ${normalizedQuery}) AS normalized_text_query
          )
          SELECT
            id::text AS id,
            name,
            full_path AS "fullPath",
            level
          FROM org_units, search
          WHERE name ILIKE ${pattern}
             OR full_path ILIKE ${pattern}
             OR name ILIKE ${normalizedPattern}
             OR full_path ILIKE ${normalizedPattern}
             OR to_tsvector('russian', name || ' ' || full_path) @@ search.text_query
             OR to_tsvector('russian', name || ' ' || full_path) @@ search.normalized_text_query
          ORDER BY
            CASE
              WHEN name ILIKE ${prefix} THEN 0
              WHEN name ILIKE ${normalizedPrefix} THEN 0
              WHEN full_path ILIKE ${prefix} THEN 1
              WHEN full_path ILIKE ${normalizedPrefix} THEN 1
              WHEN to_tsvector('russian', name || ' ' || full_path) @@ search.text_query THEN 2
              WHEN to_tsvector('russian', name || ' ' || full_path) @@ search.normalized_text_query THEN 2
              ELSE 2
            END,
            full_path
          LIMIT 20
        `;

        return jsonResponse(rows);
      });
    }

    if (request.method === "GET" && url.pathname === "/api/directory/positions") {
      return withDatabase(async (sql) => {
        const query = normalizeSearchParam(url.searchParams.get("query"));
        const orgUnitId = normalizeUuidParam(url.searchParams.get("orgUnitId"));
        if (!query) {
          return jsonResponse([]);
        }

        const normalizedQuery = normalizeDirectoryQuery(query);
        const pattern = `%${query}%`;
        const normalizedPattern = `%${normalizedQuery}%`;
        const prefix = `${query}%`;
        const normalizedPrefix = `${normalizedQuery}%`;
        const rows = orgUnitId
          ? await sql`
              WITH RECURSIVE selected_units AS (
                SELECT id
                FROM org_units
                WHERE id = ${orgUnitId}::uuid
                UNION ALL
                SELECT child.id
                FROM org_units child
                JOIN selected_units ON child.parent_id = selected_units.id
              ),
              search AS (
                SELECT
                  plainto_tsquery('russian', ${query}) AS text_query,
                  plainto_tsquery('russian', ${normalizedQuery}) AS normalized_text_query
              )
              SELECT
                p.id::text AS id,
                p.title,
                p.is_supervisor AS "isSupervisor",
                p.planned_fte::float8 AS "plannedFte",
                p.occupied_fte::float8 AS "occupiedFte",
                ou.id::text AS "orgUnitId",
                ou.name AS "orgUnitName",
                ou.full_path AS "orgUnitFullPath",
                ou.level AS "orgUnitLevel"
              FROM positions p
              JOIN org_units ou ON ou.id = p.org_unit_id
              CROSS JOIN search
              WHERE p.is_active
                AND (
                  (
                    p.org_unit_id IN (SELECT id FROM selected_units)
                    AND (
                      p.title ILIKE ${pattern}
                      OR ou.full_path ILIKE ${pattern}
                      OR p.title ILIKE ${normalizedPattern}
                      OR ou.full_path ILIKE ${normalizedPattern}
                      OR to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.text_query
                      OR to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.normalized_text_query
                    )
                  )
                  OR ou.full_path ILIKE ${pattern}
                  OR ou.full_path ILIKE ${normalizedPattern}
                  OR to_tsvector('russian', ou.full_path) @@ search.text_query
                  OR to_tsvector('russian', ou.full_path) @@ search.normalized_text_query
                )
              ORDER BY
                CASE
                  WHEN p.title ILIKE ${prefix} THEN 0
                  WHEN p.title ILIKE ${normalizedPrefix} THEN 0
                  WHEN ou.full_path ILIKE ${prefix} THEN 1
                  WHEN ou.full_path ILIKE ${normalizedPrefix} THEN 1
                  WHEN to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.text_query THEN 2
                  WHEN to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.normalized_text_query THEN 2
                  ELSE 2
                END,
                p.title,
                ou.full_path
              LIMIT 20
            `
          : await sql`
              WITH search AS (
                SELECT
                  plainto_tsquery('russian', ${query}) AS text_query,
                  plainto_tsquery('russian', ${normalizedQuery}) AS normalized_text_query
              )
              SELECT
                p.id::text AS id,
                p.title,
                p.is_supervisor AS "isSupervisor",
                p.planned_fte::float8 AS "plannedFte",
                p.occupied_fte::float8 AS "occupiedFte",
                ou.id::text AS "orgUnitId",
                ou.name AS "orgUnitName",
                ou.full_path AS "orgUnitFullPath",
                ou.level AS "orgUnitLevel"
              FROM positions p
              JOIN org_units ou ON ou.id = p.org_unit_id
              CROSS JOIN search
              WHERE p.is_active
                AND (
                  p.title ILIKE ${pattern}
                  OR ou.full_path ILIKE ${pattern}
                  OR p.title ILIKE ${normalizedPattern}
                  OR ou.full_path ILIKE ${normalizedPattern}
                  OR to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.text_query
                  OR to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.normalized_text_query
                )
              ORDER BY
                CASE
                  WHEN p.title ILIKE ${prefix} THEN 0
                  WHEN p.title ILIKE ${normalizedPrefix} THEN 0
                  WHEN ou.full_path ILIKE ${prefix} THEN 1
                  WHEN ou.full_path ILIKE ${normalizedPrefix} THEN 1
                  WHEN to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.text_query THEN 2
                  WHEN to_tsvector('russian', p.title || ' ' || ou.full_path) @@ search.normalized_text_query THEN 2
                  ELSE 2
                END,
                p.title,
                ou.full_path
              LIMIT 20
            `;

        return jsonResponse(rows.map(mapPositionRow));
      });
    }

    const positionContextMatch = url.pathname.match(
      /^\/api\/directory\/positions\/([^/]+)\/context$/
    );
    if (request.method === "GET" && positionContextMatch) {
      return withDatabase(async (sql) => {
        const positionId = normalizeUuidParam(positionContextMatch[1]);
        if (!positionId) {
          return jsonResponse({ error: "Invalid position id" }, 400);
        }

        const positionRows = await sql`
          SELECT
            p.id::text AS id,
            p.title,
            p.is_supervisor AS "isSupervisor",
            p.planned_fte::float8 AS "plannedFte",
            p.occupied_fte::float8 AS "occupiedFte",
            ou.id::text AS "orgUnitId",
            ou.name AS "orgUnitName",
            ou.full_path AS "orgUnitFullPath",
            ou.level AS "orgUnitLevel"
          FROM positions p
          JOIN org_units ou ON ou.id = p.org_unit_id
          WHERE p.id = ${positionId}::uuid
            AND p.is_active
          LIMIT 1
        `;

        if (positionRows.length === 0) {
          return jsonResponse({ error: "Position not found" }, 404);
        }

        const position = mapPositionRow(positionRows[0]);

        const managerRows = await sql`
          WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, full_path, 0 AS depth
            FROM org_units
            WHERE id = ${position.orgUnit.id}::uuid
            UNION ALL
            SELECT parent.id, parent.parent_id, parent.full_path, ancestors.depth + 1
            FROM org_units parent
            JOIN ancestors ON ancestors.parent_id = parent.id
          )
          SELECT
            p.id::text AS id,
            p.title,
            p.is_supervisor AS "isSupervisor",
            p.planned_fte::float8 AS "plannedFte",
            p.occupied_fte::float8 AS "occupiedFte",
            ou.id::text AS "orgUnitId",
            ou.name AS "orgUnitName",
            ou.full_path AS "orgUnitFullPath",
            ou.level AS "orgUnitLevel"
          FROM ancestors
          JOIN positions p ON p.org_unit_id = ancestors.id
          JOIN org_units ou ON ou.id = p.org_unit_id
          WHERE p.is_active
            AND p.is_supervisor
            AND p.id <> ${position.id}::uuid
          ORDER BY ancestors.depth, p.title
          LIMIT 1
        `;

        const directReports = position.isSupervisor
          ? await sql`
              WITH child_units AS (
                SELECT id
                FROM org_units
                WHERE parent_id = ${position.orgUnit.id}::uuid
              )
              SELECT
                p.id::text AS "positionId",
                p.title,
                p.is_supervisor AS "isSupervisor",
                p.occupied_fte::float8 AS "occupiedFte",
                CEIL(GREATEST(p.occupied_fte, 0))::int AS count,
                ou.id::text AS "orgUnitId",
                ou.name AS "orgUnitName",
                ou.full_path AS "orgUnitFullPath",
                ou.level AS "orgUnitLevel"
              FROM positions p
              JOIN org_units ou ON ou.id = p.org_unit_id
              WHERE p.is_active
                AND p.occupied_fte > 0
                AND (
                  (p.org_unit_id = ${position.orgUnit.id}::uuid AND p.id <> ${position.id}::uuid)
                  OR (p.org_unit_id IN (SELECT id FROM child_units) AND p.is_supervisor)
                )
              ORDER BY ou.full_path, p.is_supervisor DESC, p.title
              LIMIT 50
            `
          : [];

        const totalRows = position.isSupervisor
          ? await sql`
              WITH RECURSIVE descendants AS (
                SELECT id
                FROM org_units
                WHERE id = ${position.orgUnit.id}::uuid
                UNION ALL
                SELECT child.id
                FROM org_units child
                JOIN descendants ON child.parent_id = descendants.id
              )
              SELECT
                COALESCE(
                  SUM(
                    CEIL(GREATEST(p.occupied_fte, 0))
                  ),
                  0
                )::int AS total,
                COALESCE(
                  SUM(
                    GREATEST(p.occupied_fte, 0)
                  ),
                  0
                )::float8 AS "totalOccupiedFte"
              FROM positions p
              WHERE p.is_active
                AND p.occupied_fte > 0
                AND p.org_unit_id IN (SELECT id FROM descendants)
                AND p.id <> ${position.id}::uuid
            `
          : [{ total: 0 }];

        return jsonResponse({
          position,
          adminManager: managerRows[0] ? mapPositionRow(managerRows[0]) : null,
          directReports: directReports.map(mapReportRow),
          totalSubordinateCount: Number(totalRows[0]?.total ?? 0),
          totalSubordinateOccupiedFte: Number(totalRows[0]?.totalOccupiedFte ?? 0)
        });
      });
    }

    const invitationMatch = url.pathname.match(/^\/api\/invitations\/([^/]+)$/);
    if (invitationMatch && request.method === "GET") {
      return withDatabase(async (sql) => {
        const invitation = await findInvitationByRawToken(sql, invitationMatch[1]);
        if (!invitation) {
          return jsonResponse({ error: "Invitation link not found" }, 404);
        }

        const availabilityIssue = getInvitationAvailabilityIssue(invitation);
        if (availabilityIssue) {
          return jsonResponse({ error: availabilityIssue }, 410);
        }

        return jsonResponse({
          id: invitation.id,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          position: invitation.position
        });
      });
    }

    const invitationStartMatch = url.pathname.match(/^\/api\/invitations\/([^/]+)\/start$/);
    if (invitationStartMatch && request.method === "POST") {
      return withDatabase(async (sql) => {
        const invitation = await findInvitationByRawToken(sql, invitationStartMatch[1]);
        if (!invitation) {
          return jsonResponse({ error: "Invitation link not found" }, 404);
        }

        const availabilityIssue = getInvitationAvailabilityIssue(invitation);
        if (availabilityIssue) {
          return jsonResponse({ error: availabilityIssue }, 410);
        }

        const body = await parseJson<{ email?: string; fullName?: string }>(request);
        const email = normalizeEmail(body?.email);
        const fullName = normalizePersonName(body?.fullName);
        if (!email || !fullName) {
          return jsonResponse({ error: "Email and full name are required" }, 400);
        }

        const result = await startInterviewFromInvitation(sql, invitation, email, fullName);
        return jsonResponse(result);
      });
    }

    const draftMatch = url.pathname.match(/^\/api\/profile-drafts\/([^/]+)$/);
    if (draftMatch) {
      const profileId = draftMatch[1];

      if (request.method === "GET") {
        const databaseDraft = await getDatabaseDraft(profileId);
        if (databaseDraft.response) {
          return databaseDraft.response;
        }

        const draft = databaseDraft.draft ?? drafts.get(profileId);
        return draft ? jsonResponse(draft) : jsonResponse({ error: "Draft not found" }, 404);
      }

      if (request.method === "PUT") {
        const requestBody = await parseJson<unknown>(request);
        const parsedBody = draftAnswerPayloadSchema.safeParse(requestBody);
        if (!parsedBody.success || parsedBody.data.profileId !== profileId) {
          return jsonResponse(
            {
              error: "Invalid draft payload",
              issues: parsedBody.success ? ["Profile id does not match URL"] : formatZodIssues(parsedBody.error)
            },
            400
          );
        }

        const body = parsedBody.data as DraftPayload;
        const now = new Date().toISOString();
        const stored: StoredDraft = {
          ...body,
          status: "draft",
          createdAt: now,
          updatedAt: now
        };

        const databaseDraft = await saveDatabaseDraft(stored);
        if (databaseDraft.response) {
          return databaseDraft.response;
        }

        const existing = drafts.get(profileId);
        stored.createdAt = existing?.createdAt ?? now;
        drafts.set(profileId, stored);
        return jsonResponse(stored);
      }
    }

    const submitMatch = url.pathname.match(/^\/api\/profile-drafts\/([^/]+)\/submit$/);
    if (submitMatch && request.method === "POST") {
      const profileId = submitMatch[1];
      const requestBody = await parseJson<unknown>(request);
      const parsedBody = submitAnswerRequestSchema.safeParse(requestBody);
      if (!parsedBody.success) {
        return jsonResponse(
          {
            error: "Invalid submit payload",
            issues: formatZodIssues(parsedBody.error)
          },
          400
        );
      }

      const now = new Date().toISOString();
      const submittedPayload = submittedAnswerPayloadSchema.safeParse({
        profileId,
        answers: parsedBody.data.answers,
        currentQuestionId: parsedBody.data.currentQuestionId,
        updatedAt: now,
        submittedAt: now
      });

      if (!submittedPayload.success) {
        return jsonResponse(
          {
            error: "Invalid submit payload",
            issues: formatZodIssues(submittedPayload.error)
          },
          400
        );
      }

      const incompleteQuestionIds = getIncompleteRequiredQuestionIds(submittedPayload.data.answers);
      if (incompleteQuestionIds.length > 0) {
        return jsonResponse(
          {
            error: "Submitted payload is incomplete",
            incompleteQuestionIds
          },
          422
        );
      }

      const stored: StoredDraft = {
        ...submittedPayload.data,
        status: "submitted",
        createdAt: now,
        updatedAt: now
      };

      const databaseDraft = await submitDatabaseDraft(stored);
      if (databaseDraft.response) {
        return databaseDraft.response;
      }

      const existing = drafts.get(profileId);
      stored.createdAt = existing?.createdAt ?? now;
      drafts.set(profileId, stored);
      return jsonResponse(stored);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
});

console.log(`Profiling web API listening on http://${server.hostname}:${server.port}`);

function getEnv(name: string): string | undefined {
  if (Bun.env[name]) {
    return Bun.env[name];
  }

  for (const envPath of findEnvFiles()) {
    const value = readEnvValue(envPath, name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function findEnvFiles(): string[] {
  const files: string[] = [];
  let current = process.cwd();

  for (let index = 0; index < 5; index += 1) {
    const candidate = resolve(current, ".env");
    if (existsSync(candidate)) {
      files.push(candidate);
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return files;
}

function readEnvValue(path: string, name: string): string | undefined {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  const prefix = `${name}=`;
  const line = lines.find((item) => item.trim().startsWith(prefix));

  if (!line) {
    return undefined;
  }

  return line.slice(prefix.length).trim().replace(/^["']|["']$/g, "");
}

function getSqlClient(): Bun.SQL | null {
  if (!databaseUrl) {
    return null;
  }

  if (sqlClient === undefined) {
    sqlClient = new Bun.SQL(databaseUrl);
  }

  return sqlClient;
}

async function withDatabase(callback: (sql: Bun.SQL) => Promise<Response>) {
  const sql = getSqlClient();
  if (!sql) {
    return jsonResponse({ error: "DATABASE_URL is not configured" }, 503);
  }

  try {
    return await callback(sql);
  } catch (error) {
    console.error("Database request failed", error);
    return jsonResponse({ error: "Database request failed" }, 503);
  }
}

async function findInvitationByRawToken(
  sql: Bun.SQL,
  rawToken: string
): Promise<InvitationRecord | null> {
  const tokenHash = hashToken(rawToken);
  const rows = await sql`
    SELECT
      il.id::text AS id,
      il.status,
      il.max_uses AS "maxUses",
      il.used_count AS "usedCount",
      il.expires_at AS "expiresAt",
      p.id::text AS "positionId",
      p.title,
      p.is_supervisor AS "isSupervisor",
      p.planned_fte::float8 AS "plannedFte",
      p.occupied_fte::float8 AS "occupiedFte",
      ou.id::text AS "orgUnitId",
      ou.name AS "orgUnitName",
      ou.full_path AS "orgUnitFullPath",
      ou.level AS "orgUnitLevel"
    FROM invitation_links il
    JOIN positions p ON p.id = il.position_id
    JOIN org_units ou ON ou.id = p.org_unit_id
    WHERE il.token_hash = ${tokenHash}
    LIMIT 1
  `;

  if (!rows[0]) {
    return null;
  }

  const row = rows[0];
  return {
    id: String(row.id),
    status: String(row.status),
    maxUses: row.maxUses === null || row.maxUses === undefined ? null : Number(row.maxUses),
    usedCount: Number(row.usedCount ?? 0),
    expiresAt: toIsoString(row.expiresAt) ?? null,
    position: mapPositionRow({
      id: row.positionId,
      title: row.title,
      isSupervisor: row.isSupervisor,
      plannedFte: row.plannedFte,
      occupiedFte: row.occupiedFte,
      orgUnitId: row.orgUnitId,
      orgUnitName: row.orgUnitName,
      orgUnitFullPath: row.orgUnitFullPath,
      orgUnitLevel: row.orgUnitLevel
    })
  };
}

function getInvitationAvailabilityIssue(invitation: InvitationRecord): string | null {
  if (invitation.status !== "active") {
    return "Invitation link is not active";
  }

  if (invitation.expiresAt && Date.parse(invitation.expiresAt) < Date.now()) {
    return "Invitation link has expired";
  }

  if (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses) {
    return "Invitation link has reached the maximum number of uses";
  }

  return null;
}

async function startInterviewFromInvitation(
  sql: Bun.SQL,
  invitation: InvitationRecord,
  email: string,
  fullName: string
) {
  const userRows = await sql`
    INSERT INTO users (email, full_name, role, is_active, updated_at)
    VALUES (${email}, ${fullName}, 'employee', true, now())
    ON CONFLICT (email)
    DO UPDATE SET
      full_name = EXCLUDED.full_name,
      is_active = true,
      updated_at = now()
    RETURNING id::text AS id, email, full_name AS "fullName", role
  `;
  const user = userRows[0];

  const existingAssignmentRows = await sql`
    SELECT id::text AS id
    FROM assignments
    WHERE user_id = ${user.id}::uuid
      AND position_id = ${invitation.position.id}::uuid
      AND is_active
    LIMIT 1
  `;

  const assignmentId =
    existingAssignmentRows[0]?.id ??
    (
      await sql`
        INSERT INTO assignments (user_id, position_id, rate, is_active, updated_at)
        VALUES (${user.id}::uuid, ${invitation.position.id}::uuid, NULL, true, now())
        RETURNING id::text AS id
      `
    )[0].id;

  const existingRunRows = await sql`
    SELECT
      id::text AS id,
      status,
      answers_json AS "answersJson",
      started_at AS "startedAt",
      last_saved_at AS "lastSavedAt",
      submitted_at AS "submittedAt",
      created_at AS "createdAt"
    FROM interview_runs
    WHERE assignment_id = ${assignmentId}::uuid
    ORDER BY
      CASE WHEN status = 'in_progress' THEN 0 WHEN status = 'not_started' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT 1
  `;

  const existingRun = existingRunRows[0];
  const now = new Date().toISOString();
  const draft =
    existingRun && existingRun.status !== "submitted"
      ? mapInterviewRunDraft(existingRun)
      : createInitialInterviewDraft(randomUUID(), now);

  if (!existingRun || existingRun.status === "submitted") {
    await sql`
      INSERT INTO interview_runs (
        id,
        assignment_id,
        status,
        answers_json,
        started_at,
        last_saved_at,
        created_at,
        updated_at
      )
      VALUES (
        ${draft.profileId}::uuid,
        ${assignmentId}::uuid,
        'in_progress',
        ${JSON.stringify(toAnswerPayloadJson(draft))}::jsonb,
        ${now}::timestamptz,
        ${now}::timestamptz,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
    `;

    await sql`
      UPDATE invitation_links
      SET used_count = used_count + 1
      WHERE id = ${invitation.id}::uuid
    `;
  }

  return {
    user,
    assignmentId,
    profileId: draft.profileId,
    draft,
    position: invitation.position
  };
}

async function getDatabaseDraft(profileId: string): Promise<{
  draft?: StoredDraft;
  response?: Response;
}> {
  const sql = getSqlClient();
  if (!sql) {
    return {};
  }

  try {
    const profileIdFilter = normalizeUuidParam(profileId);
    const rows = await sql`
      SELECT
        status,
        answers_json AS "answersJson",
        started_at AS "startedAt",
        last_saved_at AS "lastSavedAt",
        submitted_at AS "submittedAt",
        created_at AS "createdAt"
      FROM interview_runs
      WHERE
        ${profileIdFilter}::uuid IS NOT NULL
        AND id = ${profileIdFilter}::uuid
        OR (
          ${webMvpAssignmentId}::uuid IS NOT NULL
          AND assignment_id = ${webMvpAssignmentId}::uuid
          AND answers_json->>'profileId' = ${profileId}
        )
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return {
      draft: rows[0] ? mapInterviewRunDraft(rows[0]) : undefined
    };
  } catch (error) {
    console.error("Database draft load failed", error);
    return {
      response: jsonResponse({ error: "Database draft load failed" }, 503)
    };
  }
}

async function saveDatabaseDraft(stored: StoredDraft): Promise<{ response?: Response }> {
  const sql = getSqlClient();
  if (!sql) {
    return {};
  }

  try {
    const profileIdFilter = normalizeUuidParam(stored.profileId);
    const existingRows = await sql`
      SELECT id::text AS id, status, created_at AS "createdAt"
      FROM interview_runs
      WHERE
        ${profileIdFilter}::uuid IS NOT NULL
        AND id = ${profileIdFilter}::uuid
        OR (
          ${webMvpAssignmentId}::uuid IS NOT NULL
          AND assignment_id = ${webMvpAssignmentId}::uuid
          AND answers_json->>'profileId' = ${stored.profileId}
        )
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const existing = existingRows[0];
    if (existing?.status === "submitted") {
      return {
        response: jsonResponse({ error: "Submitted interview cannot be edited" }, 409)
      };
    }

    const payload = toAnswerPayloadJson(stored);
    const now = stored.updatedAt;

    if (existing) {
      stored.createdAt = toIsoString(existing.createdAt) ?? stored.createdAt;
      await sql`
        UPDATE interview_runs
        SET
          status = 'in_progress',
          answers_json = ${JSON.stringify(payload)}::jsonb,
          started_at = COALESCE(started_at, ${now}::timestamptz),
          last_saved_at = ${now}::timestamptz,
          updated_at = ${now}::timestamptz
        WHERE id = ${existing.id}::uuid
      `;
    } else if (webMvpAssignmentId) {
      await sql`
        INSERT INTO interview_runs (
          assignment_id,
          status,
          answers_json,
          started_at,
          last_saved_at,
          created_at,
          updated_at
        )
        VALUES (
          ${webMvpAssignmentId}::uuid,
          'in_progress',
          ${JSON.stringify(payload)}::jsonb,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
      `;
    } else {
      return {};
    }

    return {
      response: jsonResponse(stored)
    };
  } catch (error) {
    console.error("Database draft save failed", error);
    return {
      response: jsonResponse({ error: "Database draft save failed" }, 503)
    };
  }
}

async function submitDatabaseDraft(stored: StoredDraft): Promise<{ response?: Response }> {
  const sql = getSqlClient();
  if (!sql) {
    return {};
  }

  try {
    const profileIdFilter = normalizeUuidParam(stored.profileId);
    const existingRows = await sql`
      SELECT id::text AS id, created_at AS "createdAt"
      FROM interview_runs
      WHERE
        ${profileIdFilter}::uuid IS NOT NULL
        AND id = ${profileIdFilter}::uuid
        OR (
          ${webMvpAssignmentId}::uuid IS NOT NULL
          AND assignment_id = ${webMvpAssignmentId}::uuid
          AND answers_json->>'profileId' = ${stored.profileId}
        )
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const existing = existingRows[0];
    const payload = toAnswerPayloadJson(stored);
    const now = stored.updatedAt;
    stored.createdAt = toIsoString(existing?.createdAt) ?? stored.createdAt;

    if (existing) {
      await sql`
        UPDATE interview_runs
        SET
          status = 'submitted',
          answers_json = ${JSON.stringify(payload)}::jsonb,
          started_at = COALESCE(started_at, ${now}::timestamptz),
          last_saved_at = ${now}::timestamptz,
          submitted_at = ${stored.submittedAt}::timestamptz,
          updated_at = ${now}::timestamptz
        WHERE id = ${existing.id}::uuid
      `;
    } else if (webMvpAssignmentId) {
      await sql`
        INSERT INTO interview_runs (
          assignment_id,
          status,
          answers_json,
          started_at,
          last_saved_at,
          submitted_at,
          created_at,
          updated_at
        )
        VALUES (
          ${webMvpAssignmentId}::uuid,
          'submitted',
          ${JSON.stringify(payload)}::jsonb,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${stored.submittedAt}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
      `;
    } else {
      return {};
    }

    return {
      response: jsonResponse(stored)
    };
  } catch (error) {
    console.error("Database draft submit failed", error);
    return {
      response: jsonResponse({ error: "Database draft submit failed" }, 503)
    };
  }
}

function normalizeSearchParam(value: string | null): string {
  return value?.trim().slice(0, 120) ?? "";
}

function normalizeDirectoryQuery(value: string): string {
  const ordinalWords: Record<string, string> = {
    первая: "1",
    первой: "1",
    первого: "1",
    первую: "1",
    первым: "1",
    первом: "1",
    первый: "1",
    "1-й": "1",
    вторая: "2",
    второй: "2",
    второго: "2",
    вторую: "2",
    вторым: "2",
    втором: "2",
    "2-й": "2",
    третья: "3",
    третий: "3",
    третьей: "3",
    третьего: "3",
    третью: "3",
    третьим: "3",
    третьем: "3",
    "3-й": "3",
    четвертая: "4",
    четвертой: "4",
    четвертого: "4",
    четвертую: "4",
    четвертым: "4",
    четвертом: "4",
    четвертый: "4",
    "4-й": "4",
    пятая: "5",
    пятой: "5",
    пятого: "5",
    пятую: "5",
    пятым: "5",
    пятом: "5",
    пятый: "5",
    "5-й": "5"
  };

  return value
    .split(/(\s+)/u)
    .map((part) => {
      const key = part.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}-]/gu, "");
      return ordinalWords[key] ?? part;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUuidParam(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : null;
}

function mapPositionRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    isSupervisor: Boolean(row.isSupervisor),
    plannedFte: Number(row.plannedFte ?? 0),
    occupiedFte: Number(row.occupiedFte ?? 0),
    orgUnit: {
      id: String(row.orgUnitId),
      name: String(row.orgUnitName),
      fullPath: String(row.orgUnitFullPath),
      level: Number(row.orgUnitLevel ?? 1)
    }
  };
}

function mapReportRow(row: Record<string, unknown>) {
  return {
    positionId: String(row.positionId),
    title: String(row.title),
    count: Number(row.count ?? 0),
    occupiedFte: Number(row.occupiedFte ?? 0),
    orgUnit: {
      id: String(row.orgUnitId),
      name: String(row.orgUnitName),
      fullPath: String(row.orgUnitFullPath),
      level: Number(row.orgUnitLevel ?? 1)
    }
  };
}

function mapInterviewRunDraft(row: Record<string, unknown>): StoredDraft {
  const payload = parseAnswersJson(row.answersJson);
  const updatedAt =
    toIsoString(row.lastSavedAt) ??
    toIsoString(row.submittedAt) ??
    toIsoString(row.createdAt) ??
    new Date().toISOString();
  const submittedAt = payload.submittedAt ?? toIsoString(row.submittedAt);

  return {
    ...payload,
    updatedAt,
    submittedAt: submittedAt ?? undefined,
    status: row.status === "submitted" ? "submitted" : "draft",
    createdAt: toIsoString(row.createdAt) ?? updatedAt
  };
}

function parseAnswersJson(value: unknown): DraftPayload {
  if (typeof value === "string") {
    return JSON.parse(value) as DraftPayload;
  }

  return value as DraftPayload;
}

function toAnswerPayloadJson(stored: StoredDraft): DraftPayload {
  return {
    profileId: stored.profileId,
    answers: stored.answers,
    currentQuestionId: stored.currentQuestionId,
    updatedAt: stored.updatedAt,
    submittedAt: stored.submittedAt
  };
}

function createInitialInterviewDraft(profileId: string, now: string): StoredDraft {
  return {
    profileId,
    answers: {
      section_1_completion_date: now.slice(0, 10)
    },
    currentQuestionId: "section_1_position_title",
    updatedAt: now,
    status: "draft",
    createdAt: now
  };
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf-8").digest("hex");
}

function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("ru-RU") ?? "";
}

function normalizePersonName(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function toIsoString(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function formatZodIssues(error: { issues: Array<{ path: Array<PropertyKey>; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
    return `${path}: ${issue.message}`;
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
