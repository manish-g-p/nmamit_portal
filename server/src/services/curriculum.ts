import { Department } from '../models/Department.js';
import { CurriculumCourse } from '../models/CurriculumCourse.js';
import { Subject } from '../models/Subject.js';
import { User } from '../models/User.js';
import { DEPARTMENTS, DEFAULT_DEGREE_LABEL } from '../seed/departments.data.js';
import { CORE, ELECTIVES, FIRST_YEAR, OPEN_ELECTIVES, SLOTS, ISE_2023, type CourseSeed } from '../seed/curriculum.is.2023.js';

export const hasMseFor = (x: { l: number; see: number }) => x.l > 0 && x.see > 0;
export const academicYearFor = (admissionYear: number, semester: number) => {
  const start = admissionYear + Math.ceil(semester / 2) - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
};

const toDoc = (s: CourseSeed, admissionYear: number, department: any) => ({
  admissionYear, department, code: s.code, title: s.title, category: s.category, l: s.l, t: s.t, p: s.p, credits: s.credits, cie: s.cie, see: s.see,
  hasMse: hasMseFor(s), semester: s.semester, table: s.table, audience: s.audience ?? 'all', slot: s.slot, group: s.group, stream: s.stream,
  offeredBy: s.offeredBy, notFor: s.notFor ?? [], note: s.note, active: true,
});

// Idempotent. Runs at every server start, so a fresh production database needs no manual seeding.
// Brings data written by earlier versions in line with the current model. Idempotent and cheap, so it runs on every start.
async function migrateLegacyData() {
  // Subjects typed by hand before the curriculum existed always used MSE and task marks.
  await Subject.collection.updateMany({ hasMse: { $exists: false } }, { $set: { hasMse: true } });
  // Earlier versions required email verification. Verified or not, students are active now; professors wait for their HOD.
  await User.collection.updateMany({ role: 'student', status: { $in: ['registration_pending', 'email_verified'] } }, { $set: { status: 'active' } });
  await User.collection.updateMany({ role: 'professor', status: { $in: ['registration_pending', 'email_verified'] } }, { $set: { status: 'awaiting_approval' } });
}

export async function ensureReferenceData() {
  await migrateLegacyData();
  for (const d of DEPARTMENTS) {
    await Department.updateOne({ name: d.name }, { $set: { code: d.code, alias: d.alias, degreeLabel: DEFAULT_DEGREE_LABEL }, $setOnInsert: { name: d.name, active: true } }, { upsert: true });
  }
  const is = await Department.findOne({ code: ISE_2023.departmentCode });
  if (!is) return;
  const ops = [
    ...[...CORE, ...ELECTIVES].map((s) => ({ s, department: is._id })),
    ...OPEN_ELECTIVES.map((s) => ({ s, department: null })),
  ];
  for (const { s, department } of ops) {
    const doc = toDoc(s, ISE_2023.admissionYear, department);
    // Existing rows keep any HOD edits to `active`; syllabus facts are refreshed.
    const { active, ...facts } = doc;
    await CurriculumCourse.updateOne({ admissionYear: doc.admissionYear, department, code: doc.code }, { $set: facts, $setOnInsert: { active: true } }, { upsert: true });
  }
}

export const semesterOfCourse = (c: any, group?: 'I' | 'II') => (c.table ? (group ? FIRST_YEAR[group][c.table as 'A' | 'B'] : undefined) : c.semester);

type Student = { _id: any; department: any; admissionYear: number; firstYearGroup?: 'I' | 'II'; lateralEntry?: boolean; deptCode?: string };

// What a student can take: core courses by semester and elective slots with their options.
export async function curriculumFor(st: Student) {
  const dept = await Department.findById(st.department).lean();
  const deptCode = dept?.code ?? '';
  const own = await CurriculumCourse.find({ admissionYear: st.admissionYear, department: st.department, active: true }).lean();
  if (!own.length) return { available: false as const, deptCode, semesters: [], needsGroup: false, firstYearGroup: null, canChangeGroup: false };
  const pool = await CurriculumCourse.find({ admissionYear: st.admissionYear, department: null, active: true }).lean();
  const registered = await Subject.find({ student: st._id }).lean();
  const canChangeGroup = !registered.some((r) => r.semester <= 2); // the group can be corrected until first-year subjects are registered
  const semesters = Array.from({ length: 8 }, (_, i) => {
    const sem = i + 1;
    const core = own.filter((c) => !c.slot && !c.group && (st.lateralEntry || c.audience !== 'lateral') && semesterOfCourse(c, st.firstYearGroup) === sem && c.category !== 'PEC');
    const slots = Object.entries(SLOTS).filter(([, v]) => v.semester === sem).map(([slot, v]) => {
      const options = slot.startsWith('OEC')
        ? pool.filter((c) => !(c.notFor ?? []).includes(deptCode))
        : slot === 'VEC' || slot === 'AEC-P' ? own.filter((c) => c.slot === slot) : own.filter((c) => c.category === 'PEC' && c.group === v.group);
      const chosen = registered.find((r) => r.semester === sem && r.slot === slot);
      return { slot, label: v.label, group: v.group ?? null, credits: v.credits, chosen: chosen ? { subjectId: chosen._id, code: chosen.code, name: chosen.name } : null, options: options.map((o) => ({ _id: o._id, code: o.code, title: o.title, credits: o.credits, stream: o.stream ?? null, offeredBy: o.offeredBy ?? null, note: o.note ?? null })) };
    });
    const loaded = core.length > 0 && core.every((c) => registered.some((r) => r.semester === sem && r.code === c.code));
    return { semester: sem, core: core.map((c) => ({ _id: c._id, code: c.code, title: c.title, category: c.category, credits: c.credits, hasMse: c.hasMse, note: c.note ?? null })), slots, loaded };
  });
  return { available: true as const, deptCode, semesters, needsGroup: !st.firstYearGroup, firstYearGroup: st.firstYearGroup ?? null, canChangeGroup };
}

const subjectFrom = (st: Student, sem: number, c: any, slot?: string) => ({
  student: st._id, semester: sem, academicYear: academicYearFor(st.admissionYear, sem), code: c.code, name: c.title, course: c._id, category: c.category, credits: c.credits,
  slot, hasMse: !!c.hasMse, cieMax: c.cie,
});

// Registers all core courses of a semester. Safe to call repeatedly: existing registrations are left alone.
export async function loadSemester(st: Student, sem: number) {
  const view = await curriculumFor(st);
  if (!view.available) return { error: 'The curriculum for your branch and batch has not been added yet. Ask your HOD to add it.', code: 404 as const };
  if (sem <= 2 && !st.firstYearGroup) return { error: 'Choose your first-year group (I or II) first.', code: 400 as const };
  const s = view.semesters[sem - 1];
  if (!s.core.length) return { error: 'This semester has no fixed courses.', code: 400 as const };
  let added = 0;
  for (const c of s.core) {
    if (await Subject.exists({ student: st._id, semester: sem, code: c.code })) continue;
    const full = await CurriculumCourse.findById(c._id).lean();
    await Subject.create(subjectFrom(st, sem, full)); added++;
  }
  return { added, total: s.core.length };
}

// Registers one elective into a slot. One course per slot, and the same elective can never be taken twice.
export async function chooseElective(st: Student, slot: string, courseId: string) {
  const def = SLOTS[slot]; if (!def) return { error: 'Unknown elective slot.', code: 400 as const };
  const view = await curriculumFor(st);
  if (!view.available) return { error: 'The curriculum for your branch and batch has not been added yet.', code: 404 as const };
  const s = view.semesters[def.semester - 1].slots.find((x) => x.slot === slot);
  const option = s?.options.find((o) => String(o._id) === String(courseId));
  if (!s || !option) return { error: 'That course is not available for this elective slot.', code: 400 as const };
  if (s.chosen) return { error: `You already chose ${s.chosen.code} for this slot.`, code: 409 as const };
  if (await Subject.exists({ student: st._id, code: option.code })) return { error: 'You have already registered this course.', code: 409 as const };
  const full = await CurriculumCourse.findById(courseId).lean();
  return { subject: await Subject.create(subjectFrom(st, def.semester, full, slot)) };
}
