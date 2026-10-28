# Data model

**People:** `User` (role, status, department, tokenVersion, mustChangePassword) → `StudentProfile` (USN, year, semester) · `FacultyProfile` (directory entry; optional link to a `User`) · `Department`.
**Mentoring:** `MentorAssignment` (student, mentor, effectiveFrom, endedAt, active) — reassignment ends the old row and creates a new one, so history is never lost.
**Curriculum:** `CurriculumCourse` (batch, branch, code, title, category, L-T-P, credits, CIE/SEE marks, semester or first-year table, elective slot/group) is the syllabus; `Subject` is a student's registration for one course (created only from the curriculum).
**Academics:** `Subject` (student, semester 1–8, code) → `AssessmentRecord` (MSE1, MSE2, TASK1–3, cieMarks for courses without MSEs, taskSubtotal, status, version) · `AssessmentScheme` (per-branch limits; defaults MSE 20, tasks 4/4/2 from the Regulations 2023).
**Portfolio:** `StudentActivity` (20 categories, same status/version pipeline) · `StudentGoal` · `MentorRecommendation` (status machine, student notes, mentor feedback) · `MentorMeeting` · `StudentReflection`.
**Notes:** `MentorNote` (`private` | `student_visible`) · `AdminNote` — separate collections/types so a query for one can never return another by accident.
**History (append-only):** `RecordVersion` (snapshot after every save) · `ReviewRecord` (every decision, tied to a version) · `Endorsement` (positive decisions only) · `AuditLog` (who/what/when, secrets scrubbed). Mongoose hooks reject update and delete on these; see the "Hardening" section of `SECURITY.md` for database-level enforcement.
**Other:** `UploadedDocument` (metadata, soft delete) + `FileBlob` (bytes, mongo driver) · `Notification` · `AcademicCalendarEvent`

**How history is preserved:** a record's current document holds the latest state; every save writes a `RecordVersion`. Mentor and HOD decisions reference the exact version reviewed (a stale version is refused). When a student edits an endorsed record, version N+1 is created and set back to "awaiting mentor review"; version N and its endorsements remain untouched.

**Not built from your list:** `AcademicProgram`, `AcademicYear`, `Semester` and `InstitutionSettings` are not separate collections. Program is a field on the student profile; the academic year is derived from admission year and semester; semesters are numbers 1–8; settings live per branch in `AssessmentScheme`.
