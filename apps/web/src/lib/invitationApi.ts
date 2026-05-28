import type { InvitationPreview, InvitationStartResult } from "../types/invitation";

export async function loadInvitationPreview(token: string): Promise<InvitationPreview> {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`);

  if (!response.ok) {
    throw new Error(`Invitation API returned ${response.status}`);
  }

  return (await response.json()) as InvitationPreview;
}

export async function startInvitationInterview(
  token: string,
  payload: { email: string; fullName: string }
): Promise<InvitationStartResult> {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Invitation API returned ${response.status}`);
  }

  return (await response.json()) as InvitationStartResult;
}
