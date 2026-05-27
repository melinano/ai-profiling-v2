# AGENTS.md — AI-Powered Job Profiling System

## 1. Project Purpose

This repository implements an MVP web system for job/position profiling in a university or organization.

The system allows employees to complete a structured profiling interview based on a fixed questionnaire template. Their answers are stored, transformed into an `InterviewProfile`, compared against an `ExpectedProfile` generated from official documents, and shown to authorized reviewers such as managers, HR users, moderators, or administrators.

The system does **not** perform grading. Grading is outside the MVP scope. The MVP only collects profiling data, derives structured profiles, compares profiles, and highlights inconsistencies.

The core business goal is:

```text
Employee completes interview
→ system creates InterviewProfile
→ system creates ExpectedProfile from related artifacts
→ system compares InterviewProfile vs ExpectedProfile
→ reviewers see differences and inconsistencies
```

---

## 2. Technical Stack

### Database

- PostgreSQL is the main database.
- The database connection string is stored in the `.env` file.
- Do not hard-code database credentials.
- Prefer migrations for schema changes.

Expected environment variable:

```env
DATABASE_URL=postgres://...
```

### Frontend

- React
- Vite
- Bun
- TypeScript

The frontend should implement a clear profiling workflow, not a free-form chatbot interface. The user experience should feel like a guided questionnaire / wizard.

### Backend

- Bun
- TypeScript
- PostgreSQL access through the backend API

The backend is responsible for:

- user and role management;
- invitation link handling;
- assignments;
- interview run lifecycle;
- artifact and artifact-link management;
- expected/interview profile records;
- comparison records;
- access control for moderators, admins, managers, and HR users.

### LLM / Agent Processing Module

- Python module.
- Responsible for LLM-related processing:
  - generating `InterviewProfile` from interview answers;
  - generating `ExpectedProfile` from relevant artifacts;
  - comparing expected and interview profiles;
  - returning structured JSON outputs.
- Use the OpenAI API.
- OpenAI credentials must be loaded from environment variables, not hard-coded.

Expected environment variable:

```env
OPENAI_API_KEY=...
```

The Python module should be callable from the backend through a simple interface. For MVP, this can be implemented as a Python script, CLI command, internal service, or lightweight HTTP service. Keep the integration simple.

---

## 3. Main Business Chain

The main business chain is:

```text
OrgUnit
→ Position
→ Assignment
→ InterviewRun
→ InterviewProfile
```

In parallel:

```text
Artifact
→ ArtifactLink
→ ExpectedProfile
```

Comparison:

```text
ExpectedProfile
vs
InterviewProfile
→ ProfileComparison
```

Meaning:

- an employee completes an interview for a specific assignment;
- the system creates an `InterviewProfile` from that interview;
- the system creates an `ExpectedProfile` from documents linked to the relevant position and org unit;
- the system compares both profiles and stores the result.

---

## 4. Core Domain Principle

Do not confuse a person, a position, and an assignment.

```text
User
= a real person / account / system user

OrgUnit
= an organizational unit in the hierarchy

Position
= a formal job position inside an OrgUnit

Assignment
= a concrete assignment of a User to a Position
```

Example:

```text
User:
Ivan Ivanov

Position:
Programmer, 2nd category, in Software Development Department

Assignment:
Ivan Ivanov occupies this Position at 1.0 FTE
```

If Ivan also works as a researcher at 0.5 FTE in another org unit, that is a second `Assignment`.

The central context object for an interview is `Assignment`, not just `User` and not just `Position`.

---

## 5. MVP Entities

### 5.1 `org_units`

Hierarchical organizational structure.

Purpose:

- store departments / divisions / units;
- connect positions to organizational context;
- find related org-unit regulation artifacts;
- determine reviewer visibility scope.

Suggested fields:

```text
id
parent_id
name
full_path
created_at
updated_at
```

Notes:

- `parent_id` stores the hierarchy.
- `full_path` is useful for search, display, and debugging.

---

### 5.2 `positions`

A formal position inside a specific org unit.

Purpose:

- represent a job title in a concrete organizational context;
- link job instructions to a position;
- create invitation links for employees occupying that position;
- provide context for expected profile generation.

Suggested fields:

```text
id
org_unit_id
title
is_supervisor
is_active
created_at
updated_at
```

Relationships:

```text
OrgUnit 1 → N Positions
Position 1 → N Assignments
```

---

### 5.3 `users`

People using the system.

A user may be:

- employee;
- manager;
- HR user;
- moderator;
- admin.

Suggested fields:

```text
id
email
full_name
role
is_active
created_at
updated_at
```

Roles:

```text
employee
manager
hr
moderator
admin
```

For MVP, corporate email can be used as a unique user identifier:

```text
users.email must be unique
```

---

### 5.4 `assignments`

A concrete assignment of a user to a position.

This is a key entity.

Purpose:

- represent a user occupying a position;
- support multiple people on the same position;
- support one person occupying multiple positions;
- serve as the context for interview runs and profile comparisons.

Suggested fields:

```text
id
user_id
position_id
rate nullable
is_active
created_at
updated_at
```

Relationships:

```text
User 1 → N Assignments
Position 1 → N Assignments
Assignment 1 → N InterviewRuns
```

Business rule:

```text
For MVP, prevent duplicate active assignments for the same user_id + position_id pair.
```

---

### 5.5 `invitation_links`

Temporary MVP access mechanism.

Because the initial system may not know exactly which employee occupies which position, invitation links are created for a `Position`, not for a pre-existing employee.

Purpose:

- allow a moderator/admin to create a link for a position;
- allow responsible staff to send this link to employees occupying that position;
- allow employees to identify themselves by corporate email;
- create or reuse `User` and `Assignment` records during first access.

Suggested fields:

```text
id
position_id
token_hash
status
max_uses nullable
used_count
expires_at nullable
created_by_user_id
created_at
revoked_at nullable
```

Statuses:

```text
active
expired
revoked
```

Important:

- Store `token_hash`, not the raw token.
- The raw token is only used in the URL.
- This table is an MVP mechanism and can later be replaced or supplemented by SSO / HR-system integration.

MVP flow:

```text
Moderator/Admin creates InvitationLink for Position.
Responsible staff sends the link to employees.
Employee opens link and enters corporate email + full name.
System finds or creates User.
System finds or creates Assignment for User + Position.
System creates or opens InterviewRun.
```

---

### 5.6 `interview_runs`

A concrete questionnaire/interview completion attempt.

Purpose:

- store answers from a specific assignment;
- support draft saving;
- support final submission;
- serve as the source for `InterviewProfile`.

Suggested fields:

```text
id
assignment_id
status
answers_json
started_at
last_saved_at
submitted_at nullable
created_at
updated_at
```

Statuses:

```text
not_started
in_progress
submitted
```

Important:

```text
InterviewRun must be linked to Assignment, not only to User.
```

Reason: the same user may complete different interviews for different assignments.

MVP rule:

```text
After submission, the employee cannot edit the interview.
```

---

### 5.7 `artifacts`

Document sources.

Artifact types:

```text
job_instruction
org_unit_regulation
prof_standard_future
other
```

MVP artifact types:

```text
job_instruction
org_unit_regulation
```

Purpose:

- store cleaned text from source documents;
- provide document context for expected profile generation;
- preserve source file path and file name for traceability and linking.

Suggested fields:

```text
id
artifact_type
title
source_file_path
source_file_name
cleaned_text
status
created_at
updated_at
```

Field meaning:

```text
source_file_path
```

Full file path in the original archive/folder structure. This is important because folder paths may contain org-unit context.

```text
source_file_name
```

Original file name. Useful for UI, debugging, and manual review.

```text
cleaned_text
```

Cleaned document text. For MVP, this is used directly for expected profile generation.

MVP decision:

```text
Do not implement document_tree_json.
Do not implement document_profile_json.
Do not implement profile_blocks.
Do not reconstruct complex document structure from OCR.
```

Future evolution:

```text
Artifact.cleaned_text
→ document_tree_json
→ document_profile_json
→ ExpectedProfile
```

But for MVP:

```text
Artifact.cleaned_text → ExpectedProfile
```

---

### 5.8 `artifact_links`

Links artifacts to domain entities.

Purpose:

- link job instructions to positions;
- link org-unit regulations to org units;
- allow future linking of professional standards to specializations.

Suggested fields:

```text
id
artifact_id
target_type
target_id
relation_type
is_primary
created_at
```

MVP target types:

```text
position
org_unit
```

Future target types:

```text
specialization
assignment
profession_family
```

Example values:

```text
artifact_type = job_instruction
target_type = position
relation_type = describes

artifact_type = org_unit_regulation
target_type = org_unit
relation_type = regulates
```

Keep `target_type` extensible. Do not hard-code the model so tightly that only `position` and `org_unit` are possible forever.

---

### 5.9 `expected_profiles`

Target/expected profile generated from documents and org context.

Purpose:

- represent the expected profile for a position in an org context;
- later potentially represent expected profile for an assignment context if specialization is added;
- serve as the comparison target for interview profiles.

Suggested fields:

```text
id
position_id
org_unit_id
assignment_id nullable
profile_json
status
is_current
created_at
updated_at
```

MVP rule:

```text
ExpectedProfile is usually generated by position_id + org_unit_id.
```

`assignment_id` is nullable and can be used later if the expected profile depends on assignment-specific specialization.

Generation context:

```text
Assignment
→ Position
→ OrgUnit
→ ArtifactLinks
→ Artifacts.cleaned_text
→ LLM / processing module
→ ExpectedProfile
```

For MVP, expected profiles are generated directly from `Artifact.cleaned_text`.

---

### 5.10 `interview_profiles`

Profile generated from a concrete interview run.

Purpose:

- transform questionnaire answers into structured profile JSON;
- provide a comparable structure for profile comparison;
- represent what was extracted from a specific interview run.

Suggested fields:

```text
id
interview_run_id
assignment_id
profile_json
status
is_current
created_at
updated_at
```

Important naming decision:

```text
Use InterviewProfile, not ActualProfile.
```

Reason:

```text
The profile is derived from an interview run. It is not necessarily the absolute factual truth about the job.
```

Generation flow:

```text
InterviewRun.answers_json
→ Python LLM module
→ InterviewProfile.profile_json
```

---

### 5.11 `profile_comparisons`

Comparison result between an expected profile and an interview profile.

Purpose:

- store differences, matches, conflicts, and review notes;
- allow managers/HR to inspect inconsistencies;
- keep comparison output independent of the raw LLM call.

Suggested fields:

```text
id
expected_profile_id
interview_profile_id
interview_run_id
assignment_id
result_json
status
created_at
updated_at
```

`result_json` should contain structured comparison output, for example:

```text
matches
differences
conflicts
missing_in_interview
extra_in_interview
severity
explanation
needs_review
```

Comparison is always performed for a concrete assignment context.

---

### 5.12 `org_unit_reviewers`

Defines who can view interviews and comparisons for an org unit.

Purpose:

- allow managers to view subordinate interview results;
- support deputy managers or HR partners;
- avoid assuming a single manager per org unit.

Suggested fields:

```text
id
org_unit_id
reviewer_user_id nullable
reviewer_position_id nullable
reviewer_role
include_child_units
can_view_interviews
can_view_comparisons
created_at
```

Reviewer roles:

```text
manager
deputy
hr_partner
observer
```

For MVP, use `reviewer_user_id` if simpler.

If access should be attached to a position rather than a person, use `reviewer_position_id`.

---

## 6. Status and Versioning Rules

### Profile statuses

Both `expected_profiles` and `interview_profiles` may use:

```text
pending
generated
failed
stale
```

Meaning:

```text
pending
```

Profile generation is planned or running, but not completed.

```text
generated
```

Profile was successfully generated.

```text
failed
```

Profile generation failed.

```text
stale
```

Profile is outdated because source data changed: answers, documents, artifact links, prompt, or processing logic.

For MVP, it is acceptable to mostly use:

```text
generated
failed
```

but keep the broader structure.

### `is_current`

Used for simple versioning.

If a profile is regenerated:

```text
old_profile.is_current = false
new_profile.is_current = true
```

This allows the system to keep historical profile generations without deleting them.

MVP rule:

```text
First successful profile generation:
status = generated
is_current = true
```

---

## 7. MVP Process Flows

### 7.1 Create invitation link

```text
Admin or Moderator selects Position.
System creates InvitationLink for that Position.
Responsible staff sends this link to employees occupying that Position.
```

### 7.2 Employee access

```text
Employee opens invitation link.
Employee enters corporate email and full name.
System finds User by email.
If User does not exist, create User.
System finds active Assignment by user_id + position_id.
If Assignment does not exist, create Assignment.
System creates or opens InterviewRun.
```

### 7.3 Interview completion

```text
Employee answers questionnaire.
Answers are stored in InterviewRun.answers_json.
Draft saving is supported.
After final submission, InterviewRun.status = submitted.
Employee cannot edit after submission in MVP.
```

### 7.4 Interview profile generation

```text
InterviewRun submitted
→ Python LLM module
→ InterviewProfile
```

### 7.5 Expected profile generation

```text
Assignment
→ Position
→ OrgUnit
→ ArtifactLinks
→ Artifacts.cleaned_text
→ Python LLM module
→ ExpectedProfile
```

No intermediate document profile layer in MVP.

### 7.6 Profile comparison

```text
ExpectedProfile + InterviewProfile
→ Python LLM module
→ ProfileComparison
```

### 7.7 Reviewer access

```text
Manager / deputy / HR access is defined through OrgUnitReviewers.
System determines visible OrgUnits.
System shows InterviewRuns, InterviewProfiles, and ProfileComparisons for Assignments inside those OrgUnits.
```

---

## 8. MVP Out of Scope

Do not implement in the first prototype unless explicitly requested:

```text
- full SSO authorization;
- complex HR/staffing model;
- profile_sources table;
- document_tree_json;
- document_profile_json;
- profile_blocks;
- claims graph;
- ontology;
- embeddings/RAG comparison;
- editing interview after submission;
- full manager approval workflow;
- Word/Excel/PDF export;
- professional standards;
- specializations;
- MLflow/Phoenix/DVC tracing.
```

These can be added later without breaking the core model.

---

## 9. Future Extensions

### 9.1 Authorization

Later, add:

```text
auth_identities
- id
- user_id
- provider
- provider_user_id
- email
- created_at
```

Possible providers:

```text
email_magic_link
university_sso
ldap
manual
```

This should not replace the central business model:

```text
User → Assignment → InterviewRun
```

### 9.2 Specializations

Later, add:

```text
specializations
- id
- name
- description
```

```text
assignment_specializations
- id
- assignment_id
- specialization_id
```

Professional standards can be represented as artifacts:

```text
Artifact(type = prof_standard)
→ ArtifactLink(target_type = specialization)
→ Specialization
→ Assignment
```

### 9.3 Improved document processing

Current MVP:

```text
Artifact.cleaned_text → ExpectedProfile
```

Future:

```text
Artifact.cleaned_text
→ document_tree_json
→ document_profile_json
→ ExpectedProfile
```

Later still:

```text
document_blocks
profile_blocks
evidence tracking
```

---

## 10. Minimal MVP Table List

```text
users
org_units
positions
assignments
invitation_links
interview_runs
artifacts
artifact_links
expected_profiles
interview_profiles
profile_comparisons
org_unit_reviewers
```

---

## 11. Implementation Guidelines for Coding Agents

1. Keep the MVP simple.
2. Do not build a full HR system.
3. Do not over-model staffing reality beyond `User`, `Position`, and `Assignment`.
4. Keep document processing simple: store `cleaned_text` and use it directly for expected profile generation.
5. Keep `artifact_links` extensible.
6. Keep profile generation and comparison JSON-based.
7. Keep LLM logic in the Python module.
8. Do not put OpenAI API calls directly into the frontend.
9. Do not expose secrets in source code.
10. Prefer small, explicit backend API endpoints over hidden magic.
11. Preserve the core context chain:

```text
User → Assignment → Position → OrgUnit
```

12. Preserve the profiling chain:

```text
Assignment → InterviewRun → InterviewProfile
```

13. Preserve the comparison chain:

```text
ExpectedProfile + InterviewProfile → ProfileComparison
```

---

## 12. Suggested Repository Structure

This is a suggested structure. Adjust to the existing repository if needed.

```text
/apps
  /frontend
    React + Vite + Bun app

  /backend
    Bun + TypeScript API

/services
  /profile-agent
    Python module for LLM processing

/db
  /migrations
  /seeds

/docs
  architecture notes, ER diagrams, prompt contracts
```

---

## 13. Backend Responsibilities

The Bun/TypeScript backend should own:

```text
- database access;
- user records;
- roles;
- invitation links;
- assignments;
- interview lifecycle;
- artifact records;
- artifact links;
- expected profile records;
- interview profile records;
- comparison records;
- reviewer access logic.
```

The backend may call the Python profile-agent module when profile generation or comparison is required.

---

## 14. Python Profile-Agent Responsibilities

The Python LLM module should own:

```text
- converting InterviewRun.answers_json into InterviewProfile.profile_json;
- converting related Artifact.cleaned_text records into ExpectedProfile.profile_json;
- comparing ExpectedProfile.profile_json with InterviewProfile.profile_json;
- returning structured JSON results;
- using the OpenAI API through environment variables.
```

The module should expose stable input/output contracts. The backend should not need to know prompt internals.

---

## 15. OpenAI API Usage

Use the OpenAI API only from backend/server-side code or the Python profile-agent service.

Never call OpenAI directly from the frontend.

Load the API key from the environment:

```env
OPENAI_API_KEY=...
```

Do not hard-code API keys.

All LLM output should be validated before writing it to the database.

---

## 16. Final Project Formula

```text
Employee enters through InvitationLink linked to Position.
System identifies or creates User by corporate email.
System creates or finds Assignment for User + Position.
Employee completes InterviewRun.
System generates InterviewProfile from InterviewRun.
System generates ExpectedProfile from Artifacts linked to Position and OrgUnit.
System compares ExpectedProfile with InterviewProfile.
System stores ProfileComparison.
Managers / HR / moderators view results according to OrgUnitReviewer access rules.
```
