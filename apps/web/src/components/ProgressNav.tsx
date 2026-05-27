import { AlertCircle, CheckCircle2, Circle, CircleDot, Flag } from "lucide-react";
import { questionnaire } from "../data/questionnaire";
import { getSectionStatus } from "../lib/questionnaire";
import type { AnswersState, SectionStatus } from "../types/questionnaire";

const statusMeta: Record<SectionStatus, { label: string; icon: React.ReactNode }> = {
  not_started: { label: "Не начат", icon: <Circle size={16} /> },
  in_progress: { label: "В процессе", icon: <CircleDot size={16} /> },
  completed: { label: "Заполнен", icon: <CheckCircle2 size={16} /> },
  needs_review: { label: "Требует проверки", icon: <AlertCircle size={16} /> },
  ready: { label: "Готов", icon: <Flag size={16} /> }
};

type ProgressNavProps = {
  answers: AnswersState;
  currentSectionId: string;
  readyMode: boolean;
  onSectionSelect: (sectionId: string) => void;
};

export function ProgressNav({
  answers,
  currentSectionId,
  readyMode,
  onSectionSelect
}: ProgressNavProps) {
  return (
    <nav className="progress-nav" aria-label="Разделы анкеты">
      <div className="nav-title">Разделы</div>
      {questionnaire.sections.map((section) => {
        const status = getSectionStatus(section, answers, readyMode);
        const meta = statusMeta[status];

        return (
          <button
            type="button"
            key={section.id}
            className={`section-nav-item ${
              currentSectionId === section.id ? "section-nav-active" : ""
            } status-${status}`}
            onClick={() => onSectionSelect(section.id)}
          >
            <span className="section-order">{section.order}</span>
            <span className="section-copy">
              <strong>{section.title}</strong>
              <small>
                {meta.icon}
                {meta.label}
              </small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
