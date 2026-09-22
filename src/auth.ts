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



export async function signUp(
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string
): Promise<AuthResult> {
    if (!fullName || !email || !password || !confirmPassword) {
        return { success: false, message: 'Please fill in all fields.' };
    }
    if (!isValidPhinmaEdEmail(email)) {
        return { success: false, message: 'Please use your PHINMAEd email.' };
    }
    if (password.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters.' };
    }
    if (password !== confirmPassword) {
        return { success: false, message: 'Passwords do not match.' };
    }

    try {
        const rec = await pb.collection('users').create({
            email,
            password,
            passwordConfirm: confirmPassword,
            fullname: fullName
        });

        return {
            success: true,
            message: 'Account created successfully!',
            user: {
                uid: rec.id,
                fullName,
                email,
                role: 'user',
                createdAt: new Date()
            }
        };
    } catch (err: any) {
        console.error('SIGNUP ERROR:', err?.status, err?.response ?? err);

        const data = err?.response?.data ?? {};
        let msg = 'Sign up failed. Please try again.';

        if (err?.status === 0) {
            msg = 'Cannot reach the server. Make sure PocketBase is running.';
        } else if (data.email?.code === 'validation_not_unique') {
            msg = 'Email already registered.';
        } else if (data.email) {
            msg = data.email.message || 'Invalid email address.';
        } else if (data.password) {
            msg = data.password.message || 'Password is too weak.';
        } else if (data.fullname) {
            msg = data.fullname.message || 'Invalid name.';
        } else if (err?.status === 400 || err?.status === 403) {
            msg = 'Sign up was rejected. Use your PHINMAEd email (name@phinmaed.com).';
        }

        return { success: false, message: msg };
    }
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