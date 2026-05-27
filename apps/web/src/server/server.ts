import type { DraftPayload } from "../types/questionnaire";

type StoredDraft = DraftPayload & {
  status: "draft" | "submitted";
  createdAt: string;
  submittedAt?: string;
};

const drafts = new Map<string, StoredDraft>();
const port = Number(Bun.env.PORT ?? 3001);

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

    const draftMatch = url.pathname.match(/^\/api\/profile-drafts\/([^/]+)$/);
    if (draftMatch) {
      const profileId = draftMatch[1];

      if (request.method === "GET") {
        const draft = drafts.get(profileId);
        return draft ? jsonResponse(draft) : jsonResponse({ error: "Draft not found" }, 404);
      }

      if (request.method === "PUT") {
        const body = await parseJson<DraftPayload>(request);
        if (!body?.profileId || body.profileId !== profileId) {
          return jsonResponse({ error: "Invalid draft payload" }, 400);
        }

        const existing = drafts.get(profileId);
        const now = new Date().toISOString();
        const stored: StoredDraft = {
          ...body,
          status: existing?.status ?? "draft",
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };

        drafts.set(profileId, stored);
        return jsonResponse(stored);
      }
    }

    const submitMatch = url.pathname.match(/^\/api\/profile-drafts\/([^/]+)\/submit$/);
    if (submitMatch && request.method === "POST") {
      const profileId = submitMatch[1];
      const body = await parseJson<Pick<DraftPayload, "answers" | "currentQuestionId">>(request);
      if (!body?.answers || !body.currentQuestionId) {
        return jsonResponse({ error: "Invalid submit payload" }, 400);
      }

      const now = new Date().toISOString();
      const existing = drafts.get(profileId);
      const stored: StoredDraft = {
        profileId,
        answers: body.answers,
        currentQuestionId: body.currentQuestionId,
        status: "submitted",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        submittedAt: now
      };

      drafts.set(profileId, stored);
      return jsonResponse(stored);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
});

console.log(`Profiling web API listening on http://${server.hostname}:${server.port}`);

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
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
