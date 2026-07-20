---
name: authentication
description: This is the authoritative documentation of the Authentication domain. It covers platform identity management for GABI: corporate email login, JWT token issuance and validation, password management, and admin-managed user lifecycle (create, activate, deactivate, delete). Load this skill when working on login, logout, token, JWT, bearer credentials, password change, user creation, active/inactive status, is_admin flag, authorization tiers, ProtectedRoute, AdminRoute, auth interceptors, or any authentication and user management endpoints and components.
metadata:
  author: clovis-cli
  type: domain-skill
---

# Authentication

> **Maintaining this skill**
>
> Update this skill whenever any rule described here changes — a new field on the user entity, a change in token expiry, a new password policy, a new admin operation, or any behavioral change in authentication flows. A refactor that preserves the described behavior does not require an update. When the skill and the implemented code diverge semantically without a recorded human decision settling the divergence, escalate to the human rather than adjusting the skill or the code unilaterally.

## Domain overview

Authentication is the security boundary for the entire platform. It manages platform identity: issuing signed tokens that prove a caller is who they claim to be, controlling which users are allowed to operate (active/inactive), and distinguishing regular users from administrators. Every other domain depends on Authentication to protect its endpoints.

The platform restricts login to corporate email accounts under the `@db1.com.br` domain. The frontend appends the domain automatically — users type only the local part — but the backend stores and validates the full email address.

## Business rules

### Token issuance and expiry

1. After a successful login, the backend issues a signed JWT (HS256).
2. The token carries two claims: `sub` (the user's full email) and `exp` (expiration timestamp).
3. Tokens expire **8 hours** after issuance.
4. There is no refresh token mechanism: once a token expires, the user must log in again.
5. Tokens cannot be revoked individually and there is no token blacklist. However, since every protected request validates the user's `is_active` flag in the database, deactivating a user's account immediately blocks all subsequent requests — any token held by a deactivated user is effectively rejected at the database check.

### Signing key

6. The JWT signing key is loaded from the `SECRET_KEY` environment variable when set. Otherwise it is read from a persisted file in the application directory. If the file does not exist on first boot, a random 64-character hex key is generated and saved to it. The key is consistent across restarts in the normal case (reading from the file), so existing tokens remain valid through server restarts. Rotating `SECRET_KEY` (or deleting the persisted file) invalidates all currently valid tokens — users must log in again.

### Password rules

7. Passwords are hashed with bcrypt using a per-password auto-generated salt. No plaintext password is stored.
8. Minimum password length: **6 characters**. Enforced both on user creation and on password change.
9. Password changes require the correct current password before a new one is accepted.

### Authorization tiers

10. There are exactly two authorization tiers:
    - **Regular user** (`CurrentUser`): holds a valid, non-expired JWT for a user with `is_active = 1`.
    - **Admin** (`AdminUser`): is a regular user whose `is_admin = 1` in the users table.
11. Every request to a protected endpoint validates the token and the `is_active` flag on each call; there is no server-side cached session.
12. Admin-only endpoints apply an additional database lookup to confirm `is_admin = 1`. A valid token for a non-admin user returns 403 Forbidden on admin endpoints.

### Admin self-operation protection

13. An admin cannot toggle the active status of their own account.
14. An admin cannot delete their own account.
15. Both constraints are enforced by comparing the target user's email with the authenticated admin's email. Violation returns 400 Bad Request.

### User lifecycle

16. Users are created by an admin via `POST /api/admin/users`. They are created as active (`is_active = 1`) by default. They may be marked as admin at creation time or remain regular users.
17. Deactivation and reactivation are performed by toggling `is_active` via `PATCH /api/admin/users/{user_id}/toggle`. A single endpoint both activates and deactivates — it flips the current state.
18. Deletion is permanent (hard delete). There is no soft-delete mechanism for users.
19. Email addresses are unique across the platform. An attempt to create a user with a duplicate email fails with 409 Conflict.

### Default admin seeding

20. On first boot, when the users table is empty, the system creates a default admin user using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.
21. On subsequent boots (when the table already contains rows), the system promotes the `ADMIN_EMAIL` account to admin if it is not already one. No new user is created in this case.

### Error handling and enumeration prevention

22. Login returns a generic "invalid credentials" error for both unrecognized email and wrong password — the caller cannot distinguish the two failure reasons.
23. Accessing an endpoint with an inactive-user token returns 401 Unauthorized (not 403), with the detail "Usuário inativo".
24. An invalid or expired JWT returns 401 Unauthorized with the detail "Token inválido ou expirado".

## Flows and lifecycle

### Login flow

1. User submits credentials (full email + password) as `application/x-www-form-urlencoded` form data to `POST /auth/login` (fields: `username`, `password`).
2. Backend queries for a user matching the email with `is_active = 1`.
3. If no active user is found, or the password does not match the stored bcrypt hash, returns 401 with a generic error.
4. On success, returns `{"access_token": "<JWT>", "token_type": "bearer"}`.
5. The frontend stores the token in `localStorage` under the key `gabi_token`.
6. The frontend's HTTP client attaches the token as an `Authorization: Bearer <token>` header on every subsequent request.
7. On any 401 response from any endpoint, the frontend removes the stored token and redirects to `/login`.

### User management flow (admin)

1. Admin creates a user via `POST /api/admin/users` — the user is immediately active.
2. Admin may toggle a user active/inactive via `PATCH /api/admin/users/{user_id}/toggle` (immediate effect on all requests from that user).
3. Admin may permanently delete a user via `DELETE /api/admin/users/{user_id}`.
4. Admin cannot perform steps 2 or 3 on their own account.

### Password change flow

1. Authenticated user submits current and new password to `POST /auth/change-password` (query parameters).
2. Backend verifies the current password against the stored hash.
3. Backend validates the new password meets the 6-character minimum.
4. On success, updates the stored hash and returns `{"ok": true}`.

### Route access control (frontend)

- `ProtectedRoute`: requires a valid token and active user. Redirects unauthenticated users to `/login`.
- `AdminRoute`: requires both a valid token and `is_admin = true`. Redirects non-admins to `/validate`.
- Both guards display a loading spinner while the authentication state is being resolved on startup.

## Entities and data

### User entity (users table)

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | integer | PK, auto-increment | Internal identifier |
| `email` | text | unique, not null | Full email address; serves as login username |
| `hashed_password` | text | not null | bcrypt hash of the user's password |
| `is_admin` | integer | not null, default 0 | `1` = administrator; `0` = regular user |
| `is_active` | integer | not null, default 1 | `1` = can log in; `0` = deactivated |
| `created_at` | text | default `datetime('now')` | UTC timestamp of account creation |

### API contracts

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/login` | None | Issue token (form data: `username`, `password`) |
| `GET` | `/auth/me` | CurrentUser | Return caller's email and admin flag |
| `POST` | `/auth/change-password` | CurrentUser | Change own password |
| `POST` | `/api/admin/users` | AdminUser | Create a new user |
| `GET` | `/api/admin/users` | AdminUser | List all users |
| `PATCH` | `/api/admin/users/{user_id}/toggle` | AdminUser | Toggle user active status |
| `DELETE` | `/api/admin/users/{user_id}` | AdminUser | Permanently delete a user |

### Response shapes

**Token response** (`POST /auth/login` on success):
```json
{ "access_token": "<signed JWT>", "token_type": "bearer" }
```

**AuthMe response** (`GET /auth/me` on success):
```json
{ "email": "<full email>", "is_admin": true }
```

**CreateUser request body** (`POST /api/admin/users`):
```json
{ "email": "<full email>", "password": "<plaintext, min 6 chars>", "is_admin": false }
```

**CreateUser response** (201 Created):
```json
{ "ok": true, "email": "<full email>" }
```

**Toggle response** (`PATCH .../toggle`):
```json
{ "ok": true, "is_active": true }
```

## Constraints and validations

- Email uniqueness is enforced at the database level. Duplicate email on creation → 409 Conflict.
- Password minimum is 6 characters — enforced on user creation and on change.
- The email domain is `@db1.com.br` by platform convention. The frontend appends it before submission. The backend stores and validates the full address but does not enforce the domain in server-side code.
- Inactive users (`is_active = 0`) cannot log in and cannot use existing tokens — the `is_active` check on every request acts as an immediate block.
- An admin attempting to toggle or delete their own account receives 400 Bad Request.
- Admin endpoints return 403 Forbidden for authenticated users without `is_admin = 1`.

## Integrations and external dependencies

- **python-jose**: JWT creation and validation (HS256 algorithm).
- **bcrypt**: Password hashing and verification with per-password auto-generated salt.
- **TanStack Query** (frontend): Caches the current user state from `/auth/me`; controls loading states in route guards.
- **React Router DOM** (frontend): Powers `ProtectedRoute` and `AdminRoute` guards via redirect components.

## Environment variables

| Variable | Purpose | Effect on behavior |
|---|---|---|
| `SECRET_KEY` | JWT signing key | When set, overrides the persisted key file. Changing this value invalidates all currently valid tokens (all users must re-login). |
| `ADMIN_EMAIL` | Default admin seed | Email of the admin user created on first boot (when the users table is empty). Also promoted to `is_admin = 1` on subsequent boots if not already. |
| `ADMIN_PASSWORD` | Default admin seed | Password for the default admin user created on first boot. Has no effect on subsequent boots or on users already in the database. |

## Maintenance

Update this skill whenever the behavior of this domain changes: a new auth endpoint, a change to the token expiry, a revised password policy, a new user field, a new admin operation, or a change in how active status or admin role is evaluated.

A refactor that preserves all the described rules — renaming an internal function, reorganizing helpers, extracting a dependency — does not require a skill update.

When the skill and the implemented code diverge semantically (for example, the skill states a rule the code no longer enforces, or the code introduces a new rule not reflected here) and no recorded human decision explains the divergence, **do not adjust the skill or the code unilaterally**. Escalate the divergence to the human for a decision on which behavior is authoritative.
