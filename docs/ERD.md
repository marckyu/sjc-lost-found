# Entity Relationship Diagram

Database schema is managed by PocketBase (SQLite). Eight collections power the system.

## Collections Overview

| Collection | Purpose |
|-----------|---------|
| `users` | System users (auth) |
| `items` | Lost and found reports |
| `claims` | Ownership claims |
| `notifications` | User notifications |
| `conversations` | User-to-user chat threads |
| `messages` | Chat messages |
| `admin_messages` | User to Admin inquiry threads |
| `matches` | AI-generated item matches |

## Entity: `users`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | PocketBase auto |
| email | email | unique, required | Must end with @phinmaed.com |
| password | password | required | Hashed by PocketBase |
| fullname | text | required | Display name |
| avatar | file | optional | Profile picture |
| role | select | required | user or admin |
| created | datetime | auto | |
| updated | datetime | auto | |

## Entity: `items`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| userId | text | required, FK users.id | Reporter |
| userName | text | required | Denormalized for display |
| userEmail | text | required | Denormalized |
| itemName | text | required | e.g., Black Wallet |
| category | select | required | gadgets/books/ids/wallets/keys/clothing/documents/others |
| location | text | required | e.g., Library, Room 203 |
| description | text | required | |
| status | select | required | lost/found/pending |
| date | datetime | required | When lost/found |
| verified | bool | default false | Admin-verified |
| verifiedAt | datetime | nullable | |
| recovered | bool | default false | Returned to owner |
| recoveredAt | datetime | nullable | |
| recoveredBy | text | nullable | Admin user id |
| returnedAt | datetime | nullable | |
| images | file array | max 5 | Item photos |
| created | datetime | auto | |
| updated | datetime | auto | |

## Entity: `claims`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| itemId | text | required, FK items.id | |
| itemName | text | required | Denormalized |
| userId | text | required, FK users.id | Claimant |
| userName | text | required | |
| userEmail | text | required | |
| contactNumber | text | required | |
| proof | text | required | Ownership proof description |
| status | select | required | pending/approved/rejected |
| adminNote | text | nullable | Reviewer notes |
| reviewedBy | text | nullable | Admin user id |
| reviewedAt | datetime | nullable | |
| created | datetime | auto | |

## Entity: `notifications`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| userId | text | required, FK users.id | Recipient |
| itemId | text | required, FK items.id | Related item |
| message | text | required | |
| read | bool | default false | |
| created | datetime | auto | |

## Entity: `conversations`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| itemId | text | required | Related item |
| itemName | text | required | |
| user1Id | text | required, FK users.id | |
| user1Name | text | required | |
| user2Id | text | required, FK users.id | |
| user2Name | text | required | |
| lastMessage | text | nullable | Preview |
| lastMessageAt | datetime | nullable | |
| hiddenFor | text array | default empty | User ids who hid thread |
| created | datetime | auto | |

## Entity: `messages`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| conversationId | text | required, FK conversations.id | |
| senderId | text | required, FK users.id | |
| senderName | text | required | |
| receiverId | text | required, FK users.id | |
| text | text | required | |
| read | bool | default false | |
| created | datetime | auto | |

## Entity: `admin_messages`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| userId | text | required, FK users.id | User side of thread |
| userName | text | required | |
| userEmail | text | required | |
| itemId | text | required, FK items.id | Related item |
| itemName | text | required | |
| senderRole | select | required | user or admin |
| text | text | required | |
| read | bool | default false | |
| created | datetime | auto | |

## Entity: `matches`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | text | PK | |
| lostItemId | text | required, FK items.id | |
| foundItemId | text | required, FK items.id | |
| confidenceScore | number | 0 to 100 | Combined text and image score |
| matchReason | text | required | Human-readable explanation |
| status | select | required | pending/confirmed/rejected/completed |
| notifiedAt | datetime | nullable | |
| created | datetime | auto | |

## Relationships

- users to items (one-to-many via userId)
- users to claims (one-to-many via userId)
- users to notifications (one-to-many via userId)
- users to conversations (one-to-many via user1Id, user2Id)
- users to messages (one-to-many via senderId, receiverId)
- users to admin_messages (one-to-many via userId)
- items to claims (one-to-many via itemId)
- items to notifications (one-to-many via itemId)
- items to admin_messages (one-to-many via itemId)
- items to matches (one-to-many via lostItemId, foundItemId)
- conversations to messages (one-to-many via conversationId)