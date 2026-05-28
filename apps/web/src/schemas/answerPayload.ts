import { z } from "zod";
import { questionnaire } from "../data/questionnaire";
import { isQuestionAnswered } from "../lib/questionnaire";
import type { AnswerValue, AnswersState, QuestionConfig } from "../types/questionnaire";

const questionIds = questionnaire.questions.map((question) => question.id);
const questionIdSchema = z
  .string()
  .refine((value) => questionIds.includes(value), "Unknown questionnaire question id");

const isoDateTimeSchema = z.string().datetime();
const scalarAnswerSchema = z.string();
const stringArrayAnswerSchema = z.array(z.string());
const stringOrStringArraySchema = z.union([scalarAnswerSchema, stringArrayAnswerSchema]);

export const cardAnswerSchema = z
  .record(z.string(), stringOrStringArraySchema)
  .describe("One repeatable card answer. Field keys are defined by questionnaire.ts.");

export const groupAnswerSchema = z
  .record(z.string(), stringOrStringArraySchema)
  .describe("One group answer. Field keys are defined by questionnaire.ts.");

export const conditionalAnswerSchema = z
  .object({
    choice: z.string().optional(),
    details: z.union([z.string(), groupAnswerSchema, z.array(cardAnswerSchema)]).optional()
  })
  .strict()
  .describe("Answer for a conditional question.");

const questionAnswerShape = Object.fromEntries(
  questionnaire.questions.map((question) => [question.id, createQuestionAnswerSchema(question).optional()])
) as Record<string, z.ZodType>;

const supplementalAnswerShape = {
  section_1_total_reports_occupied_fte: z
    .string()
    .optional()
    .describe("Reference occupied FTE value loaded from the directory for total direct reports.")
} satisfies Record<string, z.ZodType>;

export const answersStateSchema = z
  .object({
    ...questionAnswerShape,
    ...supplementalAnswerShape
  })
  .strict()
  .describe("Questionnaire answers keyed by questionnaire question id.");

export const draftAnswerPayloadSchema = z
  .object({
    profileId: z.string().uuid(),
    answers: answersStateSchema,
    currentQuestionId: questionIdSchema,
    updatedAt: isoDateTimeSchema,
    submittedAt: isoDateTimeSchema.optional()
  })
  .strict()
  .describe("Permissive draft answer payload. Answers may be incomplete.");

export const submitAnswerRequestSchema = z
  .object({
    answers: answersStateSchema,
    currentQuestionId: questionIdSchema
  })
  .strict()
  .describe("Request body used by POST /api/profile-drafts/:profileId/submit.");

export const submittedAnswerPayloadSchema = draftAnswerPayloadSchema
  .extend({
    submittedAt: isoDateTimeSchema
  })
  .describe(
    "Structurally valid submitted answer payload. Business completeness is validated against questionnaire.ts."
  );

export type CardAnswerPayload = z.infer<typeof cardAnswerSchema>;
export type GroupAnswerPayload = z.infer<typeof groupAnswerSchema>;
export type ConditionalAnswerPayload = z.infer<typeof conditionalAnswerSchema>;
export type DraftAnswerPayload = z.infer<typeof draftAnswerPayloadSchema>;
export type SubmitAnswerRequest = z.infer<typeof submitAnswerRequestSchema>;
export type SubmittedAnswerPayload = z.infer<typeof submittedAnswerPayloadSchema>;

export function getIncompleteRequiredQuestionIds(answers: AnswersState): string[] {
  return questionnaire.questions
    .filter((question) => question.required)
    .filter((question) => !isQuestionAnswered(question, answers[question.id] as AnswerValue | undefined))
    .map((question) => question.id);
}

export function isSubmittedAnswerPayloadComplete(payload: SubmittedAnswerPayload): boolean {
  return getIncompleteRequiredQuestionIds(payload.answers as AnswersState).length === 0;
}

function createQuestionAnswerSchema(question: QuestionConfig): z.ZodType {
  if (question.type === "multi_choice" || question.type === "tag_input") {
    return stringArrayAnswerSchema;
  }

  if (question.type === "group") {
    return groupAnswerSchema;
  }

  if (question.type === "card_list") {
    return z.array(cardAnswerSchema);
  }

  if (question.type === "conditional") {
    return conditionalAnswerSchema;
  }

  return scalarAnswerSchema;
}
