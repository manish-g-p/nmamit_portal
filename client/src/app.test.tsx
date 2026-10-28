import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Landing, Login, Signup } from './pages/Auth';
import { Portfolio, SubjectCard } from './pages/Student';
import { Guard } from './App';
import { StatusBadge } from './components/ui';
import { AuthProvider } from './lib/auth';

const calls: { url: string; init?: RequestInit }[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body?: any }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); const r = handler(url, init); return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } }); }));
}
beforeEach(() => { calls.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (ui: React.ReactNode, path = '/') => render(<MemoryRouter initialEntries={[path]}><AuthProvider>{ui}</AuthProvider></MemoryRouter>);
const signedOut = (url: string) => (url.endsWith('/api/auth/me') ? { status: 401, body: { error: 'Not authenticated' } } : url.includes('departments') ? { body: [{ _id: 'd1', name: 'Information Science & Engineering' }] } : { body: {} });

describe('landing and login', () => {
  it('offers login and sign up for Student, Faculty and HOD', async () => {
    mockFetch(signedOut); wrap(<Landing />);
    for (const r of ['Student', 'Faculty', 'HOD']) { expect(await screen.findByRole('link', { name: `${r} login` })).toBeInTheDocument(); expect(screen.getByRole('link', { name: `${r} sign up` })).toBeInTheDocument(); }
  });
  it('sends the chosen portal with the login and shows the server\'s message when the account type does not match', async () => {
    mockFetch((url) => url.endsWith('/api/auth/me') ? { status: 401, body: {} } : { status: 403, body: { error: 'This is a Student account. Use the Student login.' } });
    wrap(<Routes><Route path="/login/:portal" element={<Login />} /></Routes>, '/login/hod'); const u = userEvent.setup();
    await u.type(await screen.findByLabelText(/institutional email/i), 'a@nmamit.in'); await u.type(screen.getByLabelText(/^password$/i), 'Whatever123');
    await u.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This is a Student account');
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/login'))!.init!.body))).toMatchObject({ portal: 'hod' });
    expect(screen.getByRole('heading', { name: /hod login/i })).toBeInTheDocument();
  });
  it('has no forgot-password or email-verification links', async () => {
    mockFetch(signedOut); wrap(<Routes><Route path="/login/:portal" element={<Login />} /></Routes>, '/login/student');
    await screen.findByLabelText(/institutional email/i); expect(screen.queryByText(/forgot your password\?$/i)).not.toBeInTheDocument(); expect(screen.queryByText(/verify/i)).not.toBeInTheDocument();
  });
});

describe('sign-up forms', () => {
  const route = (path: string) => wrap(<Routes><Route path="/signup/:portal" element={<Signup />} /></Routes>, path);
  it('student must pick a branch and first-year group, and sees every problem at once without calling the API', async () => {
    mockFetch(signedOut); route('/signup/student'); const u = userEvent.setup();
    await u.type(await screen.findByLabelText(/full name/i), 'Test Student'); await u.type(screen.getByLabelText(/institutional email/i), 'x@nmamit.in');
    await u.type(screen.getByLabelText(/^password$/i), 'short'); await u.type(screen.getByLabelText(/confirm password/i), 'different');
    await u.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/choose your branch/i)).toBeInTheDocument(); expect(screen.getByText(/choose your first-year group/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument(); expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument(); expect(screen.getByText(/accept the privacy notice/i, { selector: '[role=alert]' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/register'))).toBe(false);
  });
  it('HOD sign-up asks for the access code; faculty sign-up does not', async () => {
    mockFetch(signedOut); route('/signup/hod'); expect(await screen.findByLabelText(/hod access code/i)).toBeInTheDocument(); cleanup();
    mockFetch(signedOut); route('/signup/faculty'); await screen.findByLabelText(/full name/i); expect(screen.queryByLabelText(/access code/i)).not.toBeInTheDocument();
    expect(screen.getByText(/department hod approves each faculty account/i)).toBeInTheDocument();
  });
});

describe('assessment entry', () => {
  const theory = { _id: 's1', code: 'IS3001-1', name: 'Data Communication and Networking', category: 'IPCC', credits: 4, hasMse: true, assessment: null };
  it('enforces the syllabus limits in the browser (MSE 20, TASK 4/4/2) and makes no API call with invalid marks', async () => {
    mockFetch(() => ({ body: {} })); render(<SubjectCard s={theory} onChange={() => {}} />); const u = userEvent.setup();
    await u.type(screen.getByLabelText(/MSE1/i), '21'); await u.type(screen.getByLabelText(/TASK1/i), '5'); await u.type(screen.getByLabelText(/TASK3/i), '3'); await u.click(screen.getByRole('button', { name: /save marks/i }));
    expect(await screen.findByText(/MSE1 is out of 20/i)).toBeInTheDocument(); expect(screen.getByText(/TASK1 is out of 4/i)).toBeInTheDocument(); expect(screen.getByText(/TASK3 is out of 2/i)).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
  });
  it('shows the live task subtotal and sends valid marks', async () => {
    mockFetch(() => ({ body: {} })); render(<SubjectCard s={theory} onChange={() => {}} />); const u = userEvent.setup();
    await u.type(screen.getByLabelText(/TASK1/i), '4'); await u.type(screen.getByLabelText(/TASK2/i), '3'); await u.type(screen.getByLabelText(/TASK3/i), '2');
    expect(screen.getByText(/Task subtotal/i)).toHaveTextContent('9'); await u.click(screen.getByRole('button', { name: /save marks/i }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'PUT')!.init!.body))).toMatchObject({ task1: 4, task2: 3, task3: 2, mse1: null });
  });
  it('uses the HOD-configured limits when they differ from the defaults', async () => {
    mockFetch(() => ({ body: {} })); render(<SubjectCard s={theory} rules={{ mse1Max: 25, mse2Max: 25, task1Max: 4, task2Max: 4, task3Max: 2 }} onChange={() => {}} />);
    expect(screen.getByLabelText(/MSE1 \(max 25\)/i)).toBeInTheDocument();
  });
  it('labs, projects and CIE-only courses show a single CIE field limited to the course maximum', async () => {
    mockFetch(() => ({ body: {} })); render(<SubjectCard s={{ ...theory, code: 'IS1604-1', name: 'MERNSTACK Development', hasMse: false, cieMax: 50 }} onChange={() => {}} />); const u = userEvent.setup();
    expect(screen.queryByLabelText(/MSE1/i)).not.toBeInTheDocument(); expect(screen.queryByLabelText(/TASK1/i)).not.toBeInTheDocument();
    await u.type(screen.getByLabelText(/CIE marks \(max 50\)/i), '51'); await u.click(screen.getByRole('button', { name: /save marks/i }));
    expect(await screen.findByText(/CIE marks is out of 50/i)).toBeInTheDocument(); expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
  });
  it('locks the form while the mentor is reviewing', () => {
    mockFetch(() => ({ body: [] })); render(<SubjectCard s={{ ...theory, assessment: { _id: 'a1', status: 'awaiting_mentor_review', version: 1 } }} onChange={() => {}} />);
    expect(screen.getByLabelText(/TASK1/i)).toBeDisabled(); expect(screen.getByText(/with your mentor/i)).toBeInTheDocument();
  });
});

describe('route guard and status labels', () => {
  const me = (over: any = {}) => ({ id: '1', fullName: 'S', email: 's@x', role: 'student', department: 'd', mustChangePassword: false, ...over });
  const app = (path: string) => wrap(<Routes><Route path="/unauthorized" element={<p>no access page</p>} /><Route path="/" element={<p>start page</p>} /><Route path="/change-password" element={<p>change password page</p>} /><Route path="/hod" element={<Guard role="hod"><p>hod secret</p></Guard>} /></Routes>, path);
  it('sends a student away from an HOD page (the server also enforces this)', async () => { mockFetch(() => ({ body: me() })); app('/hod'); expect(await screen.findByText('no access page')).toBeInTheDocument(); expect(screen.queryByText('hod secret')).not.toBeInTheDocument(); });
  it('sends signed-out visitors to the start page', async () => { mockFetch(() => ({ status: 401, body: { error: 'x' } })); app('/hod'); expect(await screen.findByText('start page')).toBeInTheDocument(); });
  it('forces a password change before anything else when a temporary password was issued', async () => { mockFetch(() => ({ body: me({ role: 'hod', mustChangePassword: true }) })); app('/hod'); expect(await screen.findByText('change password page')).toBeInTheDocument(); expect(screen.queryByText('hod secret')).not.toBeInTheDocument(); });
  it('labels verification status in words, and never calls student data officially verified', () => {
    render(<><StatusBadge status="draft" /><StatusBadge status="hod_endorsed" /></>);
    expect(screen.getByText(/student-entered/i)).toBeInTheDocument(); expect(screen.getByText('HOD endorsed')).toBeInTheDocument(); expect(screen.queryByText(/officially verified/i)).not.toBeInTheDocument();
  });
});

describe('first-year group on the portfolio', () => {
  const view = (over: any) => ({ available: true, deptCode: 'IS', needsGroup: false, firstYearGroup: 'I', canChangeGroup: true, semesters: Array.from({ length: 8 }, (_, i) => ({ semester: i + 1, core: [], slots: [], loaded: false })), ...over });
  const api = (v: any) => (url: string) => url.includes('/curriculum') ? { body: v } : url.includes('/semesters') ? { body: [] } : url.includes('assessment-rules') ? { body: { mse1Max: 20, mse2Max: 20, task1Max: 4, task2Max: 4, task3Max: 2 } } : { body: [] };
  it('asks a student with no saved group to choose one, and saves it', async () => {
    mockFetch(api(view({ needsGroup: true, firstYearGroup: null }))); wrap(<Portfolio />); const u = userEvent.setup();
    expect(await screen.findByText(/do not have your first-year group yet/i)).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText(/your group/i), 'II'); await u.click(screen.getByRole('button', { name: /save group/i }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT' && c.url.endsWith('/api/student/profile'))).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/api/student/profile'))!.init!.body))).toEqual({ firstYearGroup: 'II' });
  });
  it('hides the group control once first-year subjects are registered', async () => {
    mockFetch(api(view({ canChangeGroup: false }))); wrap(<Portfolio />); await screen.findByRole('heading', { name: /academic portfolio/i }); expect(screen.queryByLabelText(/your group/i)).not.toBeInTheDocument();
  });
});
