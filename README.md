# NMAMIT Mentor–Mentee Portal

Students keep their eight-semester academic and professional portfolio. Faculty choose mentees from their own branch, review their records and guide them. HODs approve faculty, endorse records and manage their department.

> **Independent project.** It is not an officially approved NMAMIT or Nitte system. Read `docs/SECURITY.md` ("Before real students use this") before real data goes in.

**Stack:** React + Vite + TypeScript + Tailwind · Node + Express + TypeScript + Mongoose · MongoDB. One server hosts both the API and the web app.

## Who does what
| | Sign up | Log in | Can do |
|---|---|---|---|
| **Student** | Branch, USN, semester, first-year group, email, password. Active at once. | Student login | Add the semester's syllabus subjects, enter marks, activities and goals, follow recommendations |
| **Faculty** | Branch, email, password. **Waits for the HOD of that branch to approve.** | Faculty login | Pick mentees **from their own branch only**, review and verify their records, recommend, note |
| **HOD** | Branch, email, password and the **HOD access code**. One HOD per branch. | HOD login | Approve faculty, endorse records, issue temporary passwords, manage curriculum and marks limits |

There are no emails anywhere: no verification links and no reset links. A forgotten password is handled by the HOD (students, faculty) or the operator (HODs): see `docs/DEPLOYMENT.md`.

## Run it on your computer
Needs Node 20+ and a MongoDB (local, or a free Atlas cluster).
```bash
cd server
# the zip you downloaded already contains server/.env; if you cloned from Git instead, run: cp .env.example .env
npm install
npm run reset:dev -- --yes  # ONLY if this database already holds data from an older version: wipes it so you start clean
npm run seed:demo           # optional fictional demo people on the real syllabus; refuses to run in production
npm run dev                 # API on http://localhost:4000

cd ../client                # second terminal
npm install
npm run dev                 # web app on http://localhost:5173
```
Departments and the syllabus load automatically every time the server starts.

### Demo accounts (development only, all fictional)
Password for all: `DevOnly-ChangeMe-123!`. HOD access code for new HOD sign-ups locally: `dev-hod-code`.

| Role | Email |
|---|---|
| HOD (IS) | `demo.hod@demo.invalid` |
| Faculty | `demo.mentor1@demo.invalid`, `demo.mentor2@demo.invalid` |
| Students | `demo.student1@demo.invalid` (A, mentored), `demo.student2@demo.invalid` (B, mentored), `demo.student3@demo.invalid` (C, **no mentor**: try *Find mentees* as faculty) |

## Tests
```bash
cd server && npm test      # authentication, role escalation, branch isolation, syllabus data, mentee selection, versioning, privacy, exports
cd client && npm test      # forms, mark limits, route guard, status labels
```
Server tests use a throw-away `nmamit_test` database on `mongodb://127.0.0.1:27017` and wipe it.

## What is in the box
- **Real syllabus:** the ISE 2023 scheme (all 8 semesters, 161 credits) with electives, labs and projects; first-year groups; MSE and task limits from the regulations. See `docs/CURRICULUM_NOTES.md`.
- **Verification chain:** Draft → awaiting mentor review → mentor verified → HOD endorsed. Editing an endorsed record keeps the endorsed version and reopens review. "Officially verified" exists but nothing in the app can set it.
- **Mentoring:** goals, recommendations with follow-up, meetings, and four kinds of notes (student reflections, student-visible feedback, private mentor notes, HOD admin notes) enforced on the server.
- **Exports:** Excel assessments and PDF portfolios, scoped by role; they never include private notes.
- **Audit trail:** append-only history of versions, reviews, endorsements and actions.

## Layout
```
server/src/  models/ routes/ services/ middleware/ seed/ scripts/      server/tests/
client/src/  pages/ components/ lib/
docs/        CURRICULUM_NOTES.md  SECURITY.md  DATA_MODEL.md  DEPLOYMENT.md
Dockerfile   render.yaml
```

## Deploying
See `docs/DEPLOYMENT.md`: one Render service plus a free Atlas database, no other accounts needed.
