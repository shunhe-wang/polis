# Supabase password recovery setup

The application implements the complete browser flow:

1. `/auth/forgot-password` calls `resetPasswordForEmail`.
2. Supabase sends the recovery message.
3. The email link returns through `/auth/callback`, which exchanges the PKCE code.
4. `/auth/reset-password` requires that recovery session and updates the password.

## Production dashboard setup

In Supabase, open **Authentication → URL Configuration**:

- Set **Site URL** to the production web origin.
- Add `https://YOUR-DOMAIN/auth/callback` to **Redirect URLs**.
- Add the staging callback separately. Do not use a broad production wildcard.

Open **Authentication → Email Templates → Reset Password** and paste the contents of
`supabase/templates/recovery.html`. Keep `{{ .ConfirmationURL }}` unchanged; Supabase
adds the requested callback destination to that signed recovery URL.

Open **Project Settings → Authentication → SMTP Settings** and configure a production
SMTP provider and a verified sending domain. Supabase's default sender is only suitable
for low-volume testing.

In **Authentication → Providers → Email**, set the minimum password length to at least
8 characters so the hosted policy matches the signup and reset forms.

## Verification

Request a reset for a controlled inbox, open the newest message, set a new password,
sign out, and sign back in with the new password. Also verify that an expired or reused
link shows the invalid-link state and that the old password no longer works.
