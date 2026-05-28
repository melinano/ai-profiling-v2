import { AlertCircle, ArrowLeft, ArrowRight, ClipboardCheck, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutocompleteInput } from "./components/AutocompleteInput";
import { DerivedOrgPathDisplay } from "./components/DerivedOrgPathDisplay";
import { HelpPanel } from "./components/HelpPanel";
import { InvitationStartScreen } from "./components/InvitationStartScreen";
import { ProgressNav } from "./components/ProgressNav";
import { QuestionRenderer } from "./components/QuestionRenderer";
import { ReviewScreen } from "./components/ReviewScreen";
import { questionnaire } from "./data/questionnaire";
import { loadPositionContext, searchPositions } from "./lib/directoryApi";
import {
  firstQuestionId,
  getFirstQuestionForSection,
  getNextQuestionId,
  getPreviousQuestionId,
  getQuestionById,
  getQuestionsForSection,
  getRequiredProgress,
  getSectionById,
  isQuestionAnswered
} from "./lib/questionnaire";
import {
  getOrCreateProfileId,
  loadLocalDraft,
  loadRemoteDraft,
  saveLocalDraft,
  saveRemoteDraft,
  setStoredProfileId,
  submitRemoteDraft
} from "./lib/draftStorage";
import type { PositionContext, PositionSuggestion } from "./types/directory";
import type { InvitationStartResult } from "./types/invitation";
import type {
  AnswersState,
  AnswerValue,
  CardAnswer,
  ConditionalAnswer,
  DraftPayload,
  HelpContent,
  QuestionConfig
} from "./types/questionnaire";

const today = new Date().toISOString().slice(0, 10);

type ValidationIssue = {
  question: QuestionConfig;
  questionId: string;
  message: string;
};

function createInitialAnswers(): AnswersState {
  return {
    section_1_completion_date: today
  };
}

export function App() {
  const [invitationToken, setInvitationToken] = useState(() => getInvitationToken());
  const [needsInvitationStart, setNeedsInvitationStart] = useState(() => Boolean(getInvitationToken()));
  const [profileId, setProfileId] = useState(() => getOrCreateProfileId());
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
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const [activeHelp, setActiveHelp] = useState<HelpContent | null>(null);
  const selectedPositionIdRef = useRef<string | null>(null);

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
    if (needsInvitationStart) {
      return;
    }

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
  }, [needsInvitationStart, profileId]);

  useEffect(() => {
    const payload = createDraftPayload(profileId, answers, currentQuestionId);
    saveLocalDraft(payload);
  }, [answers, currentQuestionId, profileId]);

  useEffect(() => {
    setActiveHelp(null);
  }, [currentQuestionId]);

  useEffect(() => {
    if (!validationIssue) {
      return;
    }

    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>(
        `[data-question-id="${validationIssue.questionId}"]`
      );
      if (!panel) {
        return;
      }

      panel.scrollIntoView({ block: "center", behavior: "smooth" });
      const focusTarget = panel.querySelector<HTMLElement>(
        ".add-card-button, input:not([disabled]), textarea:not([disabled]), button:not([disabled])"
      );
      focusTarget?.focus({ preventScroll: true });
    }, 0);
  }, [validationIssue]);

  function updateAnswer(questionId: string, value: AnswerValue) {
    setAnswers((current) => ({
      ...current,
      [questionId]: value
    }));
    setSaveState("idle");
    clearValidation();
  }

  function updateAnswers(patch: AnswersState) {
    setAnswers((current) => ({
      ...current,
      ...patch
    }));
    setSaveState("idle");
    clearValidation();
  }

  function clearValidation() {
    setValidationMessage(null);
    setValidationIssue(null);
  }

  function handleInvitationStarted(result: InvitationStartResult) {
    setStoredProfileId(result.profileId);
    saveLocalDraft(result.draft);
    setProfileId(result.profileId);
    setAnswers({
      ...createInitialAnswers(),
      ...(result.draft.answers ?? {})
    });
    setCurrentQuestionId(normalizeQuestionId(result.draft.currentQuestionId));
    setReviewMode(false);
    setSubmitState("idle");
    setSaveState("saved");
    setNeedsInvitationStart(false);
    setInvitationToken(null);
    window.history.replaceState(null, "", window.location.pathname);
  }

  const loadPositionOptions = useCallback((query: string) => searchPositions(query), []);

  function handlePositionTextChange(value: string) {
    selectedPositionIdRef.current = null;
    updateAnswers({
      section_1_position_title: value,
      section_1_org_path: "",
      section_1_admin_manager: "",
      section_1_direct_reports: undefined,
      section_1_total_reports: ""
    });
  }

  async function selectPosition(position: PositionSuggestion) {
    selectedPositionIdRef.current = position.id;
    updateAnswers({
      section_1_position_title: position.title,
      section_1_org_path: position.orgUnit.fullPath
    });

    const context = await loadPositionContext(position.id);
    if (!context || selectedPositionIdRef.current !== position.id) {
      return;
    }

    updateAnswers(buildContextPatch(context));
  }

  function handleFieldPositionSelect(
    context: { cardIndex?: number; question: { id: string }; field: { name: string } },
    position: PositionSuggestion
  ) {
    if (
      context.question.id === "section_1_functional_manager" &&
      context.field.name === "functional_manager_position"
    ) {
      setAnswers((current) => {
        const currentValue = isRecord(current.section_1_functional_manager)
          ? current.section_1_functional_manager
          : {};
        const currentDetails = isRecord(currentValue.details) ? currentValue.details : {};

        return {
          ...current,
          section_1_functional_manager: {
            ...currentValue,
            choice: "different",
            details: {
              ...currentDetails,
              functional_manager_position: position.title,
              functional_manager_department: position.orgUnit.fullPath
            }
          }
        };
      });
      setSaveState("idle");
      return;
    }

    if (
      context.question.id === "section_1_direct_reports" &&
      context.field.name === "subordinate_position" &&
      typeof context.cardIndex === "number"
    ) {
      updateConditionalCardPositionMeta("section_1_direct_reports", context.cardIndex, {
        subordinate_position: formatPositionLabel(position),
        count: formatCount(position.occupiedFte),
        count_occupied_fte: formatFte(position.occupiedFte)
      });
      return;
    }

    if (
      context.question.id === "section_1_functional_reports" &&
      context.field.name === "position_or_department" &&
      typeof context.cardIndex === "number"
    ) {
      updateConditionalCardPositionMeta("section_1_functional_reports", context.cardIndex, {
        position_or_department: formatPositionLabel(position),
        count: formatCount(position.occupiedFte),
        count_occupied_fte: formatFte(position.occupiedFte)
      });
    }
  }

  function updateConditionalCardPositionMeta(
    questionId: "section_1_direct_reports" | "section_1_functional_reports",
    cardIndex: number,
    patch: Record<string, string>
  ) {
    setAnswers((current) => {
      const currentValue = isRecord(current[questionId]) ? current[questionId] : {};
      const cards = Array.isArray(currentValue.details)
        ? currentValue.details.filter((item): item is CardAnswer => isRecord(item))
        : [];
      const nextDetails: CardAnswer[] = cards.map((card, index) =>
        index === cardIndex
          ? {
              ...card,
              ...patch
            }
          : card
      );

      return {
        ...current,
        [questionId]: {
          ...currentValue,
          choice: "yes",
          details: nextDetails
        }
      };
    });
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
    const issue = getCurrentStepValidationIssue();
    if (!reviewMode && sectionId !== currentSection.id && issue) {
      showValidationIssue(issue);
      return;
    }

    setReviewMode(false);
    clearValidation();
    setCurrentQuestionId(getFirstQuestionForSection(sectionId).id);
  }

  function goToQuestion(questionId: string) {
    setReviewMode(false);
    clearValidation();
    setCurrentQuestionId(questionId);
  }

  function handleNextStep() {
    const issue = getCurrentStepValidationIssue();
    if (issue) {
      showValidationIssue(issue);
      return;
    }

    clearValidation();
    if (nextQuestionId) {
      setCurrentQuestionId(nextQuestionId);
    } else {
      setReviewMode(true);
    }
  }

  function showValidationIssue(issue: ValidationIssue) {
    setValidationIssue(issue);
    setValidationMessage(issue.message);
    setActiveHelp(helpFromQuestion(issue.question));
  }

  function getCurrentStepValidationIssue(): ValidationIssue | null {
    const questionsToCheck = isCombinedSectionPage ? sectionQuestions : [currentQuestion];
    const invalidQuestion = questionsToCheck.find(
      (question) => question.required && !isQuestionAnswered(question, answers[question.id])
    );

    return invalidQuestion
      ? {
          question: invalidQuestion,
          questionId: invalidQuestion.id,
          message: getValidationMessage(invalidQuestion, answers[invalidQuestion.id])
        }
      : null;
  }

  if (invitationToken && needsInvitationStart) {
    return <InvitationStartScreen token={invitationToken} onStarted={handleInvitationStarted} />;
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
              {sectionQuestions.map((question) => {
                const issue =
                  validationIssue?.questionId === question.id ? validationIssue : null;

                return (
                  <article
                    className={`subquestion-panel ${issue ? "validation-error-panel" : ""}`}
                    data-question-id={question.id}
                    key={question.id}
                  >
                    <div className="question-meta">
                      <span>{question.required ? "Обязательно" : "Необязательно"}</span>
                      <span>Раздел 1.{sectionQuestions.indexOf(question) + 1}</span>
                    </div>
                    <h3>{question.title}</h3>
                    <p className="question-purpose">{question.purpose}</p>
                    <p className="question-prompt">{question.prompt}</p>
                    {issue ? <ValidationCallout message={issue.message} /> : null}
                    <QuestionRenderer
                      question={question}
                      value={answers[question.id]}
                      onChange={(value) => updateAnswer(question.id, value)}
                      onHelpChange={setActiveHelp}
                      renderQuestionInput={renderQuestionInput}
                      onFieldPositionSelect={handleFieldPositionSelect}
                    />
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section
            className={`question-panel ${
              validationIssue?.questionId === currentQuestion.id ? "validation-error-panel" : ""
            }`}
            data-question-id={currentQuestion.id}
          >
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
            {validationIssue?.questionId === currentQuestion.id ? (
              <ValidationCallout message={validationIssue.message} />
            ) : null}

            <QuestionRenderer
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={(value) => updateAnswer(currentQuestion.id, value)}
              onHelpChange={setActiveHelp}
              renderQuestionInput={renderQuestionInput}
              onFieldPositionSelect={handleFieldPositionSelect}
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
            onClick={handleNextStep}
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

        <StatusLine
          saveState={saveState}
          submitState={submitState}
          validationMessage={validationMessage}
        />
      </main>

      <HelpPanel help={currentHelp} />
    </div>
  );

  function renderQuestionInput(question: { id: string; placeholder?: string }) {
    if (question.id === "section_1_position_title") {
      return (
        <AutocompleteInput<PositionSuggestion>
          value={typeof answers.section_1_position_title === "string" ? answers.section_1_position_title : ""}
          ariaLabel="Наименование должности"
          placeholder={question.placeholder}
          onChange={handlePositionTextChange}
          onSelect={selectPosition}
          loadOptions={loadPositionOptions}
          getOptionKey={(position) => position.id}
          renderOption={(position) => (
            <>
              <strong>{position.title}</strong>
              <small>{position.orgUnit.fullPath}</small>
            </>
          )}
          getSelectedDisplay={(position) => ({ title: position.title })}
          selectedDisplayValue={getSelectedPositionTitleDisplay(
            answers.section_1_position_title,
            answers.section_1_org_path
          )}
          emptyText="Должности не найдены"
        />
      );
    }

    if (question.id === "section_1_org_path") {
      return (
        <DerivedValueField
          value={typeof answers.section_1_org_path === "string" ? answers.section_1_org_path : ""}
          label="Принадлежность к организационной структуре"
          placeholder="Заполнится после выбора должности"
          orgPath
        />
      );
    }

    if (question.id === "section_1_admin_manager") {
      return (
        <AutocompleteInput<PositionSuggestion>
          value={
            typeof answers.section_1_admin_manager === "string"
              ? answers.section_1_admin_manager
              : ""
          }
          ariaLabel="Административный руководитель"
          placeholder={question.placeholder}
          onChange={(value) => updateAnswer("section_1_admin_manager", value)}
          onSelect={(position) =>
            updateAnswer("section_1_admin_manager", formatPositionLabel(position))
          }
          loadOptions={(query) => searchPositions(query)}
          getOptionKey={(position) => position.id}
          renderOption={(position) => (
            <>
              <strong>{position.title}</strong>
              <small>{position.orgUnit.fullPath}</small>
            </>
          )}
          getSelectedDisplay={(position) => ({
            title: position.title,
            meta: position.orgUnit.fullPath
          })}
          selectedDisplayValue={getSelectedPositionDisplayFromLabel(
            typeof answers.section_1_admin_manager === "string"
              ? answers.section_1_admin_manager
              : ""
          )}
          emptyText="Руководящие должности не найдены"
        />
      );
    }

    if (question.id === "section_1_direct_reports") {
      return (
        <ReadOnlyDirectReports
          value={isRecord(answers.section_1_direct_reports) ? answers.section_1_direct_reports : undefined}
          positionSelected={
            typeof answers.section_1_position_title === "string" &&
            typeof answers.section_1_org_path === "string" &&
            answers.section_1_position_title.trim().length > 0 &&
            answers.section_1_org_path.trim().length > 0
          }
          onCountChange={(cardIndex, count) =>
            updateConditionalCardPositionMeta("section_1_direct_reports", cardIndex, {
              count
            })
          }
        />
      );
    }

    if (question.id === "section_1_total_reports") {
      return (
        <CountInputWithFte
          value={typeof answers.section_1_total_reports === "string" ? answers.section_1_total_reports : ""}
          occupiedFte={
            typeof answers.section_1_total_reports_occupied_fte === "string"
              ? answers.section_1_total_reports_occupied_fte
              : ""
          }
          label="Все подчинённые в подразделении"
          placeholder={question.placeholder}
          onChange={(value) => updateAnswer("section_1_total_reports", value)}
        />
      );
    }

    return null;
  }
}

function StatusLine({
  saveState,
  submitState,
  validationMessage
}: {
  saveState: "idle" | "saving" | "saved" | "error";
  submitState: "idle" | "submitted" | "error";
  validationMessage: string | null;
}) {
  if (validationMessage) {
    return <div className="status-line warning">{validationMessage}</div>;
  }

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

function ValidationCallout({ message }: { message: string }) {
  return (
    <div className="validation-callout" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Нужно исправить этот блок</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function DerivedValueField({
  value,
  label,
  placeholder,
  orgPath = false
}: {
  value: string;
  label: string;
  placeholder: string;
  orgPath?: boolean;
}) {
  if (orgPath) {
    return <DerivedOrgPathDisplay value={value} label={label} placeholder={placeholder} />;
  }

  return (
    <input
      type="text"
      className="derived-field"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      readOnly
    />
  );
}

function CountInputWithFte({
  value,
  occupiedFte,
  label,
  placeholder,
  onChange
}: {
  value: string;
  occupiedFte: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="count-field">
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {occupiedFte ? (
        <span className="field-help">
          {formatEmployeeCountLabel(value)}; занято {occupiedFte} {getFteWord(occupiedFte)}
        </span>
      ) : null}
    </div>
  );
}

function ReadOnlyDirectReports({
  value,
  positionSelected,
  onCountChange
}: {
  value: ConditionalAnswer | undefined;
  positionSelected: boolean;
  onCountChange: (cardIndex: number, count: string) => void;
}) {
  const cards = Array.isArray(value?.details) ? value.details.filter(isRecord) : [];

  if (!positionSelected) {
    return (
      <div className="readonly-report-empty">
        Подчинённые загрузятся из оргструктуры после выбора должности.
      </div>
    );
  }

  if (value?.choice !== "yes" || cards.length === 0) {
    return (
      <div className="readonly-report-empty">
        По справочнику для выбранной должности прямые административные подчинённые не найдены.
      </div>
    );
  }

  return (
    <div className="readonly-report-list" aria-label="Прямые административные подчинённые">
      {cards.map((card, index) => {
        const positionValue =
          typeof card.subordinate_position === "string" ? card.subordinate_position : "";
        const parsedPosition: { title: string; meta?: string } =
          getSelectedPositionDisplayFromLabel(positionValue) ?? {
            title: positionValue
          };
        const count = typeof card.count === "string" ? card.count : "";
        const occupiedFte =
          typeof card.count_occupied_fte === "string" ? card.count_occupied_fte : "";

        return (
          <div className="readonly-report-card" key={`${positionValue}-${index}`}>
            <div className="readonly-report-position">
              <strong>{parsedPosition.title}</strong>
              {parsedPosition.meta ? <small>{parsedPosition.meta}</small> : null}
            </div>
            <div className="readonly-report-count">
              <CountInputWithFte
                value={count}
                occupiedFte={occupiedFte}
                label={`Количество сотрудников: ${parsedPosition.title}`}
                onChange={(nextCount) => onCountChange(index, nextCount)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
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

function getInvitationToken(): string | null {
  return new URLSearchParams(window.location.search).get("invite");
}

function buildContextPatch(context: PositionContext): AnswersState {
  return {
    section_1_position_title: context.position.title,
    section_1_org_path: context.position.orgUnit.fullPath,
    section_1_admin_manager: context.adminManager ? formatPositionLabel(context.adminManager) : "",
    section_1_direct_reports:
      context.directReports.length > 0
        ? {
            choice: "yes",
            details: context.directReports.map((report) => ({
              subordinate_position: formatReportLabel(report),
              count: formatCount(report.count),
              count_occupied_fte: formatFte(report.occupiedFte)
            }))
          }
        : {
            choice: "no",
            details: undefined
          },
    section_1_total_reports: formatCount(context.totalSubordinateCount),
    section_1_total_reports_occupied_fte: formatFte(context.totalSubordinateOccupiedFte)
  };
}

function formatPositionLabel(position: PositionSuggestion): string {
  return `${position.title} — ${position.orgUnit.fullPath}`;
}

function getSelectedPositionTitleDisplay(
  titleValue: AnswerValue | undefined,
  orgPathValue: AnswerValue | undefined
) {
  if (typeof titleValue !== "string" || typeof orgPathValue !== "string") {
    return null;
  }

  if (!titleValue.trim() || !orgPathValue.trim()) {
    return null;
  }

  return { title: titleValue };
}

function getSelectedPositionDisplayFromLabel(value: string) {
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

function formatReportLabel(report: { title: string; orgUnit: { fullPath: string } }): string {
  return `${report.title} — ${report.orgUnit.fullPath}`;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return String(Math.ceil(Math.max(value, 0)));
}

function formatFte(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  }).format(Math.round(Math.max(value, 0) * 100) / 100);
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
  const normalized = value.replace(",", ".");
  return Number(normalized) === 1 ? "ставка" : "ставки";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getValidationMessage(question: QuestionConfig, value: AnswerValue | undefined): string {
  if (question.type === "conditional") {
    if (!isRecord(value) || !hasText(value.choice)) {
      return `Выберите один из вариантов в блоке «${question.title}».`;
    }

    const conditional = value as ConditionalAnswer;
    const choiceLabel = getOptionLabel(question, conditional.choice ?? "");
    const detailConfig = question.conditionalDetails?.[conditional.choice ?? ""];

    if (!detailConfig) {
      return `Проверьте выбранный вариант в блоке «${question.title}».`;
    }

    if (detailConfig.type === "card_list") {
      const negativeLabel =
        question.options?.find((option) => option.label.toLowerCase().startsWith("нет"))
          ?.label ?? "Нет";
      const hasCards = Array.isArray(conditional.details) && conditional.details.length > 0;

      if (!hasCards) {
        return `Вы выбрали «${choiceLabel}», но не добавили ни одной карточки. Нажмите «${detailConfig.addLabel}» и заполните карточку или выберите «${negativeLabel}».`;
      }

      return `В блоке «${question.title}» есть карточки, но ни одна не заполнена полностью. Заполните обязательные поля хотя бы в одной карточке или выберите «${negativeLabel}».`;
    }

    if (detailConfig.type === "group") {
      return `Вы выбрали «${choiceLabel}». Заполните обязательные поля, которые появились ниже, или выберите другой вариант.`;
    }

    return `Вы выбрали «${choiceLabel}». Заполните появившееся поле ниже или выберите другой вариант.`;
  }

  if (question.type === "card_list") {
    return `Добавьте и заполните хотя бы одну карточку в блоке «${question.title}».`;
  }

  if (question.type === "group") {
    return `Заполните обязательные поля в блоке «${question.title}».`;
  }

  if (question.type === "single_choice" || question.type === "multi_choice") {
    return `Выберите подходящий вариант в блоке «${question.title}».`;
  }

  return `Заполните обязательное поле в блоке «${question.title}».`;
}

function getOptionLabel(question: QuestionConfig, value: string): string {
  return question.options?.find((option) => option.value === value)?.label ?? value;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function helpFromQuestion(question: { title: string; help: string; example?: string; helpHint?: string }) {
  return {
    title: question.title,
    body: question.help,
    example: question.example,
    hint: question.helpHint
  };
}
