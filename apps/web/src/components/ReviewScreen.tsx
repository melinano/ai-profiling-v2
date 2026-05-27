import { CheckCircle2, Eye, Pencil, Send, TriangleAlert } from "lucide-react";
import { questionnaire } from "../data/questionnaire";
import {
  allRequiredQuestionsAnswered,
  formatAnswerSummary,
  getFirstIncompleteQuestionId,
  getQuestionsForSection,
  getSectionStatus
} from "../lib/questionnaire";
import type { AnswersState } from "../types/questionnaire";

type ReviewScreenProps = {
  answers: AnswersState;
  submitting: boolean;
  onEditQuestion: (questionId: string) => void;
  onSubmit: () => void;
};

export function ReviewScreen({
  answers,
  submitting,
  onEditQuestion,
  onSubmit
}: ReviewScreenProps) {
  const canSubmit = allRequiredQuestionsAnswered(answers);

  return (
    <main className="review-screen">
      <div className="review-heading">
        <span>Финальная проверка</span>
        <h1>Проверьте профиль перед отправкой</h1>
        <p>
          На этом экране собраны все разделы анкеты. Незаполненные обязательные блоки
          нужно открыть и завершить перед отправкой на проверку.
        </p>
      </div>

      <div className="review-grid">
        {questionnaire.sections.map((section) => {
          const status = getSectionStatus(section, answers, true);
          const questions = getQuestionsForSection(section.id);
          const incompleteQuestionId = getFirstIncompleteQuestionId(section.id, answers);
          const firstQuestionId = questions[0]?.id ?? incompleteQuestionId;

          return (
            <section className={`review-card status-${status}`} key={section.id}>
              <div className="review-card-top">
                <div>
                  <small>Раздел {section.order}</small>
                  <h2>{section.title}</h2>
                </div>
                <span className="review-status">
                  {status === "ready" ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
                  {status === "ready" ? "Готов" : "Требует проверки"}
                </span>
              </div>

              <ul className="review-summary">
                {questions.map((question) => (
                  <li key={question.id}>
                    <span>{question.title}</span>
                    <strong>{formatAnswerSummary(question, answers[question.id])}</strong>
                  </li>
                ))}
              </ul>

              <div className="review-card-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onEditQuestion(firstQuestionId)}
                >
                  <Eye size={17} />
                  Посмотреть
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onEditQuestion(incompleteQuestionId)}
                >
                  <Pencil size={17} />
                  Редактировать
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="submit-panel">
        <div>
          <strong>{canSubmit ? "Профиль готов к отправке" : "Есть незаполненные блоки"}</strong>
          <p>
            {canSubmit
              ? "После отправки профиль перейдёт на проверку HR."
              : "Заполните обязательные блоки, отмеченные статусом «требует проверки»."}
          </p>
        </div>
        <button type="button" className="primary-button" disabled={!canSubmit || submitting} onClick={onSubmit}>
          <Send size={18} />
          {submitting ? "Отправка..." : "Отправить профиль на проверку"}
        </button>
      </div>
    </main>
  );
}
