import { Pencil, Search } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

export type SelectedAutocompleteDisplay = {
  title: string;
  meta?: React.ReactNode;
};

type AutocompleteInputProps<T> = {
  value: string;
  ariaLabel?: string;
  placeholder?: string;
  minChars?: number;
  onChange: (value: string) => void;
  onSelect: (option: T) => void;
  onFocus?: () => void;
  loadOptions: (query: string) => Promise<T[]>;
  getOptionKey: (option: T) => string;
  renderOption: (option: T) => React.ReactNode;
  getSelectedDisplay?: (option: T) => SelectedAutocompleteDisplay;
  selectedDisplayValue?: SelectedAutocompleteDisplay | null;
  emptyText?: string;
  changeLabel?: string;
};

export function AutocompleteInput<T>({
  value,
  ariaLabel,
  placeholder,
  minChars = 2,
  onChange,
  onSelect,
  onFocus,
  loadOptions,
  getOptionKey,
  renderOption,
  getSelectedDisplay,
  selectedDisplayValue,
  emptyText = "Ничего не найдено",
  changeLabel = "Изменить выбранную должность"
}: AutocompleteInputProps<T>) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<T | null>(null);

  useEffect(() => {
    setQuery(value);
    if (!value.trim()) {
      setSelectedOption(null);
    }
  }, [value]);

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let active = true;

    if (normalizedQuery.length < minChars) {
      setOptions([]);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    const timeoutId = window.setTimeout(() => {
      loadOptions(normalizedQuery)
        .then((items) => {
          if (active) {
            setOptions(items);
          }
        })
        .catch(() => {
          if (active) {
            setOptions([]);
          }
        })
        .finally(() => {
          if (active) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [loadOptions, minChars, normalizedQuery]);

  const showPanel = isOpen && normalizedQuery.length >= minChars;
  const selectedDisplay =
    selectedOption && value.trim()
      ? getSelectedDisplay?.(selectedOption)
      : selectedDisplayValue;

  if (selectedDisplay && value.trim()) {
    return (
      <div className="autocomplete-selected" role="group" aria-label={ariaLabel} title={value}>
        <div className="autocomplete-selected-content">
          <strong>{selectedDisplay.title}</strong>
          {selectedDisplay.meta ? <small>{selectedDisplay.meta}</small> : null}
        </div>
        <button
          type="button"
          className="icon-button autocomplete-selected-action"
          aria-label={changeLabel}
          title={changeLabel}
          onClick={() => {
            setSelectedOption(null);
            setQuery("");
            setIsOpen(false);
            onChange("");
          }}
        >
          <Pencil size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="autocomplete-field">
      <div className="autocomplete-input-wrap">
        <Search size={17} />
        <input
          type="text"
          value={query}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            onFocus?.();
          }}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        />
      </div>

      {showPanel ? (
        <div className="autocomplete-menu">
          {isLoading ? <div className="autocomplete-state">Поиск...</div> : null}

          {!isLoading && options.length === 0 ? (
            <div className="autocomplete-state">{emptyText}</div>
          ) : null}

          {!isLoading
            ? options.map((option) => (
                <button
                  type="button"
                  className="autocomplete-option"
                  key={getOptionKey(option)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedOption(option);
                    onSelect(option);
                    setIsOpen(false);
                  }}
                >
                  {renderOption(option)}
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
