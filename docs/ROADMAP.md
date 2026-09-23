# Roadmap & Status

Update this file when a milestone item lands. Claude: check here before starting new work.

## M0: Foundations ✅ (scaffolded)
- [x] Next.js 16 + TS + Tailwind scaffold, Drizzle + Postgres (docker compose)
- [x] Syllabus (54 units / 182 topics) as content
- [x] Content schema + validator + importer + coverage report
- [x] Seed questions (hand-authored, all three subjects)
- [x] Learning engine (grade, diagnose, mastery, selection, review) with unit tests
- [x] Auth (signup/login/logout, sessions)
- [x] Practice flow: topic + adaptive, attempt feedback with distractor diagnosis
- [x] AI working analysis endpoint (Claude, quota-limited)
- [x] Dashboard: mastery, weak topics, error breakdown
- [x] AI question-generation + verification script, dataset importers (JEEBench, PW-2025-Math)

## M1: Content at launch scale
- [ ] Run generation pipeline to hit per-topic targets (≈ 6,600 practice + 1,500 mock reserve)
- [ ] Import JEEBench and PW-2025-Math; classify topics and generate/verify solutions
- [ ] Legal decision on NTA PYQs → PYQ mode
- [ ] Human spot-check of 5% of auto-verified questions per topic (sample the hard band first)

## M2: Launch features (P1)
- [ ] Review-queue page + mistake notebook
- [ ] Mock tests (NTA interface, +4/−1 marking, post-mock analysis)
- [ ] Admin/reviewer UI, question reports queue
- [ ] Photo-of-working analysis (vision)
- [ ] Google sign-in, DOB + parental consent flow, account deletion/export
- [ ] Item-health nightly job
- [ ] Redis rate limiter, CI (lint, typecheck, test, audit), error monitoring, backups
- [ ] PWA/offline packs

## M3: Post-launch (P2)
- [ ] Study planner, percentile estimate, custom tests, Hindi
