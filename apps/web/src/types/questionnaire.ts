export type SectionStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "needs_review"
  | "ready";

export type FieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "single_choice"
  | "multi_choice"
  | "tag_input";

export type QuestionType =
  | FieldType
  | "group"
  | "card_list"
  | "conditional";

export type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
};

export type HelpContent = {
  title: string;
  body: string;
  example?: string;
  hint?: string;
};

export type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  layout?: "wide" | "compact" | "full";
  defaultValue?: string | string[];
  visibleWhen?: {
    field: string;
    equals?: string | string[];
    notEquals?: string | string[];
  };
  options?: ChoiceOption[];
  placeholder?: string;
  optional?: boolean;
  help?: string;
  example?: string;
  helpHint?: string;
};

export type ConditionalDetails =
  | {
      type: "long_text";
      label: string;
      placeholder?: string;
      help?: string;
      example?: string;
      helpHint?: string;
    }
  | {
      type: "group";
      fields: FieldConfig[];
      help?: string;
      example?: string;
      helpHint?: string;
    }
  | {
      type: "card_list";
      addLabel: string;
      fields: FieldConfig[];
      help?: string;
      example?: string;
      helpHint?: string;
    };

export type QuestionConfig = {
  id: string;
  sectionId: string;
  title: string;
  prompt: string;
  purpose: string;
  type: QuestionType;
  required: boolean;
  options?: ChoiceOption[];
  fields?: FieldConfig[];
  placeholder?: string;
  example?: string;
  help: string;
  helpHint?: string;
  addLabel?: string;
  conditionalDetails?: Record<string, ConditionalDetails>;
  minRecommendedItems?: number;
  maxRecommendedItems?: number;
};

export type SectionConfig = {
  id: string;
  order: number;
  title: string;
  description: string;
};

export type QuestionnaireConfig = {
  sections: SectionConfig[];
  questions: QuestionConfig[];
};

export type CardAnswer = Record<string, string | string[]>;

export type GroupAnswer = Record<string, string | string[]>;

export type ConditionalAnswer = {
  choice?: string;
  details?: string | CardAnswer[] | GroupAnswer;
};

export type AnswerValue =
  | string
  | string[]
  | CardAnswer[]
  | GroupAnswer
  | ConditionalAnswer;

export type AnswersState = Record<string, AnswerValue | undefined>;

export type DraftPayload = {
  profileId: string;
  answers: AnswersState;
  currentQuestionId: string;
  submittedAt?: string;
  updatedAt: string;
};
