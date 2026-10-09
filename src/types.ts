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
export type AdminMessageRole = 'user' | 'admin';
export type MatchStatus = 'pending' | 'confirmed' | 'rejected' | 'completed';

export interface User {
    uid: string;
    fullName: string;
    email: string;
    role: UserRole;
    avatar: string;
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
    recovered: boolean;
    recoveredAt: Date | null;
    recoveredBy: string | null;
    returnedAt: Date | null;
    imageUrls: string[];
    fullImageUrls: string[];
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

export interface Conversation {
    id: string;
    itemId: string;
    itemName: string;
    user1Id: string;
    user1Name: string;
    user2Id: string;
    user2Name: string;
    lastMessage: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
    hiddenFor: string[];
}

export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    text: string;
    read: boolean;
    createdAt: Date;
}

export interface AdminMessage {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    itemId: string;
    itemName: string;
    senderRole: AdminMessageRole;
    text: string;
    read: boolean;
    createdAt: Date;
}

export interface AdminThread {
    userId: string;
    userName: string;
    userEmail: string;
    itemId: string;
    itemName: string;
    lastMessage: string;
    lastMessageAt: Date;
    lastSenderRole: AdminMessageRole;
    unreadCount: number;
    totalCount: number;
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

export interface AuthResult {
    success: boolean;
    message: string;
    user?: User;
}