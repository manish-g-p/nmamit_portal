// Information Science & Engineering: B.Tech scheme for the batch admitted in AY 2023-24 (Regulations 2023, Version 2023.04).
// Source: "Regulations and Curriculum for B.Tech in Information Science and Engineering", scheme tables (pp. 21-26 and 56-111), elective lists (p. 111-113).
// Each course appears ONCE. Duplicates and conflicts found in the source are resolved in `note` fields and docs/CURRICULUM_NOTES.md.

export type CourseSeed = {
  code: string; title: string; category: string; l: number; t: number; p: number; credits: number; cie: number; see: number;
  semester?: number;            // fixed semester for core courses of years 2-4
  table?: 'A' | 'B';            // first-year course tables; the semester depends on the student's group (see FIRST_YEAR)
  audience?: 'lateral';         // only for lateral-entry (diploma) students
  slot?: string; group?: 'G1' | 'G2'; stream?: string; offeredBy?: string; notFor?: string[]; note?: string;
};

// Group I: table A in semester 1, table B in semester 2.  Group II: table B in semester 1, table A in semester 2.
export const FIRST_YEAR = { I: { A: 1, B: 2 }, II: { A: 2, B: 1 } } as const;

// Elective slots. A student picks exactly one course per slot; the same elective cannot be chosen twice.
export const SLOTS: Record<string, { semester: number; label: string; group?: 'G1' | 'G2'; credits: number }> = {
  VEC: { semester: 4, label: 'Vocational Education Course (department specific)', credits: 1 },
  'PEC-I': { semester: 5, label: 'Professional Elective I (Group 1)', group: 'G1', credits: 3 },
  'AEC-P': { semester: 5, label: 'Program Specific Ability Enhancement Course', credits: 2 },
  'PEC-II': { semester: 6, label: 'Professional Elective II (Group 1)', group: 'G1', credits: 3 },
  'PEC-III': { semester: 6, label: 'Professional Elective III (Group 2)', group: 'G2', credits: 3 },
  'OEC-I': { semester: 6, label: 'Open Elective I (offered by another department)', credits: 3 },
  'PEC-IV': { semester: 7, label: 'Professional Elective IV (Group 1)', group: 'G1', credits: 3 },
  'PEC-V': { semester: 7, label: 'Professional Elective V (Group 2)', group: 'G2', credits: 3 },
  'OEC-II': { semester: 7, label: 'Open Elective II (offered by another department)', credits: 3 },
};

const c = (code: string, title: string, category: string, l: number, t: number, p: number, credits: number, cie: number, see: number, extra: Partial<CourseSeed> = {}): CourseSeed =>
  ({ code, title, category, l, t, p, credits, cie, see, ...extra });

export const CORE: CourseSeed[] = [
  // ---- First year, table A ----
  c('MA1002-1', 'Calculus and Differential Equations', 'BSC', 3, 0, 0, 3, 50, 50, { table: 'A' }),
  c('PH1004-1', 'Quantum Computing and Modern Physics', 'BSC', 3, 0, 2, 4, 50, 50, { table: 'A' }),
  c('CS1005-1', 'Introduction to Python Programming', 'PLC', 2, 0, 2, 3, 50, 50, { table: 'A' }),
  c('EC1001-1', 'Basic Electronics', 'ESC', 3, 0, 0, 3, 50, 50, { table: 'A' }),
  c('IS1101-1', 'Fundamentals of Cyber Security', 'ETC', 3, 0, 0, 3, 50, 50, { table: 'A' }),
  c('HU1001-1', 'Technical English', 'HSMC', 1, 0, 2, 2, 50, 50, { table: 'A' }),
  c('HU1002-1', 'Constitution of India', 'MNC', 1, 0, 0, 0, 50, 0, { table: 'A', note: 'Mandatory non-credit course (CIE only).' }),
  c('MA1006-1', 'Mathematics with MATLAB', 'BSC', 0, 0, 2, 1, 50, 0, { table: 'A' }),
  // ---- First year, table B ----
  c('MA1007-1', 'Discrete Mathematics and Transform Techniques', 'BSC', 4, 0, 0, 4, 50, 50, { table: 'B' }),
  c('CY1003-1', 'Materials Chemistry for Computer Systems', 'BSC', 3, 0, 2, 4, 50, 50, { table: 'B' }),
  c('EC1002-1', 'Applied Digital Logic Design', 'ESC', 2, 0, 2, 3, 50, 50, { table: 'B' }),
  c('CS1004-1', 'Introduction to C Programming', 'PLC', 2, 0, 2, 3, 50, 50, { table: 'B' }),
  c('EE1001-2', 'Basic Electrical Engineering', 'ESC', 2, 0, 2, 3, 50, 50, { table: 'B' }),
  c('CS1651-1', 'IT Skills', 'AEC', 1, 0, 2, 2, 50, 50, { table: 'B' }),
  c('BT1651-1', 'Biology for Engineers', 'AEC', 1, 0, 0, 1, 50, 50, { table: 'B' }),
  c('ME1004-1', 'Engineering Visualization', 'ESC', 0, 0, 2, 1, 50, 0, { table: 'B' }),
  c('CV1002-1', 'Environmental Studies', 'MNC', 1, 0, 0, 0, 50, 0, { table: 'B', note: 'Mandatory non-credit course (CIE only).' }),
  // ---- Semester 3 ----
  c('MA2001-1', 'Statistics and Probability Theory', 'BSC', 3, 0, 0, 3, 50, 50, { semester: 3 }),
  c('CS2001-1', 'Data Structures', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 3 }),
  c('CS2002-1', 'Object Oriented Programming', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 3 }),
  c('IS2101-1', 'Computer Organization & Design', 'PCC', 3, 0, 0, 3, 50, 50, { semester: 3 }),
  c('IS1102-2', 'Introduction to Data Science', 'PCC', 3, 0, 0, 3, 50, 50, { semester: 3 }),
  c('IS1602-1', 'Unix Shell and System Programming', 'PCC (Lab)', 0, 0, 2, 1, 50, 50, { semester: 3 }),
  c('HU2001-1', 'Enhancing Self Competence', 'HSMC', 2, 0, 0, 2, 50, 50, { semester: 3 }),
  c('HU1003-1', 'Kannada (Balake / Samskrithika)', 'MNC', 1, 0, 0, 0, 50, 0, { semester: 3, note: 'One code, two variants in the syllabus (Balake Kannada and Kannada for Administration); shown once.' }),
  c('MA1012-1', 'Bridge Course: Calculus & Differential Equations', 'MNC', 3, 0, 0, 0, 100, 0, { semester: 3, audience: 'lateral', note: 'Only for lateral-entry diploma students.' }),
  // ---- Semester 4 ----
  c('MA2005-1', 'Linear Algebra and its Applications', 'BSC', 3, 0, 0, 3, 50, 50, { semester: 4 }),
  c('CS3004-1', 'Design and Analysis of Algorithms', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 4 }),
  c('IS2001-2', 'Internet & Web Programming', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 4 }),
  c('CS2102-1', 'Database Management Systems', 'PCC', 3, 0, 0, 3, 50, 50, { semester: 4 }),
  c('IS1103-1', 'Introduction to Software Engineering', 'PCC', 3, 0, 0, 3, 50, 50, { semester: 4 }),
  c('IS1601-1', 'Database Applications', 'PCC (Lab)', 0, 0, 2, 1, 50, 50, { semester: 4 }),
  c('HU1004-1', 'Universal Human Values', 'HSMC', 1, 0, 0, 1, 50, 50, { semester: 4 }),
  c('HU2002-1', 'Developing Professional Skills', 'HSMC', 1, 0, 0, 1, 50, 50, { semester: 4 }),
  c('ME1654-1', 'Innovation and Design Thinking', 'AEC', 1, 0, 0, 1, 50, 50, { semester: 4 }),
  c('HU1005-1', 'Essence of Indian Culture', 'HEC', 1, 0, 0, 0, 50, 0, { semester: 4, note: 'Non-credit (CIE only).' }),
  c('UC1001-1', 'Internship-I (Activity based internship)', 'UCC', 0, 0, 0, 2, 100, 0, { semester: 4, note: 'Done during the I & II semester vacations; the credit is in the IV semester grade card. Listed once (the syllabus repeats it in the first-year table).' }),
  c('MA1014-1', 'Bridge Course: Discrete Math & Numerical Methods', 'MNC', 3, 0, 0, 0, 100, 0, { semester: 4, audience: 'lateral', note: 'Only for lateral-entry diploma students.' }),
  // ---- Semester 5 ----
  c('IS3001-1', 'Data Communication and Networking', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 5 }),
  c('IS2002-1', 'Machine Learning Foundations', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 5 }),
  c('IS3101-1', 'Operating Systems Fundamentals', 'PCC', 3, 0, 0, 3, 50, 50, { semester: 5 }),
  c('IS1604-1', 'MERNSTACK Development', 'PCC (Lab)', 0, 0, 2, 1, 50, 50, { semester: 5 }),
  c('HU1006-1', 'Introduction to IPR', 'HSMC', 1, 0, 0, 1, 50, 50, { semester: 5 }),
  c('HU1007-1', 'Social Connect & Responsibility', 'AEC', 1, 0, 0, 1, 50, 50, { semester: 5 }),
  c('UM1003-1', 'Employability Skill Development', 'AEC', 1, 0, 0, 1, 50, 0, { semester: 5 }),
  // ---- Semester 6 ----
  c('IS4001-1', 'Information & Network Security', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 6 }),
  c('IS3102-1', 'Automata Theory & Compiler Design', 'PCC', 3, 0, 0, 3, 50, 50, { semester: 6 }),
  c('IS3601-1', 'Problem Solving on Online Coding Platforms', 'PCC (Lab)', 0, 0, 2, 1, 50, 50, { semester: 6 }),
  c('MG1003-1', 'Management & Entrepreneurship', 'HSMC', 3, 0, 0, 3, 50, 50, { semester: 6 }),
  c('HU1008-1', 'Life Skills for Engineers', 'AEC', 1, 0, 0, 1, 50, 50, { semester: 6 }),
  // ---- Semester 7 ----
  c('IS3002-1', 'Ethical Hacking and Network Defence', 'IPCC', 3, 0, 2, 4, 50, 50, { semester: 7 }),
  c('IS3602-1', 'Internet of Things', 'PCC (Lab)', 0, 0, 2, 1, 50, 50, { semester: 7 }),
  c('MG1002-1', 'Financial Management', 'HSMC', 3, 0, 0, 3, 50, 50, { semester: 7 }),
  c('HU1009-1', 'Indian Knowledge Systems', 'HEC', 1, 0, 0, 1, 50, 0, { semester: 7 }),
  c('UC3001-1', 'Major Project Phase I', 'UCC', 0, 0, 4, 2, 100, 0, { semester: 7 }),
  // ---- Semester 8 ----
  c('UC2001-1', 'Internship-II', 'UCC', 0, 0, 0, 8, 50, 50, { semester: 8, note: 'Eight weeks, completed during the vacations between semesters IV and VII; credited in semester VIII.' }),
  c('UC3002-1', 'Major Project Phase II', 'UCC', 0, 0, 0, 8, 100, 100, { semester: 8 }),
];

const vec = (code: string, title: string) => c(code, title, 'VEC', 0, 0, 2, 1, 50, 50, { slot: 'VEC' });
const aec = (code: string, title: string, l: number, t: number, p: number, cr: number, note?: string) => c(code, title, 'AEC', l, t, p, cr, 50, 50, { slot: 'AEC-P', note });
const pec = (code: string, title: string, group: 'G1' | 'G2', stream: string) => c(code, title, 'PEC', 3, 0, 0, 3, 50, 50, { group, stream });

export const ELECTIVES: CourseSeed[] = [
  vec('IS1551-1', 'Python Programming Fundamentals'), vec('IS1552-1', 'Server-Side Scripting'), vec('IS1553-1', 'Data Visualization Tools'),
  aec('IS1651-1', 'Professional Ethics', 2, 0, 0, 2),
  aec('IS2651-1', 'Basics of R Programming', 1, 0, 2, 2, 'The syllabus scheme list calls IS2651-1 "C++ Programming", but the course pages titled "Basics of R Programming" carry this code. The course-page title is used.'),
  aec('IS2652-1', 'Fundamentals of Angular and ReactJS', 2, 0, 0, 2, 'Course page labels it PEC; the AEC list includes it, so it is offered here.'),
  aec('IS2653-1', 'Technical Content Writing', 1, 0, 2, 2),
  aec('IS3651-1', 'Mobile Application Development', 0, 0, 2, 1, 'Course page gives 1 credit (the slot is 2 credits in the scheme).'),
  aec('HU1010-1', 'Research Methodology', 2, 0, 0, 2, 'The syllabus lists Research Methodology twice (HU1010-1 in the scheme, ME1659-1 in the AEC list); one entry is kept.'),
  // Professional electives. Slots PEC-I, II, IV take Group 1; PEC-III, V take Group 2.
  pec('IS2201-1', 'Information Storage Management', 'G1', 'IT Management'), pec('IS3201-1', 'iOS App Development using Xcode and Swift', 'G1', 'IT Management'),
  pec('IS3202-1', 'Robotic Process Automation Design & Development', 'G1', 'IT Management'), pec('IS1201-1', 'Total Quality Management for Sustainable Growth', 'G1', 'IT Management'),
  pec('IS2301-1', 'Innovation Management & Business Models', 'G2', 'IT Management'), pec('IS3301-1', 'NoSQL Database', 'G2', 'IT Management'),
  pec('IS1301-1', 'Supply Chain Management and Enterprise Resource Planning', 'G2', 'IT Management'), pec('IS2302-1', 'User Interface Design', 'G2', 'IT Management'),
  pec('IS3211-1', 'Advanced Java Programming', 'G1', 'Software Engineering and Development'), pec('IS2212-1', 'Business Intelligence and its Applications', 'G1', 'Software Engineering and Development'),
  pec('IS2213-1', 'Object Oriented Modeling and Design', 'G1', 'Software Engineering and Development'), pec('IS2214-1', 'Software Testing', 'G1', 'Software Engineering and Development'),
  pec('IS2311-1', 'Agile Technology', 'G2', 'Software Engineering and Development'), pec('IS2312-1', 'Full Stack Development', 'G2', 'Software Engineering and Development'),
  pec('IS3313-1', 'Human Computer Interaction', 'G2', 'Software Engineering and Development'), pec('IS2314-1', 'Software Architecture and Design Patterns', 'G2', 'Software Engineering and Development'),
  pec('IS4221-1', 'Adhoc Wireless Networks', 'G1', 'Networks & Security'), pec('IS4222-1', 'Computing in Communication Networks', 'G1', 'Networks & Security'),
  pec('IS4223-1', 'Network Engineering', 'G1', 'Networks & Security'), pec('IS4224-1', 'Software Defined Networks', 'G1', 'Networks & Security'),
  pec('IS3321-1', 'Blockchain Technology', 'G2', 'Networks & Security'), pec('IS4321-1', 'Intrusion Detection System', 'G2', 'Networks & Security'),
  pec('IS4322-1', 'Wireless Networks and Mobile Computing', 'G2', 'Networks & Security'), pec('IS4323-1', 'Wireless Sensor Networks', 'G2', 'Networks & Security'),
  pec('IS2231-1', 'Artificial Intelligence', 'G1', 'Data Science and Machine Intelligence'), pec('IS2232-1', 'Bio Informatics', 'G1', 'Data Science and Machine Intelligence'),
  pec('IS3233-1', 'Fundamentals of Image Processing', 'G1', 'Data Science and Machine Intelligence'), pec('IS1231-1', 'Introduction to Drones', 'G1', 'Data Science and Machine Intelligence'),
  pec('IS3331-1', 'Data Mining', 'G2', 'Data Science and Machine Intelligence'), pec('IS3332-1', 'Deep Learning', 'G2', 'Data Science and Machine Intelligence'),
  pec('IS3333-1', 'Game Theory & Applications', 'G2', 'Data Science and Machine Intelligence'), pec('IS3334-1', 'Social and Web Analytics', 'G2', 'Data Science and Machine Intelligence'),
  pec('IS3241-1', 'Cloud Computing', 'G1', 'General'), pec('IS3242-1', 'Graphics and Animation', 'G1', 'General'),
  pec('IS3243-1', 'Multicore Architecture & Programming', 'G1', 'General'), pec('IS3244-1', 'Multimedia Processing', 'G1', 'General'),
  pec('IS3341-1', 'AI and ML in Healthcare', 'G2', 'General'), pec('IS3342-1', 'Computer Vision', 'G2', 'General'),
  pec('IS3343-1', 'Operations Research', 'G2', 'General'), pec('IS3344-1', 'Virtual Reality', 'G2', 'General'),
];

// Open electives: a pool offered institution-wide. A department's own offerings are not available to its own students,
// and a few titles duplicate mandatory ISE courses, so they are excluded for IS (see `notFor`).
const oec = (code: string, title: string, l = 3, t = 0, p = 0, notFor: string[] = [], note?: string): CourseSeed =>
  c(code, title, 'OEC', l, t, p, 3, 50, 50, { offeredBy: code.slice(0, 2), slot: 'OEC', notFor: [code.slice(0, 2), ...notFor], note });
export const OPEN_ELECTIVES: CourseSeed[] = [
  oec('IS2501-1', 'Introduction to Cyber Security'), oec('IS2502-1', 'Python Application Programming'), oec('IS2503-1', 'Software Engineering Practices'), oec('IS2504-1', 'Web Technologies'),
  oec('BT1501-1', 'Biofuel Engineering'), oec('BT1502-1', 'Solid Waste Management'),
  oec('CS2501-1', 'Fundamentals of AI and ML'), oec('CS2502-1', 'Introduction to Data Structures', 3, 0, 0, ['IS'], 'Excluded for IS: duplicates the mandatory Data Structures course (CS2001-1).'),
  oec('CV2501-1', 'Disaster Management'), oec('CV2502-1', 'Environmental Hygiene, Sanitation and Waste Management'), oec('CV2503-1', 'Environmental Impact Assessment'),
  oec('CV2504-1', 'Introduction to Geoinformatics'), oec('CV2505-1', 'Sustainability Engineering'),
  oec('CY2501-1', 'Corrosion Science'), oec('CY2502-1', 'Natural Products Chemistry'),
  oec('EC1501-1', 'Artificial Neural Network Systems'), oec('EC1502-1', 'Introduction to MATLAB Programming: A Hands-on Approach', 2, 0, 2), oec('EC1503-1', 'Robotics'),
  oec('EC2501-1', 'Consumer Electronics'), oec('EC2502-1', 'PCB Design and Fabrication', 1, 0, 4), oec('EC2503-1', 'Space Technology and Applications'),
  oec('EE2501-1', 'Battery Management System'), oec('EE2502-1', 'Biomedical Instrumentation'), oec('EE2503-1', 'Electric Vehicle Technology'),
  oec('EE2504-1', 'Fundamentals of PLC and its Applications'), oec('EE2505-1', 'Motors and Motor Control Circuits'), oec('EE2506-1', 'Non-Conventional Energy Sources'),
  oec('HU1501-1', 'Elements of Yoga'), oec('HU1502-1', 'Intellectual Property Rights', 3, 0, 0, ['IS'], 'Excluded for IS: duplicates the mandatory Introduction to IPR (HU1006-1).'),
  oec('HU1503-1', 'Introduction to German Language'), oec('HU1504-1', 'Introduction to Japanese Language'),
  oec('HU1505-1', 'National Cadet Corps: Organization, Functions and Capabilities'), oec('HU1506-1', 'Overview of Indian Culture'), oec('HU1507-1', 'Philosophy'),
  oec('HU1508-1', 'Principles of Physical Education'), oec('HU1513-1', 'Introduction to Yakshagana', 2, 0, 2), oec('HU2501-1', 'Common Sense and Critical Thinking'), oec('HU2502-1', 'Linguistics & Language Technology'),
  oec('MA1501-1', 'Graph Theory'), oec('MA1502-1', 'Number Theory'), oec('MA2501-1', 'Linear Algebra', 3, 0, 0, ['IS'], 'Excluded for IS: duplicates the mandatory Linear Algebra and its Applications (MA2005-1).'),
  oec('ME1501-1', 'Automotive Engineering'), oec('ME1502-1', 'Industrial Pollution Control'), oec('ME1503-1', 'Sustainable Development Goals'), oec('ME1504-1', 'Technological Innovation'), oec('ME1505-1', 'Integrated Automotive Safety'),
  oec('MG1501-1', 'Human Resource Management'), oec('MG1502-1', 'Management Accounting and Control System'), oec('MG1503-1', 'Operations and Quality Management'), oec('MG1504-1', 'Organizational Behaviour'),
  oec('MG1505-1', 'Taxation for Engineers'), oec('MG1506-1', 'Working Capital Management'), oec('MG1507-1', 'Engineering Economics & Financial Management'),
  oec('PH2501-1', 'Nanotechnology'), oec('PH2502-1', 'Optoelectronic Devices'),
  oec('RI2501-1', 'Autonomous Mobile Robots'), oec('RI2503-1', 'PLC Control of Hydraulic and Pneumatic Circuits', 3, 0, 0, [], 'Per the syllabus: for all branches except AI.'),
];

export const ISE_2023 = { departmentCode: 'IS', admissionYear: 2023 };
