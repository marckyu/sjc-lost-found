export type UserRole = 'user' | 'admin';
export type ItemStatus = 'lost' | 'found' | 'pending';
export type ItemCategory =
    | 'gadgets'
    | 'books'
    | 'ids'
    | 'wallets'
    | 'keys'
    | 'clothing'
    | 'documents'
    | 'others';

export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface User {
    uid: string;
    fullName: string;
    email: string;
    role: UserRole;
    createdAt: Date;
}

export interface Item {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    itemName: string;
    category: ItemCategory;
    location: string;
    description: string;
    status: ItemStatus;
    verified: boolean;
    recovered: boolean;
    recoveredAt: Date | null;
    recoveredBy: string | null;
    imageUrls: string[];
    createdAt: Date;
    verifiedAt: Date | null;
}

export interface Notification {
    id: string;
    userId: string;
    itemId: string;
    message: string;
    read: boolean;
    createdAt: Date;
}

export interface Claim {
    id: string;
    itemId: string;
    itemName: string;
    userId: string;
    userName: string;
    userEmail: string;
    contactNumber: string;
    proof: string;
    status: ClaimStatus;
    adminNote: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
}

export interface AuthResult {
    success: boolean;
    message: string;
    user?: User;
}