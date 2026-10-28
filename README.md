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

## Prompts Used to Make This Project

Claude (Anthropic), through Claude Code, was used as a programming assistant while this project was developed, deployed and documented. The prompts below are the real prompts that were used, listed in chronological order. They have been rewritten as fluent, formal sentences without changing their meaning, and sensitive values such as database connection strings have been removed.

> **Note:** The prompts used to build the first version of the application were not recorded on this computer, so they are not listed here.

### Running the Project and Preparing Realistic Data (26 October 2026)

1. "Please run the project on my computer."
2. "Please remove the existing data from the project and replace it with realistic data, and make the project more production-ready, because I need to demonstrate marks and other records. Use Manisha GP as the Head of the Department, Tejas BN as the faculty member, and Aditya SN, Nagaraj CE and Raghu NC as the students."

### Deploying on Vercel and Render (27 October 2026)

3. "I would like to deploy this project using Vercel for the front end and Render for the back end."
4. "Please give me detailed, step-by-step instructions for completing this deployment."

### Publishing the Code (28 October 2026)

5. "Please push this project to my GitHub repository at https://github.com/manish-g-p/nmamit_portal."

### Preparing the Project Report (28 October 2026)

6. "Please create a formal project report for this project as a Word document. Include screenshots of the web pages wherever they are relevant, and keep the report between 15 and 20 pages long. Follow the format of the sample report that I have attached, but use its images only as a reference for the layout and do not reproduce its content."

### Deploying on a Free Tier (28 October 2026)

7. "How can I deploy this project on a free hosting tier without using Vercel or Render?"
8. "Please give me the exact link that creates a web service on Koyeb from my GitHub repository, manish-g-p/nmamit_portal."
9. "The Koyeb page does not display anything after I open the link. What should I do?"
10. "Is this the MongoDB connection string that I should enter in the environment variables?"
11. "The deployed application only shows the message 'not found'. Here is the runtime log; please tell me how to fix it."
12. "The application is now working. Will this URL still work tomorrow when I present the project?"

### Documenting the Project (28 October 2026)

13. "Please update the README of this project so that it lists the prompts I have used, and make sure that it is written in proper, formal English."
14. "Please add a section to the README called 'Prompts Used to Make This Project', include the real prompts, and rewrite them as fluent sentences."

### Outcome of the Assistance

- The application was run locally and loaded with realistic demonstration data.
- The code was published to GitHub and deployed on Back4app Containers with a MongoDB Atlas database, after Koyeb proved unavailable for new deployments.
- A 19-page formal project report with screenshots of the running application was prepared.
- This README was rewritten in formal English.

### Responsibility

I defined the requirements and constraints of the portal, reviewed the generated code and results, tested the application and carried out the deployment. I understand the design of the system and am able to explain and modify it.
