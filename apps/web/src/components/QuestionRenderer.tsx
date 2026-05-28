import { Plus, Trash2 } from "lucide-react";
import type React from "react";
import { createEmptyCard } from "../lib/questionnaire";
import type {
  AnswerValue,
  CardAnswer,
  ConditionalAnswer,
  ConditionalDetails,
  FieldConfig,
  GroupAnswer,
  HelpContent,
  QuestionConfig
} from "../types/questionnaire";
import type { PositionSuggestion } from "../types/directory";
import { FieldInput } from "./FieldInput";

type FieldAutocompleteContext = {
  cardIndex?: number;
  field: FieldConfig;
  question: QuestionConfig;
};

type QuestionRendererProps = {
  question: QuestionConfig;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  onHelpChange: (help: HelpContent) => void;
  renderQuestionInput?: (question: QuestionConfig) => React.ReactNode;
  onFieldPositionSelect?: (
    context: FieldAutocompleteContext,
    position: PositionSuggestion
  ) => void;
};

export function QuestionRenderer({
  question,
  value,
  onChange,
  onHelpChange,
  renderQuestionInput,
  onFieldPositionSelect
}: QuestionRendererProps) {
  const customInput = renderQuestionInput?.(question);
  if (customInput) {
    return customInput;
  }

  if (question.type === "group") {
    const groupValue = isRecord(value) ? (value as GroupAnswer) : {};

    return (
      <div className="form-stack">
        {question.fields?.filter((field) => isFieldVisible(field, groupValue)).map((field) => (
          <LabeledField
            field={field}
            key={field.name}
            onHelp={() => onHelpChange(helpFromField(question, field))}
          >
            <FieldInput
              field={field}
              value={groupValue[field.name]}
              contextValues={groupValue}
              onFocus={() => onHelpChange(helpFromField(question, field))}
              onChange={(nextValue) =>
                onChange({
                  ...groupValue,
                  [field.name]: nextValue
                })
              }
              onPositionSelect={(position) =>
                onFieldPositionSelect?.({ question, field }, position)
              }
            />
          </LabeledField>
        ))}
      </div>
    );
  }

  if (question.type === "card_list") {
    return (
      <CardListEditor
        addLabel={question.addLabel ?? "Добавить карточку"}
        fields={question.fields ?? []}
        value={Array.isArray(value) ? (value as CardAnswer[]) : []}
        onChange={onChange}
        question={question}
        onFieldPositionSelect={onFieldPositionSelect}
        onHelpChange={(field, cardIndex) =>
          onHelpChange(helpFromField(question, field, `Карточка ${cardIndex + 1}`))
        }
      />
    );
  }

  if (question.type === "conditional") {
    const conditionalValue = isRecord(value) ? (value as ConditionalAnswer) : {};
    const detailConfig = conditionalValue.choice
      ? question.conditionalDetails?.[conditionalValue.choice]
      : undefined;

    return (
      <div className="form-stack">
        <div className="choice-grid">
          {question.options?.map((option) => (
            <label
              className={`choice-option ${
                conditionalValue.choice === option.value ? "choice-option-selected" : ""
              }`}
              key={option.value}
            >
              <input
                type="radio"
                name={question.id}
                checked={conditionalValue.choice === option.value}
                onFocus={() => onHelpChange(helpFromQuestion(question))}
                onChange={() =>
                  onChange({
                    choice: option.value,
                    details: undefined
                  })
                }
              />
              <span>
                <strong>{option.label}</strong>
                {option.description ? <small>{option.description}</small> : null}
              </span>
            </label>
          ))}
        </div>

        {detailConfig?.type === "long_text" ? (
          <LabeledBlock
            label={detailConfig.label}
            onHelp={() => onHelpChange(helpFromConditionalDetail(question, detailConfig))}
          >
            <textarea
              value={typeof conditionalValue.details === "string" ? conditionalValue.details : ""}
              placeholder={detailConfig.placeholder}
              onFocus={() => onHelpChange(helpFromConditionalDetail(question, detailConfig))}
              onChange={(event) =>
                onChange({
                  ...conditionalValue,
                  details: event.target.value
                })
              }
              rows={6}
            />
          </LabeledBlock>
        ) : null}

        {detailConfig?.type === "group" ? (
          <div className="form-stack">
            {detailConfig.fields.map((field) => {
              const detailsValue = isRecord(conditionalValue.details)
                ? (conditionalValue.details as GroupAnswer)
                : {};

              if (!isFieldVisible(field, detailsValue)) {
                return null;
              }

              return (
                <LabeledField
                  field={field}
                  key={field.name}
                  onHelp={() => onHelpChange(helpFromField(question, field))}
                >
                  <FieldInput
                    field={field}
                    value={detailsValue[field.name]}
                    contextValues={detailsValue}
                    onFocus={() => onHelpChange(helpFromField(question, field))}
                    onChange={(nextValue) => {
                      const clearedFields = getClearedFieldValues(field);
                      onChange({
                        ...conditionalValue,
                        details: {
                          ...detailsValue,
                          ...clearedFields,
                          [field.name]: nextValue
                        }
                      });
                    }}
                    onPositionSelect={(position) =>
                      onFieldPositionSelect?.({ question, field }, position)
                    }
                  />
                </LabeledField>
              );
            })}
          </div>
        ) : null}

        {detailConfig?.type === "card_list" ? (
          <CardListEditor
            addLabel={detailConfig.addLabel}
            fields={detailConfig.fields}
            value={Array.isArray(conditionalValue.details) ? conditionalValue.details : []}
            onChange={(nextValue) =>
              onChange({
                ...conditionalValue,
                details: nextValue
              })
            }
            question={question}
            onFieldPositionSelect={onFieldPositionSelect}
            onHelpChange={(field, cardIndex) =>
              onHelpChange(helpFromField(question, field, `Карточка ${cardIndex + 1}`))
            }
          />
        ) : null}
      </div>
    );
  }

  if (question.type === "single_choice") {
    return (
      <div className="choice-grid">
        {question.options?.map((option) => (
          <label
            className={`choice-option ${value === option.value ? "choice-option-selected" : ""}`}
            key={option.value}
          >
            <input
              type="radio"
              name={question.id}
              checked={value === option.value}
              onFocus={() => onHelpChange(helpFromQuestion(question))}
              onChange={() => onChange(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "multi_choice") {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

    return (
      <div className="choice-grid compact">
        {question.options?.map((option) => {
          const checked = selected.includes(option.value);

          return (
            <label
              className={`choice-option ${checked ? "choice-option-selected" : ""}`}
              key={option.value}
            >
              <input
                type="checkbox"
                checked={checked}
                onFocus={() => onHelpChange(helpFromQuestion(question))}
                onChange={() =>
                  onChange(getNextMultiChoiceValue(selected, option.value, question.options))
                }
              />
              <span>
                <strong>{option.label}</strong>
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === "long_text") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        placeholder={question.placeholder}
        onFocus={() => onHelpChange(helpFromQuestion(question))}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
      />
    );
  }

  return (
    <input
      type={question.type === "date" ? "date" : question.type === "number" ? "number" : "text"}
      value={typeof value === "string" ? value : ""}
      placeholder={question.placeholder}
      onFocus={() => onHelpChange(helpFromQuestion(question))}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CardListEditor({
  addLabel,
  fields,
  value,
  onChange,
  question,
  onFieldPositionSelect,
  onHelpChange
}: {
  addLabel: string;
  fields: FieldConfig[];
  value: CardAnswer[];
  onChange: (value: CardAnswer[]) => void;
  question: QuestionConfig;
  onFieldPositionSelect?: (
    context: FieldAutocompleteContext,
    position: PositionSuggestion
  ) => void;
  onHelpChange: (field: FieldConfig, cardIndex: number) => void;
}) {
  const cards = value.length > 0 ? value : [];

  return (
    <div className="card-list-editor">
      {cards.length === 0 ? (
        <div className="empty-state">Карточки пока не добавлены.</div>
      ) : null}

      {cards.map((card, index) => (
        <div className="repeat-card" key={index}>
          <div className="repeat-card-header">
            <span>Карточка {index + 1}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => onChange(cards.filter((_, cardIndex) => cardIndex !== index))}
              title="Удалить карточку"
            >
              <Trash2 size={17} />
            </button>
          </div>

          <div className={getCardFieldsClassName(fields)}>
            {fields.map((field) => (
              <LabeledField
                field={field}
                key={field.name}
                onHelp={() => onHelpChange(field, index)}
              >
                <FieldInput
                  field={field}
                  value={card[field.name]}
                  contextValues={card}
                  onFocus={() => onHelpChange(field, index)}
                  onChange={(nextValue) => {
                    const nextCards = cards.map((item, cardIndex) =>
                      cardIndex === index
                        ? {
                            ...item,
                            [field.name]: nextValue
                          }
                        : item
                    );

                    onChange(nextCards);
                  }}
                  onPositionSelect={(position) =>
                    onFieldPositionSelect?.({ question, field, cardIndex: index }, position)
                  }
                />
              </LabeledField>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="secondary-button add-card-button"
        onClick={() => onChange([...cards, createEmptyCard(fields)])}
      >
        <Plus size={18} />
        {addLabel}
      </button>
    </div>
  );
}

function LabeledField({
  field,
  children,
  onHelp
}: {
  field: FieldConfig;
  children: React.ReactNode;
  onHelp: () => void;
}) {
  return (
    <LabeledBlock
      label={field.label}
      optional={field.optional}
      help={field.help}
      layout={field.layout}
      onHelp={onHelp}
    >
      {children}
    </LabeledBlock>
  );
}

function LabeledBlock({
  label,
  optional,
  help,
  layout,
  onHelp,
  children
}: {
  label: string;
  optional?: boolean;
  help?: string;
  layout?: FieldConfig["layout"];
  onHelp?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`field-block ${layout ? `field-layout-${layout}` : ""}`}
      onFocusCapture={onHelp}
      onMouseEnter={onHelp}
    >
      <span className="field-label">
        {label}
        {optional ? <small>Необязательно</small> : null}
      </span>
      {children}
      {help ? <span className="field-help">{help}</span> : null}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldVisible(field: FieldConfig, values: GroupAnswer): boolean {
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

function getCardFieldsClassName(fields: FieldConfig[]): string {
  return fields.some((field) => field.layout === "wide" || field.layout === "compact")
    ? "form-stack card-inline-grid"
    : "form-stack";
}

function getNextMultiChoiceValue(
  selected: string[],
  optionValue: string,
  options: QuestionConfig["options"] = []
): string[] {
  const option = options.find((item) => item.value === optionValue);
  const exclusiveValues = options.filter(isExclusiveOption).map((item) => item.value);
  const checked = selected.includes(optionValue);

  if (checked) {
    return selected.filter((item) => item !== optionValue);
  }

  if (option && isExclusiveOption(option)) {
    return [optionValue];
  }

  return [...selected.filter((item) => !exclusiveValues.includes(item)), optionValue];
}

function isExclusiveOption(option: NonNullable<QuestionConfig["options"]>[number]): boolean {
  const label = option.label.toLowerCase();
  return (
    label.startsWith("не применимо") ||
    label.startsWith("не требуется") ||
    label.startsWith("не управля")
  );
}

function helpFromQuestion(question: QuestionConfig): HelpContent {
  return {
    title: question.title,
    body: question.help,
    example: question.example,
    hint: question.helpHint
  };
}

function getClearedFieldValues(field: FieldConfig): GroupAnswer {
  if (!field.clearsFields?.length) {
    return {};
  }

  return Object.fromEntries(field.clearsFields.map((fieldName) => [fieldName, ""]));
}

function helpFromField(
  question: QuestionConfig,
  field: FieldConfig,
  contextLabel?: string
): HelpContent {
  const title = contextLabel ? `${contextLabel}: ${field.label}` : field.label;

  return {
    title,
    body:
      field.help ??
      `Заполните поле «${field.label}» в контексте блока «${question.title}».`,
    example: field.example,
    hint: field.helpHint
  };
}

function helpFromConditionalDetail(
  question: QuestionConfig,
  detail: Extract<ConditionalDetails, { type: "long_text" }>
): HelpContent {
  return {
    title: detail.label,
    body: detail.help ?? question.help,
    example: detail.example ?? question.example,
    hint: detail.helpHint ?? question.helpHint
  };
}
