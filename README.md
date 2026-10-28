# NMAMIT Mentor–Mentee Portal

The NMAMIT Mentor–Mentee Portal is a role-based web application that supports the mentoring process in an engineering department. Students maintain an eight-semester academic and professional portfolio. Faculty members select mentees from their own branch, review their records and provide guidance. The Head of the Department (HOD) approves faculty accounts, endorses verified records and manages the department.

> **Independent project.** This portal is not an officially approved NMAMIT or Nitte system. Please read the section "Before real students use this" in `docs/SECURITY.md` before any real data is entered.

**Technology stack:** React, Vite, TypeScript and Tailwind CSS (front end); Node.js, Express, TypeScript and Mongoose (back end); MongoDB (database). A single server hosts both the API and the web application.

## Roles and Responsibilities

| Role | Registration | Login | Capabilities |
|---|---|---|---|
| **Student** | Branch, USN, semester, first-year group, e-mail address and password. The account is active immediately. | Student login | Registers the subjects of each semester, enters marks, activities and goals, and responds to mentor recommendations. |
| **Faculty** | Branch, e-mail address and password. **The account remains pending until the HOD of that branch approves it.** | Faculty login | Selects mentees **from their own branch only**, reviews and verifies their records, and records recommendations and notes. |
| **HOD** | Branch, e-mail address, password and the **HOD access code**. Each branch may have only one active HOD. | HOD login | Approves faculty, endorses records, issues temporary passwords, and manages the curriculum and marks limits. |

The portal does not send e-mail. There are no verification or password-reset links. A forgotten password is reset by the HOD (for students and faculty) or by the system operator (for HODs), as described in `docs/DEPLOYMENT.md`.

## Running the Project Locally

Node.js 20 or later and a MongoDB instance (local, or a free Atlas cluster) are required.

```bash
cd server
# If the project was cloned from Git, first create the environment file: cp .env.example .env
npm install
npm run reset:dev -- --yes  # Only if this database contains data from an older version; it erases the database.
npm run seed:demo           # Optional: creates fictional demo users on the real syllabus. It refuses to run in production.
npm run dev                 # API on http://localhost:4000

cd ../client                # In a second terminal
npm install
npm run dev                 # Web application on http://localhost:5173
```

Departments and the syllabus are loaded automatically each time the server starts.

### Demo Accounts (development only; all fictional)

All demo accounts use the password `DevOnly-ChangeMe-123!`. The local HOD access code for new HOD registrations is `dev-hod-code`.

| Role | E-mail address |
|---|---|
| HOD (IS) | `demo.hod@demo.invalid` |
| Faculty | `demo.mentor1@demo.invalid`, `demo.mentor2@demo.invalid` |
| Students | `demo.student1@demo.invalid` (A, mentored), `demo.student2@demo.invalid` (B, mentored), `demo.student3@demo.invalid` (C, **no mentor**; use *Find mentees* as a faculty member to select this student) |

## Testing

```bash
cd server && npm test      # Authentication, role escalation, branch isolation, syllabus data, mentee selection, versioning, privacy and exports
cd client && npm test      # Forms, marks limits, route guard and status labels
```

The server tests use a temporary `nmamit_test` database on `mongodb://127.0.0.1:27017` and erase it after use. In the most recent run (28 October 2026), all 107 server tests and all 16 client tests passed.

## Features

- **Real syllabus:** the ISE 2023 scheme (all eight semesters, 161 credits), including electives, laboratories and projects, first-year groups, and the MSE and task limits from the Regulations. See `docs/CURRICULUM_NOTES.md`.
- **Verification chain:** Draft → Awaiting mentor review → Mentor verified → HOD endorsed. Editing an endorsed record preserves the endorsed version and reopens the review. The status "Officially verified" exists in the data model, but no part of the application can set it.
- **Mentoring:** goals, recommendations with follow-up, meetings, and four kinds of notes (student reflections, student-visible feedback, private mentor notes and HOD administrative notes), all enforced on the server.
- **Exports:** Excel assessment sheets and PDF portfolios, scoped by role. Exports never include private notes.
- **Audit trail:** an append-only history of versions, reviews, endorsements and administrative actions.

## Project Structure

```
server/src/  models/ routes/ services/ middleware/ seed/ scripts/      server/tests/
client/src/  pages/ components/ lib/
docs/        CURRICULUM_NOTES.md  SECURITY.md  DATA_MODEL.md  DEPLOYMENT.md
Dockerfile   render.yaml
```

## Deployment

The application is built into a single Docker image (`Dockerfile`) that serves both the API and the web application, and it uses MongoDB Atlas as its database.

- **Current deployment:** Back4app Containers (free tier), built directly from the `Dockerfile` in this repository. The required environment variables are `NODE_ENV`, `MONGODB_URI`, `SESSION_SECRET` (at least 32 characters), `HOD_ACCESS_CODE` (at least 8 characters), `ALLOWED_EMAIL_DOMAINS`, `TRUST_PROXY_HOPS=1` and `STORAGE_DRIVER=mongo`.
- **Alternative:** Render with an optional Vercel front end, as described step by step in `docs/DEPLOYMENT.md`.

## Use of AI Assistance

Claude (Anthropic), through Claude Code, was used as a programming assistant during the development, deployment and documentation of this project. The prompts are listed below in chronological order. They have been rewritten in formal English for clarity; their meaning has not been changed. Sensitive values, such as database connection strings, have been removed.

### Initial Development

> *The prompts used to build the original application are not included in this list, because they were not recorded on this computer. They should be added here.*

### 26 October 2026: Running the Project and Preparing Realistic Data

1. "Please run the project."
2. "Please remove the current data from this project, add realistic data and make the project more production-ready, as I need to demonstrate marks and other records. Use Manisha GP as the HOD, Tejas BN as the faculty member, and Aditya SN, Nagaraj CE and Raghu NC as the students."

### 27 October 2026: Deployment on Vercel and Render

3. "I would like to deploy this project using Vercel and Render."
4. "Please provide detailed, step-by-step instructions for this deployment."

### 28 October 2026: Version Control

5. "Please push this project to the GitHub repository https://github.com/manish-g-p/nmamit_portal."

### 28 October 2026: Project Report

6. "Please create a formal project report for this project as a Word document. Include screenshots of the web pages wherever they are relevant. The report should be longer than 15 pages and shorter than 20 pages. Follow the format of the attached sample report, using its images for reference only; do not create a report on the operating systems assignment itself."

### 28 October 2026: Deployment on a Free Tier

7. "How can I deploy this project on a free tier, without using Vercel or Render?"
8. "Please give me the exact link for creating a web service from the GitHub repository manish-g-p/nmamit_portal."
9. "The page does not display anything." *(Koyeb was not accepting new deployments, so Back4app Containers was used instead.)*
10. "Is this the MongoDB connection string that I need to enter?" *(Connection string removed.)*
11. "The deployed application returns 'not found'." *(The runtime log showed that `SESSION_SECRET` was missing; setting it resolved the problem.)*
12. "The application is now working."
13. "Will this URL continue to work tomorrow?"

### 28 October 2026: Documentation

14. "Please update the README of this project to include the prompts I have used, and ensure that it is written in proper, formal English."

### Responsibility

I defined the requirements and constraints of the portal, reviewed the generated code and results, tested the application, and carried out the deployment. I understand the design of the system and am able to explain and modify it.
