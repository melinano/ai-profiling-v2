# JSON-контракт ответов интервью

Этот документ фиксирует текущую структуру JSON, которую веб-анкета сохраняет
как черновик и отправляет как результат заполнения интервью.

Машинно-читаемая базовая схема находится в
`docs/schemas/interview-answer-payload.schema.json`.

Важно: в текущем коде веб-приложения строгой Zod-схемы пока нет. Реальный
контракт сейчас задан типами `apps/web/src/types/questionnaire.ts`, схемой
анкеты `apps/web/src/data/questionnaire.ts` и JSON Schema из этого документа.
Будущие Zod- и Pydantic-схемы должны зеркалить этот контракт.

## Верхний уровень

```json
{
  "profileId": "uuid",
  "currentQuestionId": "section_6_2_internal_interactions",
  "updatedAt": "2026-05-28T12:00:00.000Z",
  "submittedAt": "2026-05-28T12:30:00.000Z",
  "answers": {}
}
```

Поля:

- `profileId` - локальный идентификатор профиля/черновика в MVP. Позже должен
  быть заменён или связан с `interview_runs.id`.
- `currentQuestionId` - вопрос, на котором пользователь остановился. Нужен для
  восстановления незавершённой анкеты.
- `updatedAt` - время последнего сохранения.
- `submittedAt` - появляется только после отправки.
- `answers` - объект ответов, где ключи совпадают с `question.id`.

## Черновик и финальная отправка

Черновик и финальная отправка используют один и тот же JSON-контейнер.
Различие не в форме объекта, а в правилах полноты:

- draft payload может быть частичным: часть ключей отсутствует, строки могут
  быть пустыми, условные блоки могут быть не завершены;
- submitted payload должен пройти проверку обязательных вопросов из
  `questionnaire.ts`;
- на уровне БД этот объект должен попадать в `interview_runs.answers_json`.

Текущая веб-реализация сохраняет черновик:

- автоматически в `localStorage`;
- вручную через временный API `PUT /api/profile-drafts/:profileId`;
- при отправке через `POST /api/profile-drafts/:profileId/submit`.

Серверный API черновиков сейчас временный и хранит данные в памяти процесса.
Для production это нужно заменить записью в PostgreSQL в `interview_runs`.

## Типы значений

### Простое поле

Используется для `short_text`, `long_text`, `number`, `date`,
`single_choice`.

```json
"section_2_position_goal": "Обеспечивать..."
```

Даже числовые поля в текущей анкете сохраняются строкой, потому что UI работает
с HTML input value.

### Множественный выбор или теги

Используется для `multi_choice`, `tag_input`.

```json
"role": ["Согласование", "Контроль соблюдения"]
```

### Группа полей

Используется для `type: "group"`.

```json
"section_4_2_expense_budget": {
  "budget_type": "Иное",
  "budget_type_other_comment": "Целевая субсидия",
  "budget_volume": "Не применимо",
  "management_character": ["Не применимо / не управляю бюджетом"]
}
```

### Список карточек

Используется для `type: "card_list"`.

```json
"section_3_responsibilities": [
  {
    "responsibility": "Координирует портфель проектов",
    "result": "Руководство видит статусы, сроки и риски"
  }
]
```

### Условный блок

Используется для `type: "conditional"`.

```json
"section_6_2_internal_interactions": {
  "choice": "yes",
  "details": [
    {
      "position_or_department": "Подразделение: Ректорат",
      "interaction_topic": "Согласование решений",
      "goal_or_result": "Решения проходят согласование",
      "frequency": "Еженедельно"
    }
  ]
}
```

Если выбран вариант без дополнительных полей:

```json
"section_9_comments": {
  "choice": "no_comments"
}
```

## Текущие ключи `answers`

### Раздел 1. Общая информация

- `section_1_position_title`: string
- `section_1_org_path`: string
- `section_1_admin_manager`: string
- `section_1_functional_manager`: conditional
  - `choice`: `same_as_admin` или `different`
  - `details.functional_manager_position`: string
  - `details.functional_manager_department`: string
- `section_1_direct_reports`: conditional card list
  - card: `subordinate_position`, `count`, `count_occupied_fte`
- `section_1_total_reports`: string
- `section_1_total_reports_occupied_fte`: string, служебная справочная величина
  занятых ставок из базы
- `section_1_functional_reports`: conditional card list
  - card: `position_or_department`, `count`, `count_occupied_fte`,
    `management_character`
- `section_1_completion_date`: string date

### Раздел 2. Цель должности

- `section_2_position_goal`: string

### Раздел 3. Обязанности и функциональные области

- `section_3_responsibilities`: card list
  - card: `responsibility`, `result`

### Раздел 4. Бюджетная ответственность

- `section_4_1_revenue_responsibility`: conditional card list
  - `choice`: `not_applicable` или `yes`
  - card: `funding_source`, `estimated_amount`, `role`
- `section_4_2_expense_budget`: group
  - `budget_type`
  - `budget_type_other_comment`, если `budget_type = "Иное"`
  - `budget_volume`
  - `management_character`: string array

### Раздел 5. Сложность задач и решений

- `section_5_1_task_typicality`: string
- `section_5_2_complex_task_example`: string

### Раздел 6. Коммуникации и взаимодействие

- `section_6_1_external_interactions`: conditional card list
  - card: `organization_or_role`, `interaction_topic`, `goal_or_result`
- `section_6_2_internal_interactions`: conditional card list
  - card: `position_or_department`, `interaction_topic`, `goal_or_result`,
    `frequency`
- `section_6_3_government_interactions`: conditional card list
  - `choice`: `not_applicable` или `yes`
  - card: `government_body`, `topic`, `role`

### Раздел 7. Полномочия и принятие решений

- `section_7_1_independent_decisions`: string
- `section_7_2_approved_decisions`: string

### Раздел 8. Требования к должности

- `section_8_1_education`: string
- `section_8_2_specialization`: string, необязательный
- `section_8_3_certification`: conditional
  - `choice`: `no`, `required`, `optional`
  - `details`: string для `required` или `optional`
- `section_8_4_knowledge_skills`: group
  - `legislation_knowledge`: string array
  - `legislation_knowledge_other`: string, optional
  - `methods_and_practices`: string array
  - `software_and_technologies`: string array
  - `functional_context`: string
- `section_8_5_experience`: group
  - `professional_experience_years`
  - `professional_experience_description`, если опыт требуется
  - `management_experience_required`
  - `management_experience_description`, если управленческий опыт требуется

### Раздел 9. Комментарии

- `section_9_comments`: conditional
  - `choice`: `no_comments` или `has_comments`
  - `details`: string для `has_comments`

## Пример полного payload

```json
{
  "profileId": "7a7f7336-45b8-48af-bd2e-c4bb73198556",
  "currentQuestionId": "section_9_comments",
  "updatedAt": "2026-05-28T12:00:00.000Z",
  "answers": {
    "section_1_position_title": "Программист 2 категории",
    "section_1_org_path": "Институт / Управление / Отдел разработки",
    "section_1_admin_manager": "Начальник отдела — Институт / Управление / Отдел разработки",
    "section_1_functional_manager": {
      "choice": "same_as_admin"
    },
    "section_1_direct_reports": {
      "choice": "no"
    },
    "section_1_total_reports": "0",
    "section_1_completion_date": "2026-05-28",
    "section_2_position_goal": "Разрабатывать и сопровождать внутренние цифровые сервисы университета.",
    "section_3_responsibilities": [
      {
        "responsibility": "Разработка программных модулей",
        "result": "Пользователи получают работающий функционал в срок"
      }
    ],
    "section_4_1_revenue_responsibility": {
      "choice": "not_applicable"
    },
    "section_4_2_expense_budget": {
      "budget_type": "Не применимо",
      "budget_volume": "Не применимо",
      "management_character": ["Не применимо / не управляю бюджетом"]
    },
    "section_5_1_task_typicality": "Типовые с вариациями",
    "section_5_2_complex_task_example": "Интеграция сервиса с устаревшей внутренней системой.",
    "section_6_1_external_interactions": {
      "choice": "no"
    },
    "section_6_2_internal_interactions": {
      "choice": "yes",
      "details": [
        {
          "position_or_department": "Подразделение: Ректорат",
          "interaction_topic": "Согласование требований к сервису",
          "goal_or_result": "Требования утверждены до разработки",
          "frequency": "Ежемесячно"
        }
      ]
    },
    "section_6_3_government_interactions": {
      "choice": "not_applicable"
    },
    "section_7_1_independent_decisions": "Выбирает технический способ реализации в рамках задачи.",
    "section_7_2_approved_decisions": "Изменение сроков релиза и архитектурные решения согласуются с руководителем.",
    "section_8_1_education": "Высшее: бакалавр / специалист / магистр",
    "section_8_2_specialization": "Информационные системы, программная инженерия",
    "section_8_3_certification": {
      "choice": "no"
    },
    "section_8_4_knowledge_skills": {
      "legislation_knowledge": ["Персональные данные"],
      "methods_and_practices": ["Разработка ПО", "Тестирование"],
      "software_and_technologies": ["TypeScript", "PostgreSQL"],
      "functional_context": "Понимание внутренних процессов университета и цифровых сервисов."
    },
    "section_8_5_experience": {
      "professional_experience_years": "От 1 года",
      "professional_experience_description": "Опыт разработки веб-приложений",
      "management_experience_required": "Нет"
    },
    "section_9_comments": {
      "choice": "no_comments"
    }
  }
}
```

## Рекомендуемые блоки `InterviewProfile`

На основании этого JSON разумно формировать не один плоский профиль, а
несколько устойчивых профильных блоков. Это упростит сравнение с
`ExpectedProfile`.

Предлагаемая структура `InterviewProfile.profile_json`:

```json
{
  "position_context": {},
  "purpose": {},
  "responsibilities": [],
  "management_scope": {},
  "budget_responsibility": {},
  "task_complexity": {},
  "communications": {},
  "decision_authority": {},
  "requirements": {},
  "additional_context": {}
}
```

Маппинг:

- `position_context`: раздел 1, должность, оргструктура, руководители.
- `management_scope`: прямые, функциональные и все подчинённые из раздела 1.
- `purpose`: раздел 2.
- `responsibilities`: раздел 3.
- `budget_responsibility`: раздел 4.
- `task_complexity`: раздел 5.
- `communications`: раздел 6.
- `decision_authority`: раздел 7.
- `requirements`: раздел 8.
- `additional_context`: раздел 9.

Для каждого блока профиля желательно сохранять:

- нормализованное значение;
- исходные `answer_keys`, из которых оно получено;
- краткое объяснение преобразования;
- флаг уверенности/полноты, если профиль генерируется через LLM.

## Следующий технический шаг

Нужно добавить две кодовые схемы поверх этого контракта:

1. `DraftAnswerPayload` - permissive-схема для частичного черновика.
2. `SubmittedAnswerPayload` - strict-схема для финальной отправки.

В TypeScript это может быть Zod, в Python - Pydantic. Обе схемы должны
ссылаться на один и тот же перечень question ids и field names, чтобы не было
расхождения между фронтендом, backend API и profile-agent.
