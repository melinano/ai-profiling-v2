import type { DraftPayload } from "./questionnaire";
import type { PositionSuggestion } from "./directory";

export type InvitationPreview = {
  id: string;
  status: string;
  expiresAt: string | null;
  position: PositionSuggestion;
};

export type InvitationStartResult = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  assignmentId: string;
  profileId: string;
  draft: DraftPayload;
  position: PositionSuggestion;
};
