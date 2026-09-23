# JEE Prep Coach

A JEE Main practice app. Students answer MCQ and numerical questions. The app diagnoses *why* an answer was
wrong (misconception-tagged distractors, behaviour signals, and AI analysis of the student's working),
tracks mastery for all 54 NTA units / 182 topics, and picks what to practise next (adaptive practice plus
spaced re-tests).

## Quick start

```bash
npm install
cp .env.example .env              # add ANTHROPIC_API_KEY to enable the AI tutor and content pipeline
docker compose up -d db
npm run db:migrate
npm run content:import
npm run dev                       # http://localhost:3000
```

## Docs
- Product and features: [docs/PRODUCT.md](docs/PRODUCT.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API: [docs/API.md](docs/API.md)
- Question bank, sources, targets: [docs/DATA_STRATEGY.md](docs/DATA_STRATEGY.md)
- Learning engine: [docs/LEARNING_ENGINE.md](docs/LEARNING_ENGINE.md)
- Security and privacy: [docs/SECURITY.md](docs/SECURITY.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Working with Claude Code: [CLAUDE.md](CLAUDE.md), `.claude/skills/`, `.claude/agents/`

## Content pipeline

```bash
npm run content:validate                       # schema, syllabus refs, duplicates, LaTeX
npm run content:coverage                       # counts vs launch targets
npm run content:generate -- --topic math.coordinate.circles --count 10 --dry-run
npm run import:jeebench && npm run import:pw25 # stage open datasets (MIT / Apache-2.0)
npm run content:enrich -- --file content/questions/_imports/pw25.json --limit 20
```
