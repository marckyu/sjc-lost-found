export type UserRole = 'user' | 'admin';

export type ItemStatus =
    | 'lost'
    | 'found'
    | 'pending'
    | 'matched'
    | 'ownership_verification'
    | 'returning'
    | 'recovered';

export type ItemCategory =
    | 'gadgets'
    | 'books'
    | 'ids'
    | 'wallets'
    | 'keys'
    | 'clothing'
    | 'documents'
    | 'others';

export type MatchStatus = 'pending' | 'confirmed' | 'rejected';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type NotificationType = 'match' | 'claim' | 'system';

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
    date: Date | null;

    verified: boolean;
    verifiedAt: Date | null;

    matchedWithItemId: string | null;
    matchedAt: Date | null;
    returnedAt: Date | null;
    recoveredAt: Date | null;

    imageUrls: string[];
    createdAt: Date;
}

export interface Match {
    id: string;
    lostItemId: string;
    foundItemId: string;
    confidenceScore: number;
    matchReason: string;
    status: MatchStatus;
    notifiedAt: Date | null;
    createdAt: Date;
}

export interface Claim {
    id: string;
    itemId: string;
    claimantId: string;
    claimantName: string;
    claimantEmail: string;
    proof: string;
    status: ClaimStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
}

export interface Notification {
    id: string;
    userId: string;
    itemId: string;
    type: NotificationType;
    message: string;
    read: boolean;
    createdAt: Date;
}

export interface AuthResult {
    success: boolean;
    message: string;
    user?: User;
}