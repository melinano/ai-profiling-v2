import { ChevronRight } from "lucide-react";

type DerivedOrgPathDisplayProps = {
  value: string;
  label: string;
  placeholder: string;
};

export function DerivedOrgPathDisplay({
  value,
  label,
  placeholder
}: DerivedOrgPathDisplayProps) {
  const segments = splitOrgPath(value);
  const leaf = segments[segments.length - 1] ?? "";
  const parents = segments.slice(0, -1);

  if (!value.trim()) {
    return (
      <input
        type="text"
        className="derived-field"
        aria-label={label}
        value=""
        placeholder={placeholder}
        readOnly
      />
    );
  }

  return (
    <div className="derived-org-field" role="group" aria-label={label} title={value} tabIndex={0}>
      <div className="derived-org-main">
        <span>Подразделение</span>
        <strong>{leaf}</strong>
      </div>

      {parents.length > 0 ? (
        <div className="derived-org-chain" aria-label="Цепочка подразделений">
          {parents.map((segment, index) => (
            <span className="derived-org-chain-item" key={`${segment}-${index}`}>
              <span>{segment}</span>
              {index < parents.length - 1 ? <ChevronRight size={14} /> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function splitOrgPath(value: string): string[] {
  return value
    .split(/\s+\/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}
