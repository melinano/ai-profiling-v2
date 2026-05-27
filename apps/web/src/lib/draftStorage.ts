import type { AnswersState, DraftPayload } from "../types/questionnaire";

const profileIdKey = "ai-profiling.profile-id";
const draftKeyPrefix = "ai-profiling.profile-draft.";

export function getOrCreateProfileId(): string {
  const existing = window.localStorage.getItem(profileIdKey);

  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(profileIdKey, created);
  return created;
}

export function loadLocalDraft(profileId: string): Partial<DraftPayload> | null {
  const raw = window.localStorage.getItem(`${draftKeyPrefix}${profileId}`);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Partial<DraftPayload>;
  } catch {
    return null;
  }
}

export function saveLocalDraft(payload: DraftPayload): void {
  window.localStorage.setItem(`${draftKeyPrefix}${payload.profileId}`, JSON.stringify(payload));
}

export async function saveRemoteDraft(payload: DraftPayload): Promise<void> {
  const response = await fetch(`/api/profile-drafts/${payload.profileId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Draft API returned ${response.status}`);
  }
}

export async function loadRemoteDraft(profileId: string): Promise<Partial<DraftPayload> | null> {
  const response = await fetch(`/api/profile-drafts/${profileId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Draft API returned ${response.status}`);
  }

  return (await response.json()) as Partial<DraftPayload>;
}

export async function submitRemoteDraft(
  profileId: string,
  answers: AnswersState,
  currentQuestionId: string
): Promise<void> {
  const response = await fetch(`/api/profile-drafts/${profileId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      answers,
      currentQuestionId
    })
  });

  if (!response.ok) {
    throw new Error(`Submit API returned ${response.status}`);
  }
}
