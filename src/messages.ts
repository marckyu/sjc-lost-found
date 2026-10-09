import {
    watchUserConversations, watchMessages, sendMessage,
    markConversationAsRead, getConversationById,
    watchAdminMessagesForUser, sendAdminMessage,
    buildUserAdminThreads, buildAdminThreads,
    markAdminThreadAsRead, watchAdminMessagesForThread,
    watchAllAdminMessages, getUsersByIds,
    hideConversationForUser, unhideConversationForUser
} from './db';
import { onAuthChange, getCurrentUser } from './auth';
import { showToast, escapeHtml, formatDate } from './ui';
import type { Conversation, Message, User, AdminMessage, AdminThread } from './types';

let currentUser: User | null = null;
let allConversations: Conversation[] = [];
let hiddenConversations: Conversation[] = [];
let showHiddenConvs = false;
let allAdminThreads: AdminThread[] = [];
let activeConversationId: string | null = null;
let activeConversation: Conversation | null = null;
let activeAdminItemId: string | null = null;
let activeAdminThread: AdminThread | null = null;
let convUnsubscribe: (() => void) | null = null;
let msgUnsubscribe: (() => void) | null = null;
let adminConvUnsubscribe: (() => void) | null = null;

const userCache = new Map<string, { fullname: string; avatar: string }>();

const convListEl = document.getElementById('convList');
const adminConvListEl = document.getElementById('adminConvList');
const messagesEl = document.getElementById('chatMessages');
const threadEmptyEl = document.getElementById('threadEmpty');
const threadActiveEl = document.getElementById('threadActive');
const chatFormEl = document.getElementById('chatForm') as HTMLFormElement | null;
const chatInputEl = document.getElementById('chatInput') as HTMLInputElement | null;
const headerNameEl = document.getElementById('chatHeaderName');
const headerItemEl = document.getElementById('chatHeaderItem');
const backBtn = document.getElementById('chatBackBtn');

function isAdmin(): boolean {
    return currentUser?.role === 'admin';
}

function otherUser(conv: Conversation): { id: string; name: string } {
    if (!currentUser) return { id: '', name: '' };
    if (conv.user1Id === currentUser.uid) {
        return { id: conv.user2Id, name: conv.user2Name };
    }
    return { id: conv.user1Id, name: conv.user1Name };
}

function renderConversations(): void {
    if (!convListEl) return;

    const displayList = showHiddenConvs ? hiddenConversations : allConversations;

    const countEl = document.getElementById('convCount');
    if (countEl) {
        countEl.textContent = showHiddenConvs
            ? `Hidden (${hiddenConversations.length})`
            : `Conversations (${allConversations.length})`;
    }

    injectHiddenToggle();

    if (displayList.length === 0) {
        const msg = showHiddenConvs
            ? 'No hidden conversations. Hidden chats will appear here.'
            : (isAdmin()
                ? 'As admin, you do not participate in user-to-user conversations.'
                : 'Conversations appear once a claim is approved.');

        convListEl.innerHTML = `
            <div class="empty-state chat-empty">
                <p>${showHiddenConvs ? 'Nothing hidden.' : 'No conversations yet.'}</p>
                <p style="font-size: 11px; margin-top: 6px; opacity: 0.7;">
                    ${msg}
                </p>
            </div>
        `;
        return;
    }

    convListEl.innerHTML = displayList.map(conv => {
        const other = otherUser(conv);
        const isActive = conv.id === activeConversationId;
        const initial = (other.name || '?').charAt(0).toUpperCase();
        const info = userCache.get(other.id);
        const avatar = info?.avatar;

        const avatarHtml = avatar
            ? `<img src="${avatar}" alt="${escapeHtml(other.name)}">`
            : escapeHtml(initial);

        const preview = conv.lastMessage
            ? escapeHtml(conv.lastMessage.length > 40
                ? conv.lastMessage.substring(0, 40) + '…'
                : conv.lastMessage)
            : 'No messages yet';
        const time = conv.lastMessageAt ? formatDate(conv.lastMessageAt) : '';

        const actionBtn = showHiddenConvs
            ? `<button class="chat-conv-restore" data-conv-restore="${conv.id}" type="button" aria-label="Restore conversation" title="Restore">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="1 4 1 10 7 10"></polyline>
                       <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                   </svg>
               </button>`
            : `<button class="chat-conv-delete" data-conv-delete="${conv.id}" type="button" aria-label="Hide conversation">&times;</button>`;

        return `
            <div class="chat-conv-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}" role="button" tabindex="0">
                <span class="chat-conv-avatar">${avatarHtml}</span>
                <span class="chat-conv-info">
                    <span class="chat-conv-top">
                        <strong>${escapeHtml(other.name)}</strong>
                        <small>${time}</small>
                    </span>
                    <span class="chat-conv-preview">${preview}</span>
                    <span class="chat-conv-item-name">Re: ${escapeHtml(conv.itemName)}</span>
                </span>
                ${actionBtn}
            </div>
        `;
    }).join('');

    convListEl.querySelectorAll<HTMLElement>('[data-conv-id]').forEach(item => {
        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('[data-conv-delete], [data-conv-restore]')) return;
            const id = item.dataset.convId;
            if (!id) return;
            openConversation(id);
        });
    });

    convListEl.querySelectorAll<HTMLButtonElement>('[data-conv-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.convDelete;
            if (!id || !currentUser) return;

            if (!confirm('Hide this conversation? You can restore it anytime from the hidden list.')) return;

            const card = btn.closest('.chat-conv-item') as HTMLElement | null;
            if (card) {
                card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'translateX(40px)';
            }

            try {
                await hideConversationForUser(id, currentUser.uid);

                if (activeConversationId === id) {
                    closeConversation();
                }

                setTimeout(() => {
                    const conv = allConversations.find(c => c.id === id);
                    if (conv) {
                        allConversations = allConversations.filter(c => c.id !== id);
                        hiddenConversations = [conv, ...hiddenConversations];
                    }
                    renderConversations();
                }, 300);
            } catch (err) {
                console.error('Failed to hide conversation:', err);
                showToast('Failed to hide conversation.', 'error');
                if (card) {
                    card.style.opacity = '';
                    card.style.transform = '';
                }
            }
        });
    });

    convListEl.querySelectorAll<HTMLButtonElement>('[data-conv-restore]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.convRestore;
            if (!id || !currentUser) return;

            const card = btn.closest('.chat-conv-item') as HTMLElement | null;
            if (card) {
                card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'translateX(40px)';
            }

            try {
                await unhideConversationForUser(id, currentUser.uid);

                setTimeout(() => {
                    const conv = hiddenConversations.find(c => c.id === id);
                    if (conv) {
                        hiddenConversations = hiddenConversations.filter(c => c.id !== id);
                        allConversations = [conv, ...allConversations];
                    }
                    renderConversations();
                    showToast('Conversation restored.', 'success');
                }, 300);
            } catch (err) {
                console.error('Failed to restore conversation:', err);
                showToast('Failed to restore conversation.', 'error');
                if (card) {
                    card.style.opacity = '';
                    card.style.transform = '';
                }
            }
        });
    });
}

function injectHiddenToggle(): void {
    const header = document.querySelector('.chat-sidebar-header');
    if (!header) return;
    if (header.querySelector('.chat-hidden-toggle')) return;

    const countEl = document.getElementById('convCount');
    if (countEl) {
        countEl.style.display = 'flex';
        countEl.style.alignItems = 'center';
        countEl.style.justifyContent = 'space-between';
        countEl.style.width = '100%';
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-hidden-toggle';
    btn.setAttribute('aria-label', 'Toggle hidden conversations');

    const updateLabel = () => {
        btn.innerHTML = showHiddenConvs
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg> Back`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> Hidden${hiddenConversations.length > 0 ? ` (${hiddenConversations.length})` : ''}`;
    };

    updateLabel();

    btn.addEventListener('click', () => {
        showHiddenConvs = !showHiddenConvs;
        renderConversations();
    });

    if (countEl) {
        countEl.appendChild(btn);
    } else {
        header.appendChild(btn);
    }
}

function renderAdminThreads(): void {
    if (!adminConvListEl) return;

    const countEl = document.getElementById('adminConvCount');
    if (countEl) {
        countEl.textContent = `Admin Inquiries (${allAdminThreads.length})`;
    }

    if (allAdminThreads.length === 0) {
        const msg = isAdmin()
            ? 'No user inquiries yet. Users will appear here once they contact you.'
            : 'Use "Ask Admin" on any verified item.';
        adminConvListEl.innerHTML = `
            <div class="empty-state chat-empty">
                <p>No admin inquiries yet.</p>
                <p style="font-size: 11px; margin-top: 6px; opacity: 0.7;">
                    ${msg}
                </p>
            </div>
        `;
        return;
    }

    adminConvListEl.innerHTML = allAdminThreads.map(thread => {
        const isActive = thread.itemId === activeAdminItemId &&
                         (isAdmin() ? true : thread.userId === currentUser?.uid);
        const preview = thread.lastMessage.length > 40
            ? thread.lastMessage.substring(0, 40) + '…'
            : thread.lastMessage;
        const time = formatDate(thread.lastMessageAt);
        const unreadBadge = thread.unreadCount > 0
            ? `<span class="chat-unread-badge">${thread.unreadCount}</span>`
            : '';

        const displayName = isAdmin() ? thread.userName : 'Admin';
        const avatarText = isAdmin() ? (thread.userName || '?').charAt(0).toUpperCase() : 'A';
        const avatarClass = isAdmin() ? 'user-avatar' : 'admin-avatar';

        let avatarHtml = escapeHtml(avatarText);
        if (isAdmin()) {
            const info = userCache.get(thread.userId);
            if (info?.avatar) {
                avatarHtml = `<img src="${info.avatar}" alt="${escapeHtml(thread.userName)}">`;
            }
        }

        return `
            <button class="chat-conv-item admin-thread ${isActive ? 'active' : ''}"
                    data-admin-item="${thread.itemId}"
                    data-admin-user="${thread.userId}"
                    type="button">
                <span class="chat-conv-avatar ${avatarClass}">${avatarHtml}</span>
                <span class="chat-conv-info">
                    <span class="chat-conv-top">
                        <strong>${escapeHtml(displayName)} ${unreadBadge}</strong>
                        <small>${time}</small>
                    </span>
                    <span class="chat-conv-preview">${escapeHtml(preview)}</span>
                    <span class="chat-conv-item-name">Re: ${escapeHtml(thread.itemName)}</span>
                </span>
            </button>
        `;
    }).join('');

    adminConvListEl.querySelectorAll<HTMLElement>('[data-admin-item]').forEach(btn => {
        btn.addEventListener('click', () => {
            const itemId = btn.dataset.adminItem;
            const userId = btn.dataset.adminUser;
            if (!itemId || !userId) return;
            const thread = allAdminThreads.find(t => t.itemId === itemId && t.userId === userId);
            if (!thread) return;
            openAdminThread(thread);
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
                <p>Coordinate with <strong>${escapeHtml(other.name)}</strong> to arrange the item return.</p>
            </div>
        `;
        return;
    }

    messagesEl.innerHTML = msgs.map(m => {
        const mine = m.senderId === currentUser!.uid;
        const info = userCache.get(m.senderId);
        const avatar = info?.avatar;
        const initial = (m.senderName || '?').charAt(0).toUpperCase();

        const avatarHtml = avatar
            ? `<span class="chat-bubble-avatar"><img src="${avatar}" alt="${escapeHtml(m.senderName)}"></span>`
            : `<span class="chat-bubble-avatar">${escapeHtml(initial)}</span>`;

        return `
            <div class="chat-bubble-wrap ${mine ? 'mine' : 'theirs'}">
                ${!mine ? avatarHtml : ''}
                <div class="chat-bubble ${mine ? 'mine' : 'theirs'}" data-msg-id="${m.id}">
                    ${!mine ? `<span class="chat-bubble-sender">${escapeHtml(m.senderName)}</span>` : ''}
                    <p class="chat-bubble-text">${escapeHtml(m.text)}</p>
                    <small class="chat-bubble-time">${formatDate(m.createdAt)}</small>
                </div>
            </div>
        `;
    }).join('');

    scrollToBottom();
}

function appendAdminMessagesToList(msgs: AdminMessage[]): void {
    if (!messagesEl || !currentUser) return;

    const amAdmin = isAdmin();

    if (msgs.length === 0) {
        messagesEl.innerHTML = `
            <div class="chat-messages-empty">
                <div class="chat-messages-empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <h4>Start the conversation</h4>
                <p>${amAdmin ? 'Reply to this user about their item.' : 'Ask admin a question about this item.'}</p>
            </div>
        `;
        return;
    }

    messagesEl.innerHTML = msgs.map(m => {
        const mine = amAdmin ? m.senderRole === 'admin' : m.senderRole === 'user';

        let senderLabel = '';
        if (!mine) senderLabel = amAdmin ? m.userName : 'Admin';

        const initial = senderLabel.charAt(0).toUpperCase() || '?';
        const info = !amAdmin ? null : userCache.get(m.userId);
        const avatar = info?.avatar;

        const avatarHtml = avatar
            ? `<span class="chat-bubble-avatar"><img src="${avatar}" alt="${escapeHtml(senderLabel)}"></span>`
            : `<span class="chat-bubble-avatar">${escapeHtml(initial)}</span>`;

        return `
            <div class="chat-bubble-wrap ${mine ? 'mine' : 'theirs'}">
                ${!mine ? avatarHtml : ''}
                <div class="chat-bubble ${mine ? 'mine' : 'theirs'}" data-msg-id="${m.id}">
                    ${!mine ? `<span class="chat-bubble-sender">${escapeHtml(senderLabel)}</span>` : ''}
                    <p class="chat-bubble-text">${escapeHtml(m.text)}</p>
                    <small class="chat-bubble-time">${formatDate(m.createdAt)}</small>
                </div>
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

    activeAdminItemId = null;
    activeAdminThread = null;

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
        renderAdminThreads();

        msgUnsubscribe = watchMessages(convId, (msgs) => {
            appendMessageToList(msgs);
        });

        markConversationAsRead(convId, currentUser!.uid).catch(err => {
            console.error('Failed to mark as read:', err);
        });
    });
}

function openAdminThread(thread: AdminThread): void {
    if (!currentUser) return;

    if (msgUnsubscribe) {
        msgUnsubscribe();
        msgUnsubscribe = null;
    }

    activeConversationId = null;
    activeConversation = null;

    activeAdminItemId = thread.itemId;
    activeAdminThread = thread;

    if (headerNameEl) {
        headerNameEl.textContent = isAdmin() ? thread.userName : 'Admin';
    }
    if (headerItemEl) {
        headerItemEl.textContent = isAdmin()
            ? `${thread.userEmail} — Re: ${thread.itemName}`
            : `Re: ${thread.itemName}`;
    }

    if (threadEmptyEl) threadEmptyEl.hidden = true;
    if (threadActiveEl) threadActiveEl.hidden = false;

    document.body.classList.add('chat-open');

    renderConversations();
    renderAdminThreads();

    const uid = thread.userId;
    const itemId = thread.itemId;

    msgUnsubscribe = watchAdminMessagesForThread(uid, itemId, (msgs) => {
        appendAdminMessagesToList(msgs);
    });

    const forRole = isAdmin() ? 'admin' : 'user';
    markAdminThreadAsRead(uid, itemId, forRole).catch(err => {
        console.error('Failed to mark as read:', err);
    });
}

function closeConversation(): void {
    if (msgUnsubscribe) {
        msgUnsubscribe();
        msgUnsubscribe = null;
    }
    activeConversationId = null;
    activeConversation = null;
    activeAdminItemId = null;
    activeAdminThread = null;

    if (threadEmptyEl) threadEmptyEl.hidden = false;
    if (threadActiveEl) threadActiveEl.hidden = true;

    document.body.classList.remove('chat-open');

    renderConversations();
    renderAdminThreads();
}

chatFormEl?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser || !chatInputEl) return;

    const text = chatInputEl.value.trim();
    if (!text) return;

    if (activeAdminThread) {
        chatInputEl.value = '';
        chatInputEl.focus();

        try {
            await sendAdminMessage({
                userId: activeAdminThread.userId,
                userName: activeAdminThread.userName,
                userEmail: activeAdminThread.userEmail,
                itemId: activeAdminThread.itemId,
                itemName: activeAdminThread.itemName,
                senderRole: isAdmin() ? 'admin' : 'user',
                text
            });
        } catch (err) {
            console.error(err);
            showToast('Failed to send message.', 'error');
            chatInputEl.value = text;
        }
        return;
    }

    if (activeConversation) {
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
    }
});

backBtn?.addEventListener('click', closeConversation);

onAuthChange(async (fbUser) => {
    if (convUnsubscribe) { convUnsubscribe(); convUnsubscribe = null; }
    if (msgUnsubscribe) { msgUnsubscribe(); msgUnsubscribe = null; }
    if (adminConvUnsubscribe) { adminConvUnsubscribe(); adminConvUnsubscribe = null; }

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

        const preloadUsers = async () => {
            try {
                const uids = new Set<string>();
                allConversations.forEach(c => { uids.add(c.user1Id); uids.add(c.user2Id); });
                hiddenConversations.forEach(c => { uids.add(c.user1Id); uids.add(c.user2Id); });
                allAdminThreads.forEach(t => uids.add(t.userId));
                if (uid) uids.add(uid);
                if (uids.size > 0) {
                    const users = await getUsersByIds([...uids]);
                    users.forEach((v, k) => userCache.set(k, v));
                    renderConversations();
                    renderAdminThreads();
                }
            } catch (err) {
                console.error('User cache preload failed:', err);
            }
        };

        convUnsubscribe = watchUserConversations(uid, (convs) => {
            allConversations = convs.filter(c => !c.hiddenFor.includes(uid));
            hiddenConversations = convs.filter(c => c.hiddenFor.includes(uid));
            renderConversations();
            preloadUsers();
        });

        if (isAdmin()) {
            adminConvUnsubscribe = watchAllAdminMessages((msgs) => {
                allAdminThreads = buildAdminThreads(msgs);
                renderAdminThreads();
                preloadUsers();
            });
        } else {
            adminConvUnsubscribe = watchAdminMessagesForUser(uid, (msgs) => {
                allAdminThreads = buildUserAdminThreads(msgs);
                renderAdminThreads();
                preloadUsers();
            });
        }
    } else {
        window.location.href = 'index.html';
    }
});