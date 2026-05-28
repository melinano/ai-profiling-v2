# Web MVP Handoff For A Fresh Repository

This document is a concise handoff for rebuilding the web MVP in a new
repository.

## Product Intent

The web MVP is a guided corporate questionnaire for university position
profiling. It is not an AI chat and should not ask AI-generated follow-up
questions in the first version.

Main flow:

```text
Open profile
-> fill 9 questionnaire sections
-> save draft
-> review all sections
-> submit profile for HR review
```

## What Was Built

Implemented in the current repository under `apps/web`:

- Bun + React + TypeScript + Vite web app;
- minimal Bun API for draft load/save/submit;
- static questionnaire schema in `src/data/questionnaire.ts`;
- reusable questionnaire types in `src/types/questionnaire.ts`;
- documented JSON answer contract in `docs/interview-answer-json.md`;
- baseline machine-readable JSON Schema in
  `docs/schemas/interview-answer-payload.schema.json`;
- guided wizard shell with section navigation and status calculation;
- Section 1 rendered as a combined page with all general-information questions;
- other sections rendered one logical block at a time;
- final review screen with section summaries;
- browser localStorage draft persistence;
- in-memory API placeholder for draft persistence;
- static right-side help panel;
- field-level contextual help that changes on focus/hover;
- conditional fields and conditional card lists;
- repeatable cards for responsibilities, reports, interactions, and funding;
- exclusive multi-choice behavior for options such as "Не применимо" and
  "Не требуется...";
- explicit local validation for required questionnaire blocks: when navigation
  is blocked, the exact question/card is highlighted and receives an inline
  instruction explaining what the user must do next;
- simplified Section 7 as two long-text fields;
- conditional experience fields in Section 8:
  - professional experience description appears only when experience is
    required;
  - management experience description appears only when management experience
    is required.

## Source Artifacts Used

Primary source of truth:

- `docs/profiling-questionnaire.md` — approved questionnaire structure, section
  IDs, question IDs, prompts, fields, options, examples, and UX notes.
- `docs/web-app-todo.md` — web-app backlog: schemas, PostgreSQL persistence,
  auth, invitation links, employee/reviewer UI, and profile-agent integration
  points.

Product clarification used during implementation:

- profiling should be a guided approved form, not a full AI dialogue;
- the right panel is static help, not an AI assistant;
- Section 1 should be one page;
- "Затрудняюсь ответить/указать" should not be used;
- internal and external interaction blocks should follow the same yes/no
  pattern;
- Section 7 should be simple text fields, not decision cards;
- experience guidance should mention team size, project complexity, resources,
  budgets, and management scope.

Supporting project context:

- `AGENTS.md` — overall architecture, separation of Bun/React product layer and
  Python LLM/pipeline layer;
- `docs/mvp-roadmap.md` — MVP boundaries and build order;
- `docs/web-mvp.md` — implementation notes and TODOs;
- `docs/development-log.md` — change history and implementation decisions.

## Technology Used

Frontend:

- React 18;
- TypeScript;
- Vite;
- plain CSS;
- `lucide-react` for icons.
- TypeScript types for the current answer contract. Zod/Pydantic schemas should
  be added as mirrors of `docs/interview-answer-json.md`.

Runtime/API:

- Bun;
- Bun.serve for a minimal local API;
- browser `localStorage` as offline-safe draft fallback.

Verification:

- `bun run check`;
- `bun run build`;
- `uv run --group test pytest` for existing Python repo regression checks;
- Browser plugin / in-app browser for visual feedback and DOM-level checks.

## Skills And Feedback Loop

The most useful workflow was:

- use the Browser/in-app browser skill after frontend changes;
- keep the app running locally and verify the exact user-visible screen;
- use browser comments as concrete visual feedback;
- make small UI corrections and immediately re-check in the browser;
- use screenshots/DOM measurements for layout issues such as field alignment,
  spacing, and conditional visibility;
- keep product decisions recorded in Markdown after each meaningful change.

Recommended instruction for the next agent:

```text
After meaningful frontend changes, open the local app in the in-app browser,
verify the affected workflow visually, and use DOM/screenshot checks for layout
or conditional-rendering behavior. Treat browser comments as high-priority UI
feedback. Keep docs updated with product decisions and implementation notes.
```

## Suggested New Repo Structure

```text
apps/
  web/
    src/
      components/
      data/
      lib/
      server/
      styles/
      types/
docs/
  profiling-questionnaire.md
  web-mvp.md
  web-mvp-handoff.md
```

Core files to recreate:

- `src/data/questionnaire.ts` — source schema for the MVP UI;
- `src/types/questionnaire.ts` — schema and answer types;
- `src/lib/questionnaire.ts` — progress, validation, status, summary helpers;
- `src/components/QuestionRenderer.tsx` — input rendering;
- `src/components/HelpPanel.tsx` — contextual static help;
- `src/components/ProgressNav.tsx` — section navigation;
- `src/components/ReviewScreen.tsx` — final review;
- `src/lib/draftStorage.ts` — local/remote draft persistence;
- `src/server/server.ts` — temporary Bun API.

## Recommendations For The Fresh Repo

- Keep the questionnaire schema data-driven. Do not hardcode question behavior
  directly inside page components.
- Consider storing the questionnaire schema as JSON or JSON-compatible
  TypeScript so backend validation can share the same source of truth.
- Keep a strict submitted-answer schema separate from a permissive draft schema.
- Mirror the documented answer JSON contract in TypeScript/Zod and Python
  Pydantic before using answers in LLM flows.
- Replace in-memory API persistence early with PostgreSQL tables for:
  - profiling sessions;
  - answers;
  - section statuses;
  - draft/submitted state;
  - audit timestamps.
- Add authentication/session ownership before storing real employee answers.
- Keep the Python LLM/pipeline layer separate from the Bun product backend.
- Do not introduce AI follow-ups, answer rewriting, or document comparison into
  the first questionnaire UI.
- Add tests around:
  - section status calculation;
  - conditional field visibility;
  - exclusive multi-choice behavior;
  - draft save/restore;
  - final review completeness.
- Preserve field-level help and examples. They were important for usability.
- Keep Section 1 as a combined page, but keep the other sections as wizard
  blocks unless product review changes that decision.
- Use the same explicit validation pattern everywhere the user can be blocked:
  highlight the exact question or card, show an inline error inside that block,
  scroll/focus there when practical, and make the instruction actionable. For
  conditional card lists, say that the user must either add and complete a card
  or switch the answer to "Нет". Avoid only showing a generic bottom status or
  silently disabling progress.
