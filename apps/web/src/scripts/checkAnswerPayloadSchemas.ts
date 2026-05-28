import { questionnaire } from "../data/questionnaire";
import { allRequiredQuestionsAnswered } from "../lib/questionnaire";
import {
  draftAnswerPayloadSchema,
  getIncompleteRequiredQuestionIds,
  submittedAnswerPayloadSchema,
  submitAnswerRequestSchema
} from "../schemas/answerPayload";
import type {
  AnswerValue,
  CardAnswer,
  ConditionalDetails,
  FieldConfig,
  GroupAnswer,
  QuestionConfig
} from "../types/questionnaire";

const now = "2026-05-28T02:00:00.000Z";
const profileId = "00000000-0000-4000-8000-000000000001";
const currentQuestionId = questionnaire.questions[0].id;

assert(
  draftAnswerPayloadSchema.safeParse({
    profileId,
    answers: {},
    currentQuestionId,
    updatedAt: now
  }).success,
  "valid draft payload should pass"
);

assert(
  !draftAnswerPayloadSchema.safeParse({
    profileId,
    answers: {
      unknown_question: "value"
    },
    currentQuestionId,
    updatedAt: now
  }).success,
  "unknown answer keys should fail"
);

assert(
  submitAnswerRequestSchema.safeParse({
    answers: {},
    currentQuestionId
  }).success,
  "submit request shape should pass structural validation"
);

const incompletePayload = submittedAnswerPayloadSchema.parse({
  profileId,
  answers: {},
  currentQuestionId,
  updatedAt: now,
  submittedAt: now
});
assert(
  getIncompleteRequiredQuestionIds(incompletePayload.answers).length > 0,
  "empty submitted payload should fail completeness validation"
);

const completeAnswers = Object.fromEntries(
  questionnaire.questions
    .filter((question) => question.required)
    .map((question) => [question.id, createCompleteAnswer(question)])
);
const completePayload = submittedAnswerPayloadSchema.parse({
  profileId,
  answers: completeAnswers,
  currentQuestionId,
  updatedAt: now,
  submittedAt: now
});
assert(
  allRequiredQuestionsAnswered(completePayload.answers),
  "generated complete submitted payload should pass questionnaire completeness"
);

console.log("Answer payload schema checks passed");

function createCompleteAnswer(question: QuestionConfig): AnswerValue {
  if (question.type === "multi_choice" || question.type === "tag_input") {
    return [firstOptionValue(question.options) ?? "Тестовое значение"];
  }

  if (question.type === "group") {
    return createCompleteGroupAnswer(question.fields ?? []);
  }

  if (question.type === "card_list") {
    return [createCompleteCardAnswer(question.fields ?? [])];
  }

  if (question.type === "conditional") {
    const choice =
      question.options?.find((option) => !question.conditionalDetails?.[option.value])?.value ??
      question.options?.[0]?.value ??
      "yes";
    const details = question.conditionalDetails?.[choice];

    return details
      ? {
          choice,
          details: createCompleteConditionalDetails(details)
        }
      : {
          choice
        };
  }

  if (question.type === "single_choice") {
    return firstOptionValue(question.options) ?? "Тестовое значение";
  }

  return createCompleteFieldValue({
    name: question.id,
    label: question.title,
    type: question.type
  });
}

function createCompleteConditionalDetails(details: ConditionalDetails): string | CardAnswer[] | GroupAnswer {
  if (details.type === "long_text") {
    return "Тестовое значение";
  }

  if (details.type === "group") {
    return createCompleteGroupAnswer(details.fields);
  }

  return [createCompleteCardAnswer(details.fields)];
}

function createCompleteGroupAnswer(fields: FieldConfig[]): GroupAnswer {
  return Object.fromEntries(
    fields.map((field) => [field.name, createCompleteFieldValue(field)])
  ) as GroupAnswer;
}

function createCompleteCardAnswer(fields: FieldConfig[]): CardAnswer {
  return Object.fromEntries(
    fields.map((field) => [field.name, createCompleteFieldValue(field)])
  ) as CardAnswer;
}

function createCompleteFieldValue(field: FieldConfig): string | string[] {
  if (field.type === "multi_choice" || field.type === "tag_input") {
    return [firstOptionValue(field.options) ?? "Тестовое значение"];
  }

  if (field.type === "single_choice") {
    return firstOptionValue(field.options) ?? "Тестовое значение";
  }

  if (field.type === "date") {
    return "2026-05-28";
  }

  if (field.type === "number") {
    return "1";
  }

  return "Тестовое значение";
}

function firstOptionValue(options: QuestionConfig["options"]): string | undefined {
  return options?.[0]?.value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
