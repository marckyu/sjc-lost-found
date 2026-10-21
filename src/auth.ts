import type { RecordModel } from 'pocketbase';
import { pb } from './pb';
import type { User, AuthResult } from './types';

const PHINMAED_REGEX = /^[a-zA-Z0-9._%+-]+@phinmaed\.com$/;

export function isValidPhinmaEdEmail(email: string): boolean {
    return PHINMAED_REGEX.test(email);
}

export interface AuthUser {
    uid: string;
}

function toDate(value?: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}

function toUser(rec: RecordModel): User {
    return {
        uid: rec.id,
        fullName: (rec.fullname as string) || String(rec.email).split('@')[0],
        email: rec.email as string,
        role: rec.role === 'admin' ? 'admin' : 'user',
        avatar: rec.avatar
            ? pb.files.getURL(rec, rec.avatar as string, { thumb: '100x100' })
            : '',
        createdAt: toDate(rec.created) ?? new Date()
    };
}

function currentRecord(): RecordModel | null {
    return pb.authStore.isValid ? pb.authStore.record : null;
}

let refreshOnce: Promise<void> | null = null;

function refreshSession(): Promise<void> {
    if (!pb.authStore.isValid) return Promise.resolve();
    if (!refreshOnce) {
        refreshOnce = pb
            .collection('users')
            .authRefresh()
            .then(() => undefined)
            .catch((err: any) => {
                if ([401, 403, 404].includes(err?.status)) pb.authStore.clear();
            });
    }
    return refreshOnce;
}

function validateSignupFields(
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string
): string | null {
    if (!fullName || !email || !password || !confirmPassword) return 'Please fill in all fields.';
    if (!isValidPhinmaEdEmail(email)) return 'Please use your PHINMAEd email.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
}

function apiErrorMessage(err: any, fallback: string): string {
    if (err?.status === 0) return 'Cannot reach the server. Make sure PocketBase is running.';
    if (err?.status === 429) return 'Too many attempts. Try again later.';
    return err?.response?.error || err?.response?.message || err?.message || fallback;
}

export async function requestSignupOtp(
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string
): Promise<AuthResult> {
    const problem = validateSignupFields(fullName, email, password, confirmPassword);
    if (problem) return { success: false, message: problem };

    try {
        await pb.send('/signup-request-otp', {
            method: 'POST',
            // SIGURADUHIN NA NAKA-STRINGIFY AT MAY HEADER
            body: JSON.stringify({ email, fullName }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return { success: true, message: 'OTP sent. Check your PHINMAEd email.' };
    } catch (err: any) {
        console.error('SIGNUP OTP REQUEST ERROR:', err?.status, err?.response ?? err);
        return {
            success: false,
            message: apiErrorMessage(err, 'Could not send OTP. Please try again.')
        };
    }
}

export async function verifySignupOtp(
    fullName: string,
    email: string,
    password: string,
    otp: string
): Promise<AuthResult> {
    if (!otp || otp.trim().length !== 6) {
        return { success: false, message: 'Enter the 6-digit code.' };
    }

    try {
        await pb.send('/signup-verify-otp', {
            method: 'POST',
            body: JSON.stringify({ email, fullName, password, otp: otp.trim() }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return {
            success: true,
            message: 'Account created successfully!',
            user: {
                uid: '',
                fullName,
                email,
                role: 'user',
                avatar: '',
                createdAt: new Date()
            }
        };
    } catch (err: any) {
        console.error('SIGNUP VERIFY ERROR:', err?.status, err?.response ?? err);
        return {
            success: false,
            message: apiErrorMessage(err, 'Could not create account. Please try again.')
        };
    }
}

export async function signUp(
    _fullName: string,
    _email: string,
    _password: string,
    _confirmPassword: string
): Promise<AuthResult> {
    return { success: false, message: 'Please use the email verification sign up.' };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
    if (!email || !password) {
        return { success: false, message: 'Please enter email and password.' };
    }

    try {
        const authData = await pb.collection('users').authWithPassword(email, password);

        return {
            success: true,
            message: 'Sign in successful!',
            user: toUser(authData.record)
        };
    } catch (err: any) {
        console.error('SIGNIN ERROR:', err?.status, err?.response ?? err);

        let msg = 'Invalid email or password.';

        if (err?.status === 0) {
            msg = 'Cannot reach the server. Make sure PocketBase is running.';
        } else if (err?.status === 429) {
            msg = 'Too many attempts. Try again later.';
        } else if (err?.status && err.status !== 400) {
            msg = `Error: ${err.status}`;
        }

        return { success: false, message: msg };
    }
}

export async function signOut(): Promise<void> {
    pb.authStore.clear();
}

export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
    let lastUid: string | null | undefined;

    return pb.authStore.onChange(() => {
        const uid = currentRecord()?.id ?? null;
        if (uid === lastUid) return;
        lastUid = uid;
        callback(uid ? { uid } : null);
    }, true);
}

export async function getCurrentUser(): Promise<User | null> {
    await refreshSession();
    const rec = currentRecord();
    return rec ? toUser(rec) : null;
}

export async function getUserProfile(uid: string): Promise<User | null> {
    const user = await getCurrentUser();
    return user && user.uid === uid ? user : null;
}