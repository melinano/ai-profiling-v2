import { questionnaire } from "../data/questionnaire";
import type {
  AnswerValue,
  AnswersState,
  CardAnswer,
  ConditionalAnswer,
  FieldConfig,
  GroupAnswer,
  QuestionConfig,
  SectionConfig,
  SectionStatus
} from "../types/questionnaire";

export const firstQuestionId = questionnaire.questions[0].id;

export function getQuestionById(questionId: string): QuestionConfig {
  const question = questionnaire.questions.find((item) => item.id === questionId);

  if (!question) {
    return questionnaire.questions[0];
  }

  return question;
}

export function getSectionById(sectionId: string): SectionConfig {
  const section = questionnaire.sections.find((item) => item.id === sectionId);

  if (!section) {
    return questionnaire.sections[0];
  }

  return section;
}

export function getQuestionsForSection(sectionId: string): QuestionConfig[] {
  return questionnaire.questions.filter((question) => question.sectionId === sectionId);
}

export function getFirstQuestionForSection(sectionId: string): QuestionConfig {
  return getQuestionsForSection(sectionId)[0] ?? questionnaire.questions[0];
}

export function getQuestionIndex(questionId: string): number {
  const index = questionnaire.questions.findIndex((question) => question.id === questionId);

  return index >= 0 ? index : 0;
}

export function getNextQuestionId(questionId: string): string | null {
  const next = questionnaire.questions[getQuestionIndex(questionId) + 1];

  return next?.id ?? null;
}

export function getPreviousQuestionId(questionId: string): string | null {
  const previous = questionnaire.questions[getQuestionIndex(questionId) - 1];

  return previous?.id ?? null;
}

export function getRequiredProgress(answers: AnswersState): {
  answered: number;
  total: number;
  percent: number;
} {
  const requiredQuestions = questionnaire.questions.filter((question) => question.required);
  const answered = requiredQuestions.filter((question) =>
    isQuestionAnswered(question, answers[question.id])
  ).length;
  const total = requiredQuestions.length;

  return {
    answered,
    total,
    percent: total === 0 ? 0 : Math.round((answered / total) * 100)
  };
}

export function getSectionStatus(
  section: SectionConfig,
  answers: AnswersState,
  readyMode = false
): SectionStatus {
  const questions = getQuestionsForSection(section.id);
  const answeredCount = questions.filter((question) =>
    hasAnyAnswer(answers[question.id])
  ).length;
  const requiredQuestions = questions.filter((question) => question.required);
  const requiredAnswered = requiredQuestions.filter((question) =>
    isQuestionAnswered(question, answers[question.id])
  ).length;

  if (answeredCount === 0) {
    return "not_started";
  }

  if (requiredAnswered === requiredQuestions.length) {
    return readyMode ? "ready" : "completed";
  }

  if (readyMode) {
    return "needs_review";
  }

  return "in_progress";
}

export function getFirstIncompleteQuestionId(sectionId: string, answers: AnswersState): string {
  const question = getQuestionsForSection(sectionId).find(
    (item) => item.required && !isQuestionAnswered(item, answers[item.id])
  );

  return question?.id ?? getFirstQuestionForSection(sectionId).id;
}

export function allRequiredQuestionsAnswered(answers: AnswersState): boolean {
  return questionnaire.questions
    .filter((question) => question.required)
    .every((question) => isQuestionAnswered(question, answers[question.id]));
}

export function isQuestionAnswered(question: QuestionConfig, value: AnswerValue | undefined): boolean {
  if (!question.required) {
    return true;
  }

  if (question.type === "group") {
    if (!isRecord(value)) {
      return false;
    }

    const groupValue = value as Record<string, unknown>;

    return (question.fields ?? [])
      .filter((field) => isFieldVisible(field, groupValue))
      .filter((field) => !field.optional)
      .every((field) => isFieldAnswered(field, groupValue[field.name]));
  }

  if (question.type === "card_list") {
    return isCardListAnswered(value, question.fields ?? []);
  }

  if (question.type === "conditional") {
    if (!isRecord(value)) {
      return false;
    }

    const conditional = value as ConditionalAnswer;
    if (!hasText(conditional.choice)) {
      return false;
    }

    const details = question.conditionalDetails?.[conditional.choice ?? ""];
    if (!details) {
      return true;
    }

    if (details.type === "long_text") {
      return hasText(conditional.details);
    }

    if (details.type === "group") {
      if (!isRecord(conditional.details)) {
        return false;
      }

      const detailValue = conditional.details as Record<string, unknown>;
      return details.fields
        .filter((field) => isFieldVisible(field, detailValue))
        .filter((field) => !field.optional)
        .every((field) => isFieldAnswered(field, detailValue[field.name]));
    }

    return isCardListAnswered(conditional.details, details.fields);
  }

  return isFieldAnswered({ name: question.id, label: question.title, type: question.type }, value);
}

export function hasAnyAnswer(value: AnswerValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => hasAnyAnswer(item as AnswerValue));
  }

  return hasText(value);
}

export function createEmptyCard(fields: FieldConfig[]): CardAnswer {
  return fields.reduce<CardAnswer>((card, field) => {
    card[field.name] =
      field.defaultValue ??
      (field.type === "multi_choice" || field.type === "tag_input" ? [] : "");
    return card;
  }, {});
}

export function formatAnswerSummary(question: QuestionConfig, value: AnswerValue | undefined): string {
  if (!hasAnyAnswer(value)) {
    return "Не заполнено";
  }

  if (question.type === "card_list" && Array.isArray(value)) {
    return `${value.length} карточек`;
  }

  if (question.type === "conditional" && isRecord(value)) {
    const choice = findOptionLabel(question.options, value.choice as string);
    const conditional = value as ConditionalAnswer;

    if (Array.isArray(conditional.details)) {
      return `${choice}: ${conditional.details.length} карточек`;
    }

    if (hasText(conditional.details)) {
      return `${choice}: ${String(conditional.details).slice(0, 90)}`;
    }

    return choice;
  }

  if (question.type === "group" && isRecord(value)) {
    const filled = Object.keys(value as GroupAnswer).filter((key) =>
      hasAnyAnswer((value as GroupAnswer)[key] as AnswerValue)
    ).length;

    return `${filled} полей заполнено`;
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value).slice(0, 120);
}

export function findOptionLabel(options: QuestionConfig["options"], value: string): string {
  return options?.find((option) => option.value === value)?.label ?? value;
}

function isFieldAnswered(field: FieldConfig, value: unknown): boolean {
  if (field.type === "multi_choice" || field.type === "tag_input") {
    return Array.isArray(value) && value.length > 0;
  }

  return hasText(value);
}

function isCardListAnswered(value: unknown, fields: FieldConfig[]): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.some((card) => {
    if (!isRecord(card)) {
      return false;
    }

    return fields
      .filter((field) => !field.optional)
      .every((field) => isFieldAnswered(field, card[field.name]));
  });
}

function isFieldVisible(field: FieldConfig, values: Record<string, unknown>): boolean {
  if (!field.visibleWhen) {
    return true;
  }

  const currentValue = values[field.visibleWhen.field];
  const equals = toArray(field.visibleWhen.equals);
  const notEquals = toArray(field.visibleWhen.notEquals);

  if (equals.length > 0 && !equals.includes(String(currentValue ?? ""))) {
    return false;
  }

  if (notEquals.length > 0 && notEquals.includes(String(currentValue ?? ""))) {
    return false;
  }

  return true;
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
