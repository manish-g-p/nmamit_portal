# Security, privacy and permissions

## Permission matrix
| Capability | Student | Faculty | HOD |
|---|---|---|---|
| Create an account | Yes, active at once | Yes, **waits for HOD approval** | Yes, with the **HOD access code**; one per branch |
| Own portfolio | Read and write permitted fields | n/a | n/a |
| See students before choosing | n/a | **Own branch only, no mentor yet, name/USN/semester only** | Own branch |
| Mentee records | Own | **Only students they chose (active)** | Own branch |
| Student reflections | Own | Own mentees | No |
| Student-visible feedback | Read own | Write | Read (own branch) |
| Private mentor notes | **Never** | Author only, while still the mentor | **Never** |
| Admin notes | Never | Never | Own branch |
| Verify (mentor level) | No | Own mentees | No |
| Endorse (HOD level) | No | No | Own branch |
| Approve or suspend faculty | No | No | Own branch |
| Issue temporary passwords | No | No | Students and faculty of own branch (never another HOD) |
| Reassign mentors, curriculum, marks limits, calendar | No | No | Own branch |
| Audit log | Own actions | Own actions | Own branch |
| Exports | Own | Own mentees | Own branch |

## What changed with "no email"
The portal sends no email, so **an email address or USN is claimed, not proven.** The controls that stand in for verification:
- Sign-up accepts only configured institutional email domains.
- **Faculty cannot see anything until their branch's HOD approves them**, and then can reach only students of that branch.
- **HOD sign-up needs a secret access code** and each branch allows one active HOD. Wrong-code attempts are audited. Without a code configured, HOD sign-up is off.
- **A student who signs up with someone else's email or USN** (squatting) is fixed by the HOD: issue a temporary password to the real student in person. The HOD sees every student of the branch under *People & passwords*.
- Temporary passwords are random, shown once, never written to the audit log, and must be replaced at the next login. All sessions end when a password is reset or changed.
- Weaker than email-based recovery: a HOD who forgets their password needs the operator (`npm run admin`).

## How access is enforced
- Every protected route runs `authenticate` (cookie → user; status and `tokenVersion` re-checked **on every request**, so suspension, logout and password changes take effect at once), then a role check, then a scope check **inside the database query** (owner, chosen mentee, or branch). Out-of-scope records answer 404 so existence is not revealed.
- Request bodies are strict Zod schemas: unknown fields such as `role`, `status` or `version` are rejected. Keys beginning with `$` or containing `.` are rejected globally (NoSQL injection).
- Passwords: Argon2id, 10+ characters with upper, lower and a digit. Sessions: 15-minute access cookie plus 7-day refresh cookie, HTTP-only, `Secure`, `SameSite=Lax`. Login limits per IP and a 5-failure account lockout. The login error never reveals whether an email exists.
- The web app and API share one origin, with a strict content-security policy and standard security headers.
- Uploads: PDF/PNG/JPEG identified by their bytes, 5 MB limit, random storage key, never served statically; each download is authorised and audited.
- Exports neutralise spreadsheet formulas and never include private notes.

## What the tests prove (and what they do not)
The server suite covers role escalation, branch isolation (a faculty member can never find or pick another branch's student), the HOD code and one-HOD rule, password change and reset, assigned-mentee scoping, private/admin note privacy (including audit-log leakage), versioning and endorsement history, document permissions, export scoping and the syllabus data. **In this build environment the server tests ran against FerretDB, a MongoDB-compatible server, not real MongoDB; re-run `npm test` against real MongoDB.** The tests are not a penetration test.

## Before real students use this
1. **Institutional approval** from someone with authority at NMAMIT/Nitte: a data owner, hosting approval, and a legal basis under India's Digital Personal Data Protection Act 2023.
2. **Confirm** the valid email domains and USN patterns, the marks rules, and the policy for private notes after a mentor releases a student (currently sealed).
3. **Decide how enrolment is verified.** Email domain and HOD oversight are not proof of enrolment; a student-information-system or SSO link would be.
4. **Independent security review**, a privacy notice and retention policy (the sign-up checkbox is a placeholder), backups, monitoring and an incident contact.
5. Each HOD should review their branch's **curriculum** and **marks limits**.

## Hardening still recommended
- Database-level role that cannot update or delete `auditlogs`, `recordversions`, `reviewrecords`, `endorsements`.
- Multi-factor sign-in for HODs and an email-based or SSO recovery path if the institution allows it.
- Central logging and alerts for repeated failed logins, wrong HOD codes and admin-note reads.
