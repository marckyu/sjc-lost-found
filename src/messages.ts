import './main';
import {
    watchUserConversations, watchMessages, sendMessage,
    markConversationAsRead, getConversationById
} from './db';
import { onAuthChange, getCurrentUser } from './auth';
import { showToast, escapeHtml, formatDate, refreshIcons } from './ui';
import type { Conversation, Message, User } from './types';

let currentUser: User | null = null;
let allConversations: Conversation[] = [];
let activeConversationId: string | null = null;
let activeConversation: Conversation | null = null;
let convUnsubscribe: (() => void) | null = null;
let msgUnsubscribe: (() => void) | null = null;

const convListEl = document.getElementById('convList');
const messagesEl = document.getElementById('chatMessages');
const threadEmptyEl = document.getElementById('threadEmpty');
const threadActiveEl = document.getElementById('threadActive');
const chatFormEl = document.getElementById('chatForm') as HTMLFormElement | null;
const chatInputEl = document.getElementById('chatInput') as HTMLInputElement | null;
const headerNameEl = document.getElementById('chatHeaderName');
const headerItemEl = document.getElementById('chatHeaderItem');
const backBtn = document.getElementById('chatBackBtn');

function otherUser(conv: Conversation): { id: string; name: string } {
    if (!currentUser) return { id: '', name: '' };
    if (conv.user1Id === currentUser.uid) {
        return { id: conv.user2Id, name: conv.user2Name };
    }
    return { id: conv.user1Id, name: conv.user1Name };
}

function renderConversations(): void {
    if (!convListEl) return;

    const countEl = document.getElementById('convCount');
    if (countEl) {
        countEl.textContent = `Conversations (${allConversations.length})`;
    }

    if (allConversations.length === 0) {
        convListEl.innerHTML = `
            <div class="empty-state chat-empty">
                <p>No conversations yet.</p>
                <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                    Conversations will appear here once a claim is approved.
                </p>
            </div>
        `;
        return;
    }

    convListEl.innerHTML = allConversations.map(conv => {
        const other = otherUser(conv);
        const isActive = conv.id === activeConversationId;
        const initial = (other.name || '?').charAt(0).toUpperCase();
        const preview = conv.lastMessage
            ? escapeHtml(conv.lastMessage.length > 40
                ? conv.lastMessage.substring(0, 40) + '…'
                : conv.lastMessage)
            : 'No messages yet';
        const time = conv.lastMessageAt ? formatDate(conv.lastMessageAt) : '';

        return `
            <button class="chat-conv-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}" type="button">
                <span class="chat-conv-avatar">${escapeHtml(initial)}</span>
                <span class="chat-conv-info">
                    <span class="chat-conv-top">
                        <strong>${escapeHtml(other.name)}</strong>
                        <small>${time}</small>
                    </span>
                    <span class="chat-conv-preview">${preview}</span>
                    <span class="chat-conv-item-name">Re: ${escapeHtml(conv.itemName)}</span>
                </span>
            </button>
        `;
    }).join('');

    convListEl.querySelectorAll<HTMLElement>('[data-conv-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.convId;
            if (!id) return;
            openConversation(id);
        });
    });
}

function appendMessageToList(msgs: Message[]): void {
    if (!messagesEl || !currentUser || !activeConversation) return;

    if (msgs.length === 0) {
        const other = otherUser(activeConversation);
        messagesEl.innerHTML = `
            <div class="chat-messages-empty">
                <div class="chat-messages-empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <h4>Start the conversation</h4>
                <p>Coordinate with <strong>${escapeHtml(other.name)}</strong> to arrange the item return. Once recovered, the admin will mark it complete.</p>
            </div>
        `;
        return;
    }

    messagesEl.innerHTML = msgs.map(m => {
        const mine = m.senderId === currentUser!.uid;
        return `
            <div class="chat-bubble ${mine ? 'mine' : 'theirs'}" data-msg-id="${m.id}">
                ${!mine ? `<span class="chat-bubble-sender">${escapeHtml(m.senderName)}</span>` : ''}
                <p class="chat-bubble-text">${escapeHtml(m.text)}</p>
                <small class="chat-bubble-time">${formatDate(m.createdAt)}</small>
            </div>
        `;
    }).join('');

    scrollToBottom();
}

function scrollToBottom(): void {
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

function openConversation(convId: string): void {
    if (!currentUser) return;

    if (msgUnsubscribe) {
        msgUnsubscribe();
        msgUnsubscribe = null;
    }

    activeConversationId = convId;

    getConversationById(convId).then(conv => {
        if (!conv) {
            showToast('Conversation not found.', 'error');
            return;
        }

        activeConversation = conv;
        const other = otherUser(conv);

        if (headerNameEl) headerNameEl.textContent = other.name;
        if (headerItemEl) headerItemEl.textContent = `Re: ${conv.itemName}`;

        if (threadEmptyEl) threadEmptyEl.hidden = true;
        if (threadActiveEl) threadActiveEl.hidden = false;

        document.body.classList.add('chat-open');

        renderConversations();

        msgUnsubscribe = watchMessages(convId, (msgs) => {
            appendMessageToList(msgs);
        });

        markConversationAsRead(convId, currentUser!.uid).catch(err => {
            console.error('Failed to mark as read:', err);
        });
    });
}

function closeConversation(): void {
    if (msgUnsubscribe) {
        msgUnsubscribe();
        msgUnsubscribe = null;
    }
    activeConversationId = null;
    activeConversation = null;

    if (threadEmptyEl) threadEmptyEl.hidden = false;
    if (threadActiveEl) threadActiveEl.hidden = true;

    document.body.classList.remove('chat-open');

    renderConversations();
}

chatFormEl?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser || !activeConversation || !chatInputEl) return;

    const text = chatInputEl.value.trim();
    if (!text) return;

    const other = otherUser(activeConversation);

    chatInputEl.value = '';
    chatInputEl.focus();

    try {
        await sendMessage({
            conversationId: activeConversation.id,
            senderId: currentUser.uid,
            senderName: currentUser.fullName,
            receiverId: other.id,
            text
        });
    } catch (err) {
        console.error(err);
        showToast('Failed to send message.', 'error');
        chatInputEl.value = text;
    }
});

backBtn?.addEventListener('click', closeConversation);

onAuthChange(async (fbUser) => {
    if (convUnsubscribe) {
        convUnsubscribe();
        convUnsubscribe = null;
    }
    if (msgUnsubscribe) {
        msgUnsubscribe();
        msgUnsubscribe = null;
    }

    if (fbUser) {
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }

        const adminLink = document.getElementById('navAdminLink');
        if (adminLink && currentUser.role === 'admin') {
            adminLink.innerHTML = '<a href="admin.html">Dashboard</a>';
        }

        const uid = currentUser.uid;
        convUnsubscribe = watchUserConversations(uid, (convs) => {
            allConversations = convs;
            renderConversations();
        });
    } else {
        window.location.href = 'index.html';
    }
});

refreshIcons();