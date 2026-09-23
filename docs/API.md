# HTTP API (v1)

JSON over HTTPS under `/api`. Auth is the `sid` session cookie. The same services back the
web pages (Server Components call services directly) and a future mobile app.

Conventions:
- Request bodies are validated with Zod. Unknown keys are rejected with `400 {error:"invalid_request", issues}`.
- Errors: `{ "error": "<snake_case_code>" }` with the matching status (400/401/403/404/409/429/500).
- State-changing requests must send a same-origin `Origin` header (browsers do this automatically).
- IDs are UUIDs. Topic IDs are syllabus strings (`phy.kinematics.projectile`).

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password, name}` | `201 {user}` + cookie |
| POST | `/api/auth/login` | `{email, password}` | `200 {user}` + cookie · `401 invalid_credentials` · `429` |
| POST | `/api/auth/logout` | – | `204` |
| GET | `/api/me` | – | `{user}` |

## Syllabus
| GET | `/api/syllabus` | – | subjects → units → topics (public, static). Per-user mastery is in `/api/me/analytics` |

## Practice
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/practice/sessions` | `{mode:"topic", topicId}` or `{mode:"adaptive", subjectId?}` or `{mode:"review"}` | `201 {session}` |
| GET | `/api/practice/sessions/:id/next` | – | `{done:false, question: PublicQuestion, position, total, isReview}` or `{done:true, total}`. Idempotent: returns the pending question until it is answered |
| POST | `/api/practice/sessions/:id/hint` | `{n}` (1-based) | `{n, html, total}`. Recorded server-side; reduces mastery credit |
| POST | `/api/attempts` | `{sessionId, questionId, response:{kind:"choice",keys:["B"]} or {kind:"numeric",value:12.5} or {kind:"skip"}, timeTakenMs, confidence:"sure"/"unsure"/"guess", hintsUsed, working?}` | `201 AttemptResult` |
| POST | `/api/attempts/:id/analyze` | `{working?}` (overrides the stored one) | `200 {analysis}` · `429 ai_quota_exceeded` · `503 ai_disabled` |
| POST | `/api/questions/:id/report` | `{reason:"wrong_key"/"typo"/"unclear"/"out_of_syllabus"/"other", note?}` | `201` |

`PublicQuestion` = `{id, topicId, type, stem, stemHtml, options:[{key,text,html}], difficulty, expectedTimeSec, hintsAvailable}`
(`*Html` fields are pre-rendered safe HTML from `renderRich()`).
It **never** contains the answer, solution or distractor metadata.

`AttemptResult` = `{attemptId, correct, answer, solution, solutionHtml, optionFeedback:[{key, correct, whyWrong?, whyWrongHtml?, misconception?}], diagnosis, mastery:{topicId, before, after}}`

An attempt is accepted only for the session's *current* question (`409 question_not_current` otherwise, including double submits).
`timeTakenMs` is capped by the server-measured time since the question was served, and `hintsUsed` is taken as max(client, server-recorded).

## Analytics
| GET | `/api/me/analytics` | – | `{overall:{attempts, accuracy, last7Days, reviewDue}, subjects[] (units → topics with mastery), weakTopics[], signals[], aiErrorTypes[], misconceptions[]}` |
| GET | `/api/me/review` | – | `{dueCount, nextDueAt}` |

## Admin / content (role ≥ reviewer)
| GET | `/api/admin/coverage` | – | per-topic counts vs target, by difficulty band and type |
| GET | `/api/admin/questions?status=&topicId=` | – | paginated list, full data *(M2, not built yet)* |
| PATCH | `/api/admin/questions/:id` | partial question | new version, status → `in_review` *(M2)* |
| POST | `/api/admin/questions/:id/status` | `{status}` | publish / retire (admin) *(M2)* |
| GET | `/api/admin/reports?open=true` | – | user reports *(M2)* |

Rate limits (per user unless noted): auth 10/15 min/IP · attempts 120/min · analyze = `AI_DAILY_LIMIT`/day · reports 20/day.
