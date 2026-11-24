# Note World Security Specification

## 1. Data Invariants

1. **Unique Author Name Registry**: Every normalized author handle `/authors/{authorKey}` can be created only once by a single authenticated `uid` and cannot be overwritten or updated by another user. A user profile `/users/{userId}` can only be created or updated if the referenced `/authors/{authorKey}` belongs to `request.auth.uid` and matches `displayName` after the transaction commits (`getAfter`).
2. **Author Anti-Spoofing on Notes**: Any note created or updated at `/notes/{noteId}` must have `userId == request.auth.uid`, and its `authorName` and `authorKey` must match the owner's verified `/users/{request.auth.uid}` profile.
3. **World vs. Private Visibility**: Notes with `visibility == "world"` are publicly readable (`get` and `list`) by anyone, including newly created accounts and unauthenticated visitors. Private notes (`visibility != "world"`) are strictly readable only when `resource.data.userId == request.auth.uid`.
4. **Immutable Ownership & Creation Time**: `uid`, `userId`, and `createdAt` cannot be modified on update; all `createdAt`, `lastLoginAt`, and `updatedAt` timestamps must equal `request.time`.
5. **Strict Schema Enforcement**: No shadow/ghost fields are allowed on any document; all string lengths and ID formats (`^[a-zA-Z0-9_\-]+$`) are bounded.
6. **PII Isolation**: Email and provider login metadata live exclusively in `/users/{userId}/private/info` and are readable/writable only by `request.auth.uid == userId`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)

1. Unauthenticated `get` or `list` on private `/notes/{noteId}` (`visibility == "private"`).
2. Authenticated `list` on `/notes` attempting to query another user's private notes (`visibility == "private"` and `userId != request.auth.uid`).
3. Authenticated user attempting to create `/authors/{existingAuthorKey}` when that author name is already owned by another UID.
4. Authenticated user attempting to `update` `/authors/{authorKey}` owned by another UID (name hijacking).
5. Authenticated user attempting to create `/users/{uid}` with a `displayName`/`authorKey` not backed by an `/authors/{authorKey}` belonging to `request.auth.uid`.
6. Authenticated user attempting to create `/notes/{noteId}` with spoofed `authorName` or `authorKey` not matching their `/users/{request.auth.uid}` profile.
7. Authenticated user attempting to create `/notes/{noteId}` with spoofed `userId` (`!= request.auth.uid`) or ghost field `{ role: "admin" }`.
8. Authenticated user attempting to `update` or `delete` someone else's World note (`/notes/{otherNoteId}`).
9. Creating or updating `/notes/{noteId}` with client-forged `createdAt` or `updatedAt` (`!= request.time`), empty `title`, or `category` > 30 chars.
10. Creating `/notes/{noteId}` or `/authors/{authorKey}` with an ID longer than 128 chars or containing path-traversal characters (`../bad`).
11. Authenticated non-owner attempting to read `/users/{otherUid}/private/info` or list `/authors`.
12. Creating `/users/{uid}/private/wrongDocId` or injecting extra fields into `/users/{uid}`.
