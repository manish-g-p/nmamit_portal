# Curriculum notes: how the syllabus became the subject list

**Source:** "Regulations and Curriculum, B.Tech in Information Science and Engineering, AY 2023-24 (Version 2023.04)". Scheme tables, elective lists and course pages were read in full; each course's credits, hours and marks were checked against both the scheme table and its own course page.

**Check built into the tests:** the credits reproduce the syllabus totals exactly: first-year tables 19 + 21, then semesters III to VIII = 20, 24, 20, 21, 20, 16, which sum to **161**. If anyone edits the data and breaks a total, a test fails.

## How subjects work in the app
- Students do not type subjects. They press **Add semester N subjects**, and the app registers that semester's fixed courses (real code, title, credits, category). Running it twice adds nothing.
- **First year has two groups.** Group I takes table A in semester 1 and table B in semester 2; Group II takes the reverse. The student gives their group at sign-up.
- **Electives are slots**, one course each: VEC (sem 4), PEC-I and AEC (sem 5), PEC-II, PEC-III and OEC-I (sem 6), PEC-IV, PEC-V and OEC-II (sem 7). PEC slots I, II and IV take Group 1 courses; III and V take Group 2. The same elective can never be taken twice. An elective can be swapped only before marks are entered for it.
- **MSE rules (Appendix B):** a theory course (hours L > 0 and a semester-end exam) has MSE1 and MSE2 out of 20 each and three tasks totalling 10 (4 + 4 + 2). Labs, internships, projects and CIE-only courses have no MSEs, so students enter one CIE mark up to that course's maximum. A department's HOD can change the limits.
- **Lateral entry:** bridge courses MA1012-1 and MA1014-1 appear only for students who tick lateral entry.

## Duplicates removed
| In the syllabus | What the app does |
|---|---|
| Internship-I (UC1001-1) appears in the first-year table **and** semester IV | Kept once, in semester IV, where its credit is awarded |
| Research Methodology appears as HU1010-1 (scheme) **and** ME1659-1 (AEC list) | Kept HU1010-1, the one with a full course page |
| Kannada (HU1003-1) has two course pages under one code | One entry: "Kannada (Balake / Samskrithika)" |
| Open electives that repeat mandatory ISE topics: HU1502-1 Intellectual Property Rights (vs HU1006-1), MA2501-1 Linear Algebra (vs MA2005-1), CS2502-1 Introduction to Data Structures (vs CS2001-1) | Hidden from IS students |
| ISE's own open electives IS2501-1 to IS2504-1 | These are for *other* branches, so IS students do not see them |
| First-year tables printed twice (overview and per-group) | One copy of each course |

## Conflicts inside the syllabus (please confirm with the department)
1. **IS2651-1** is called "C++ Programming" in the elective list, but the course pages with that code are "Basics of R Programming". The app uses the course-page title.
2. **IS2652-1** (Fundamentals of Angular and ReactJS) is labelled PEC on its course page but is listed among the AEC electives, so it is offered as an AEC.
3. **IS3651-1** (Mobile Application Development) is 1 credit on its course page, while the AEC slot is 2 credits.
4. Some course pages show different L-T-P hours than the scheme tables (for example CY1003-1, ME1654-1). The **scheme table** values are used.
5. HU1002-1 is labelled HSMC in one table and MNC in another; it is non-credit, so it is listed as MNC.

## Not covered
Only the **Information Science & Engineering 2023 batch** is preloaded; that is the only syllabus provided. Every other branch and batch starts empty: students see a clear message, and their HOD can copy a batch, import a CSV or add courses under **Curriculum**.
The open-elective pool (offered by other departments) is shared by all branches; if a later syllabus changes it, edit it in the data file `server/src/seed/curriculum.is.2023.ts`.
