import { ArrowLeft, ArrowRight, ClipboardCheck, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HelpPanel } from "./components/HelpPanel";
import { ProgressNav } from "./components/ProgressNav";
import { QuestionRenderer } from "./components/QuestionRenderer";
import { ReviewScreen } from "./components/ReviewScreen";
import { questionnaire } from "./data/questionnaire";
import {
  firstQuestionId,
  getFirstQuestionForSection,
  getNextQuestionId,
  getPreviousQuestionId,
  getQuestionById,
  getQuestionsForSection,
  getRequiredProgress,
  getSectionById
} from "./lib/questionnaire";
import {
  getOrCreateProfileId,
  loadLocalDraft,
  loadRemoteDraft,
  saveLocalDraft,
  saveRemoteDraft,
  submitRemoteDraft
} from "./lib/draftStorage";
import type { AnswersState, AnswerValue, DraftPayload, HelpContent } from "./types/questionnaire";

const today = new Date().toISOString().slice(0, 10);

function createInitialAnswers(): AnswersState {
  return {
    section_1_completion_date: today
  };
}

export function App() {
  const [profileId] = useState(() => getOrCreateProfileId());
  const [answers, setAnswers] = useState<AnswersState>(() => {
    const localDraft = loadLocalDraft(getOrCreateProfileId());
    return {
      ...createInitialAnswers(),
      ...(localDraft?.answers ?? {})
    };
  });
  const [currentQuestionId, setCurrentQuestionId] = useState(() => {
    const localDraft = loadLocalDraft(getOrCreateProfileId());
    return normalizeQuestionId(localDraft?.currentQuestionId);
  });
  const [reviewMode, setReviewMode] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "submitted" | "error">("idle");
  const [activeHelp, setActiveHelp] = useState<HelpContent | null>(null);

  const currentQuestion = getQuestionById(currentQuestionId);
  const currentSection = getSectionById(currentQuestion.sectionId);
  const progress = useMemo(() => getRequiredProgress(answers), [answers]);
  const sectionQuestions = getQuestionsForSection(currentSection.id);
  const isCombinedSectionPage = currentSection.id === "section_1";
  const previousQuestionId = isCombinedSectionPage
    ? getPreviousQuestionId(sectionQuestions[0]?.id ?? currentQuestionId)
    : getPreviousQuestionId(currentQuestionId);
  const nextQuestionId = isCombinedSectionPage
    ? getNextQuestionId(sectionQuestions[sectionQuestions.length - 1]?.id ?? currentQuestionId)
    : getNextQuestionId(currentQuestionId);
  const currentHelp = activeHelp ?? helpFromQuestion(currentQuestion);

  useEffect(() => {
    let active = true;

    loadRemoteDraft(profileId)
      .then((remoteDraft) => {
        if (!active || !remoteDraft?.answers) {
          return;
        }

        setAnswers({
          ...createInitialAnswers(),
          ...remoteDraft.answers
        });
        setCurrentQuestionId(normalizeQuestionId(remoteDraft.currentQuestionId));
      })
      .catch(() => {
        // Local storage remains the offline-safe draft source for the MVP UI.
      });

    return () => {
      active = false;
    };
  }, [profileId]);

  useEffect(() => {
    const payload = createDraftPayload(profileId, answers, currentQuestionId);
    saveLocalDraft(payload);
  }, [answers, currentQuestionId, profileId]);

  useEffect(() => {
    setActiveHelp(null);
  }, [currentQuestionId]);

  function updateAnswer(questionId: string, value: AnswerValue) {
    setAnswers((current) => ({
      ...current,
      [questionId]: value
    }));
    setSaveState("idle");
  }

  async function saveDraft() {
    setSaveState("saving");
    const payload = createDraftPayload(profileId, answers, currentQuestionId);
    saveLocalDraft(payload);

    try {
      await saveRemoteDraft(payload);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function submitProfile() {
    setSubmitting(true);
    setSubmitState("idle");

    try {
      await saveDraft();
      await submitRemoteDraft(profileId, answers, currentQuestionId);
      setSubmitState("submitted");
    } catch {
      setSubmitState("error");
    } finally {
      setSubmitting(false);
    }
  }

  function goToSection(sectionId: string) {
    setReviewMode(false);
    setCurrentQuestionId(getFirstQuestionForSection(sectionId).id);
  }

  function goToQuestion(questionId: string) {
    setReviewMode(false);
    setCurrentQuestionId(questionId);
  }

  if (reviewMode) {
    return (
      <div className="app-shell review-layout">
        <ProgressNav
          answers={answers}
          currentSectionId={currentSection.id}
          readyMode={reviewMode}
          onSectionSelect={goToSection}
        />
        <ReviewScreen
          answers={answers}
          submitting={submitting}
          onEditQuestion={goToQuestion}
          onSubmit={submitProfile}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <ProgressNav
        answers={answers}
        currentSectionId={currentSection.id}
        readyMode={false}
        onSectionSelect={goToSection}
      />

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-kicker">
              Раздел {currentSection.order} из {questionnaire.sections.length}
            </span>
            <h1>{currentSection.title}</h1>
            <p>{currentSection.description}</p>
          </div>
          <div className="progress-meter" aria-label="Прогресс заполнения">
            <span>{progress.percent}%</span>
            <div>
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <small>
              {progress.answered} из {progress.total} обязательных блоков
            </small>
          </div>
        </header>

        {isCombinedSectionPage ? (
          <section className="question-panel section-page-panel">
            <div className="question-meta">
              <span>Обязательные и уточняющие поля</span>
              <span>
                Блоки {currentQuestionIndex(sectionQuestions[0].id) + 1}-
                {currentQuestionIndex(sectionQuestions[sectionQuestions.length - 1].id) + 1} из{" "}
                {questionnaire.questions.length}
              </span>
            </div>
            <h2>{currentSection.title}</h2>
            <p className="question-purpose">{currentSection.description}</p>

            <div className="section-question-list">
              {sectionQuestions.map((question) => (
                <article className="subquestion-panel" key={question.id}>
                  <div className="question-meta">
                    <span>{question.required ? "Обязательно" : "Необязательно"}</span>
                    <span>Раздел 1.{sectionQuestions.indexOf(question) + 1}</span>
                  </div>
                  <h3>{question.title}</h3>
                  <p className="question-purpose">{question.purpose}</p>
                  <p className="question-prompt">{question.prompt}</p>
                  <QuestionRenderer
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) => updateAnswer(question.id, value)}
                    onHelpChange={setActiveHelp}
                  />
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="question-panel">
            <div className="question-meta">
              <span>{currentQuestion.required ? "Обязательно" : "Необязательно"}</span>
              <span>
                Блок {currentQuestionIndex(currentQuestionId) + 1} из{" "}
                {questionnaire.questions.length}
              </span>
            </div>
            <h2>{currentQuestion.title}</h2>
            <p className="question-purpose">{currentQuestion.purpose}</p>
            <p className="question-prompt">{currentQuestion.prompt}</p>

            <QuestionRenderer
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={(value) => updateAnswer(currentQuestion.id, value)}
              onHelpChange={setActiveHelp}
            />

            {currentQuestion.minRecommendedItems || currentQuestion.maxRecommendedItems ? (
              <p className="recommendation">
                Рекомендуемое количество: {currentQuestion.minRecommendedItems ?? "1"}-
                {currentQuestion.maxRecommendedItems ?? "без ограничения"} карточек.
              </p>
            ) : null}
          </section>
        )}

        <footer className="action-bar">
          <button
            type="button"
            className="secondary-button"
            disabled={!previousQuestionId}
            onClick={() => previousQuestionId && setCurrentQuestionId(previousQuestionId)}
          >
            <ArrowLeft size={18} />
            Назад
          </button>
          <button type="button" className="secondary-button" onClick={saveDraft}>
            <Save size={18} />
            Сохранить черновик
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (nextQuestionId) {
                setCurrentQuestionId(nextQuestionId);
              } else {
                setReviewMode(true);
              }
            }}
          >
            {nextQuestionId ? (
              <>
                Далее
                <ArrowRight size={18} />
              </>
            ) : (
              <>
                К проверке
                <ClipboardCheck size={18} />
              </>
            )}
          </button>
        </footer>

        <StatusLine saveState={saveState} submitState={submitState} />
      </main>

      <HelpPanel help={currentHelp} />
    </div>
  );
}

function StatusLine({
  saveState,
  submitState
}: {
  saveState: "idle" | "saving" | "saved" | "error";
  submitState: "idle" | "submitted" | "error";
}) {
  if (submitState === "submitted") {
    return <div className="status-line success">Профиль отправлен на проверку.</div>;
  }

  if (submitState === "error") {
    return (
      <div className="status-line error">
        Не удалось отправить профиль. Черновик сохранён локально.
      </div>
    );
  }

  if (saveState === "saving") {
    return <div className="status-line">Сохранение черновика...</div>;
  }

  if (saveState === "saved") {
    return <div className="status-line success">Черновик сохранён.</div>;
  }

  if (saveState === "error") {
    return (
      <div className="status-line error">
        Сервер черновиков недоступен. Изменения сохранены в браузере.
      </div>
    );
  }

  return null;
}

function createDraftPayload(
  profileId: string,
  answers: AnswersState,
  currentQuestionId: string
): DraftPayload {
  return {
    profileId,
    answers,
    currentQuestionId,
    updatedAt: new Date().toISOString()
  };
}

function currentQuestionIndex(questionId: string): number {
  return questionnaire.questions.findIndex((question) => question.id === questionId);
}

function normalizeQuestionId(questionId: string | undefined): string {
  if (!questionId) {
    return firstQuestionId;
  }

  return questionnaire.questions.some((question) => question.id === questionId)
    ? questionId
    : firstQuestionId;
}

function helpFromQuestion(question: { title: string; help: string; example?: string; helpHint?: string }) {
  return {
    title: question.title,
    body: question.help,
    example: question.example,
    hint: question.helpHint
  };
}
