# ChickenLand Farm Security Specification

## 1. Data Invariants
1. A user profile (`users/{userId}`) can only be read, created, or updated by the authenticated owner whose `request.auth.uid == userId`, with `email_verified == true`.
2. Subcollections (`transactions`, `deposits`, `withdrawals`) under `users/{userId}` can only be read and created by the authenticated owner whose `request.auth.uid == userId`, and parent `users/{userId}` must exist (`exists(...)`). They are immutable (update and delete denied).
3. `leaderboard/{userId}` contains zero PII (no email, phone, wallet address) and is publicly readable, while writes are restricted strictly to `request.auth.uid == userId` with strict field types and bounds.
4. `createdAt` is immutable and must equal `request.time` on creation; `updatedAt` must equal `request.time` on create and update.

## 2. Adversarial Payloads Checked
1. Unauthenticated write to `users/user1` -> PERMISSION_DENIED.
2. Cross-user read/write to `users/otherUser` -> PERMISSION_DENIED.
3. Unverified email user writing `users/{uid}` -> PERMISSION_DENIED.
4. Injecting shadow field `isAdmin: true` in `users/{uid}` -> PERMISSION_DENIED (`hasOnly`).
5. Oversized `userId` path variable (>128 chars or invalid chars) -> PERMISSION_DENIED (`isValidId`).
6. Negative `coins` or `eggs` -> PERMISSION_DENIED.
7. Oversized `completedTaskIds` (>50 items) -> PERMISSION_DENIED.
8. Client-forged `createdAt` not equal to `request.time` -> PERMISSION_DENIED.
9. Modifying `createdAt` or `uid` on update -> PERMISSION_DENIED.
10. Updating/deleting immutable `transactions` or `withdrawals` -> PERMISSION_DENIED.
11. Creating a `transactions` doc with mismatched `userId != request.auth.uid` -> PERMISSION_DENIED.
12. Writing another user's `leaderboard/{otherUid}` entry -> PERMISSION_DENIED.
