import type { FieldConfig } from "../types/questionnaire";

type FieldInputProps = {
  field: FieldConfig;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  onFocus?: () => void;
};

export function FieldInput({ field, value, onChange, onFocus }: FieldInputProps) {
  if (field.type === "long_text") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        min="0"
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        value={typeof value === "string" ? value : ""}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === "single_choice") {
    return (
      <div className="choice-grid">
        {field.options?.map((option) => (
          <label
            className={`choice-option ${value === option.value ? "choice-option-selected" : ""}`}
            key={option.value}
          >
            <input
              type="radio"
              name={field.name}
              checked={value === option.value}
              onFocus={onFocus}
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

  if (field.type === "multi_choice") {
    const selected = Array.isArray(value) ? value : [];

    return (
      <div className="choice-grid compact">
        {field.options?.map((option) => {
          const checked = selected.includes(option.value);

          return (
            <label
              className={`choice-option ${checked ? "choice-option-selected" : ""}`}
              key={option.value}
            >
              <input
                type="checkbox"
                checked={checked}
                onFocus={onFocus}
                onChange={() => {
                  onChange(getNextMultiChoiceValue(selected, option.value, field.options));
                }}
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

  if (field.type === "tag_input") {
    const tags = Array.isArray(value) ? value : [];

    return (
      <div className="tag-input">
        <input
          type="text"
          placeholder={field.placeholder}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            const next = event.currentTarget.value.trim();
            if (next && !tags.includes(next)) {
              onChange([...tags, next]);
            }
            event.currentTarget.value = "";
          }}
        />
        {tags.length > 0 ? (
          <div className="tag-list">
            {tags.map((tag) => (
              <button
                type="button"
                className="tag"
                key={tag}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
                title="Удалить тег"
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function getNextMultiChoiceValue(
  selected: string[],
  optionValue: string,
  options: FieldConfig["options"] = []
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

function isExclusiveOption(option: NonNullable<FieldConfig["options"]>[number]): boolean {
  const label = option.label.toLowerCase();
  return (
    label === "не применимо" ||
    label.startsWith("не требуется") ||
    label.startsWith("не управляет")
  );
}
