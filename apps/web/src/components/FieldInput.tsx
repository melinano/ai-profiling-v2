import { searchDirectory, searchOrgUnits, searchPositions } from "../lib/directoryApi";
import type { DirectorySuggestion, OrgUnitSuggestion, PositionSuggestion } from "../types/directory";
import type { FieldConfig, GroupAnswer } from "../types/questionnaire";
import { AutocompleteInput, type SelectedAutocompleteDisplay } from "./AutocompleteInput";
import { DerivedOrgPathDisplay } from "./DerivedOrgPathDisplay";

type FieldInputProps = {
  field: FieldConfig;
  value: string | string[] | undefined;
  contextValues?: GroupAnswer;
  onChange: (value: string | string[]) => void;
  onFocus?: () => void;
  onPositionSelect?: (position: PositionSuggestion) => void;
};

export function FieldInput({
  field,
  value,
  contextValues,
  onChange,
  onFocus,
  onPositionSelect
}: FieldInputProps) {
  if (field.readOnly) {
    if (field.display === "org_path") {
      return (
        <DerivedOrgPathDisplay
          value={typeof value === "string" ? value : ""}
          label={field.label}
          placeholder={field.placeholder ?? "Заполнится после выбора должности"}
        />
      );
    }

    return (
      <input
        type="text"
        className="derived-field"
        aria-label={field.label}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        readOnly
        onFocus={onFocus}
      />
    );
  }

  if (field.autocomplete === "positions" && field.type === "short_text") {
    const stringValue = typeof value === "string" ? value : "";

    return (
      <AutocompleteInput<PositionSuggestion>
        value={stringValue}
        ariaLabel={field.label}
        placeholder={field.placeholder}
        onFocus={onFocus}
        onChange={onChange}
        onSelect={(position) => {
          onChange(formatPositionValue(position, field));
          onPositionSelect?.(position);
        }}
        loadOptions={(query) => searchPositions(query)}
        getOptionKey={(position) => position.id}
        renderOption={(position) => (
          <>
            <strong>{position.title}</strong>
            <small>{position.orgUnit.fullPath}</small>
          </>
        )}
        getSelectedDisplay={(position) => getPositionSelectedDisplay(position, field)}
        selectedDisplayValue={getSelectedDisplayFromValue(field, stringValue, contextValues)}
      />
    );
  }

  if (field.autocomplete === "org_units" && field.type === "short_text") {
    const stringValue = typeof value === "string" ? value : "";

    return (
      <AutocompleteInput<OrgUnitSuggestion>
        value={stringValue}
        ariaLabel={field.label}
        placeholder={field.placeholder}
        onFocus={onFocus}
        onChange={onChange}
        onSelect={(orgUnit) => onChange(orgUnit.fullPath)}
        loadOptions={(query) => searchOrgUnits(query)}
        getOptionKey={(orgUnit) => orgUnit.id}
        renderOption={(orgUnit) => (
          <>
            <strong>{orgUnit.name}</strong>
            <small>{orgUnit.fullPath}</small>
          </>
        )}
        getSelectedDisplay={(orgUnit) => ({
          title: orgUnit.name,
          meta: orgUnit.fullPath
        })}
        selectedDisplayValue={getOrgUnitSelectedDisplay(stringValue)}
        emptyText="Подразделения не найдены"
      />
    );
  }

  if (field.autocomplete === "directory" && field.type === "short_text") {
    const stringValue = typeof value === "string" ? value : "";

    return (
      <AutocompleteInput<DirectorySuggestion>
        value={stringValue}
        ariaLabel={field.label}
        placeholder={field.placeholder}
        onFocus={onFocus}
        onChange={onChange}
        onSelect={(item) => onChange(formatDirectoryValue(item))}
        loadOptions={(query) => searchDirectory(query)}
        getOptionKey={(item) => `${item.kind}-${item.id}`}
        renderOption={(item) => (
          <>
            <strong>{getDirectoryTitle(item)}</strong>
            <small>{getDirectoryMeta(item)}</small>
          </>
        )}
        getSelectedDisplay={(item) => ({
          title: getDirectoryTitle(item),
          meta: getDirectoryMeta(item)
        })}
        selectedDisplayValue={getDirectorySelectedDisplay(stringValue)}
        emptyText="Должности и подразделения не найдены"
        changeLabel="Изменить выбранную должность или подразделение"
      />
    );
  }

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
    const stringValue = typeof value === "string" ? value : "";
    const occupiedFte = getStringValue(contextValues?.[`${field.name}_occupied_fte`]);

    return (
      <div className="count-field">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          aria-label={field.label}
          value={stringValue}
          placeholder={field.placeholder}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
        {occupiedFte ? (
          <span className="field-help">
            {formatEmployeeCountLabel(stringValue)}; занято {occupiedFte} {getFteWord(occupiedFte)}
          </span>
        ) : null}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        aria-label={field.label}
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
          aria-label={field.label}
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
      aria-label={field.label}
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function formatPositionValue(position: PositionSuggestion, field: FieldConfig): string {
  if (field.selectedPositionDisplay === "title") {
    return position.title;
  }

  return formatPositionLabel(position);
}

function formatPositionLabel(position: PositionSuggestion): string {
  return `${position.title} — ${position.orgUnit.fullPath}`;
}

function getPositionSelectedDisplay(
  position: PositionSuggestion,
  field: FieldConfig
): SelectedAutocompleteDisplay {
  if (field.selectedPositionDisplay === "title") {
    return { title: position.title };
  }

  return {
    title: position.title,
    meta: position.orgUnit.fullPath
  };
}

function getSelectedDisplayFromValue(
  field: FieldConfig,
  value: string,
  contextValues: GroupAnswer | undefined
): SelectedAutocompleteDisplay | null {
  if (!value.trim()) {
    return null;
  }

  if (field.lockWhenFieldPresent && hasContextValue(contextValues?.[field.lockWhenFieldPresent])) {
    const parsed = parsePositionLabel(value);
    if (field.selectedPositionDisplay === "title") {
      return { title: parsed?.title ?? value };
    }

    return parsed ?? { title: value };
  }

  const parsed = parsePositionLabel(value);
  if (!parsed) {
    return null;
  }

  if (field.selectedPositionDisplay === "title") {
    return { title: parsed.title };
  }

  return parsed;
}

function parsePositionLabel(value: string): SelectedAutocompleteDisplay | null {
  const separator = " — ";
  const separatorIndex = value.indexOf(separator);
  if (separatorIndex < 0) {
    return null;
  }

  const title = value.slice(0, separatorIndex).trim();
  const meta = value.slice(separatorIndex + separator.length).trim();

  if (!title || !meta) {
    return null;
  }

  return { title, meta };
}

function formatDirectoryValue(item: DirectorySuggestion): string {
  if (item.kind === "position") {
    return `${item.title} — ${item.orgUnit.fullPath}`;
  }

  return `Подразделение: ${item.fullPath}`;
}

function getDirectoryTitle(item: DirectorySuggestion): string {
  return item.kind === "position" ? item.title : item.name;
}

function getDirectoryMeta(item: DirectorySuggestion): string {
  return item.kind === "position" ? item.orgUnit.fullPath : "Подразделение";
}

function getDirectorySelectedDisplay(value: string): SelectedAutocompleteDisplay | null {
  const parsedPosition = parsePositionLabel(value);
  if (parsedPosition) {
    return parsedPosition;
  }

  const orgUnitPrefix = "Подразделение: ";
  if (!value.startsWith(orgUnitPrefix)) {
    return null;
  }

  return getOrgUnitSelectedDisplay(value.slice(orgUnitPrefix.length));
}

function getOrgUnitSelectedDisplay(value: string): SelectedAutocompleteDisplay | null {
  if (!value.trim()) {
    return null;
  }

  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const title = parts[parts.length - 1] ?? value;
  const meta = parts.length > 1 ? parts.slice(0, -1).join(" / ") : "Подразделение";

  return { title, meta };
}

function hasContextValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatEmployeeCountLabel(value: string): string {
  const count = Number(value.replace(",", "."));
  if (!Number.isFinite(count)) {
    return "0 сотрудников";
  }

  const rounded = Math.ceil(Math.max(count, 0));
  return `${rounded} ${getEmployeeWord(rounded)}`;
}

function getEmployeeWord(value: number): string {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "сотрудников";
  }

  if (last === 1) {
    return "сотрудник";
  }

  if (last >= 2 && last <= 4) {
    return "сотрудника";
  }

  return "сотрудников";
}

function getFteWord(value: string): string {
  return Number(value.replace(",", ".")) === 1 ? "ставка" : "ставки";
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
    label.startsWith("не применимо") ||
    label.startsWith("не требуется") ||
    label.startsWith("не управля")
  );
}
