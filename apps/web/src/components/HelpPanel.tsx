import { Info, ShieldAlert } from "lucide-react";
import type { HelpContent } from "../types/questionnaire";

type HelpPanelProps = {
  help: HelpContent;
};

export function HelpPanel({ help }: HelpPanelProps) {
  return (
    <aside className="help-panel" aria-label="Подсказка по вопросу">
      <div className="help-panel-header">
        <Info size={18} />
        <span>Подсказка</span>
      </div>
      <h2>{help.title}</h2>
      <p>{help.body}</p>

      {help.example ? (
        <div className="help-example">
          <span>Пример</span>
          <p>{help.example}</p>
        </div>
      ) : null}

      {help.hint ? (
        <div className="help-warning">
          <ShieldAlert size={18} />
          <p>{help.hint}</p>
        </div>
      ) : null}
    </aside>
  );
}
