# App Store review package (draft)

**Status:** Draft for owner review.
**App:** Polis (iOS, Capacitor bundled client in `mobile/`).
**Developer entity:** Atelier SW LLC d/b/a Polis.
**Bundle ID:** `com.ateliersw.polis` (set in `mobile/capacitor.config.ts` and `mobile/ios/App/App.xcodeproj/project.pbxproj`).
**Related docs:** `docs/app-store-commercial-route.md`, `docs/production-readiness-2026-midterms.md`, `content/legal/privacy-policy.md`, `content/legal/terms-of-service.md`.

Items marked "owner decision required" must be resolved by the owner before submission.
This package assumes the bundled iOS client reaches feature parity with the reviewer steps in section 3 before submission.
Gaps between the current `mobile/src` client and those steps are listed in section 3.4.

## 1. App metadata

### 1.1 App name

**Polis: Nonpartisan Voter Guide**

App Store names allow 30 characters.
The proposed name is 30 characters exactly.
Fallback if the name is taken: **Polis: Ballot Research** (22 characters).

### 1.2 Subtitle (30 characters max)

**Research your whole ballot**

26 characters.

### 1.3 Promotional text (170 characters max)

**Ready for the 2026 midterms. See every race and measure on your ballot, read sourced candidate research, and get a guide matched to the priorities you choose.**

158 characters.
Promotional text can be updated without a new binary, so use it for election-cycle messaging.

### 1.4 Full description

Polis helps you walk into the voting booth prepared.

Enter your address and Polis finds the races and ballot measures you will actually vote on, from federal contests down to local offices, using election data sources plus your own official sample ballot when needed.

Tell Polis what matters to you.
Pick your issue priorities, answer a few policy questions, and add anything else in your own words.

Then let AI-assisted research do the reading.
Polis builds a research dossier for each candidate and measure, with links to sources so you can check every claim yourself.
Your guide compares candidates against the priorities you chose, not anyone else's agenda.

Polis is nonpartisan.
It does not endorse candidates, parties, or positions.
It shows you where candidates stand, cites where that information came from, and leaves the decision to you.

WHAT YOU GET FREE
- Ballot lookup for your address
- Browse every race and measure with source links
- One starter candidate analysis

ELECTION PASS
A one-time purchase unlocks AI research and a personalized guide for one complete ballot.
Credits do not expire and work on the web and on iPhone.

YOUR DATA, YOUR CHOICE
AI analysis is optional and off until you approve it.
Before any of your ballot or values information is sent to our AI provider, Polis shows you exactly what will be shared and asks for your permission.
You can decline and keep using ballot browsing and source links, and you can revoke permission at any time from your account.
You can permanently delete your account and data from inside the app.

IMPORTANT
Polis is an informational research tool and is not an official election administration website.
Candidate positions, ballot language, and election details can change.
Always verify important voting information with your state or local election officials.

Questions? Contact us at contact@getpolis.vote.

### 1.5 Keywords (100 characters max)

`voter guide,ballot,election,midterms,candidates,vote,nonpartisan,ballot measures,civic,research`

95 characters.
Do not repeat the app name "Polis" in the keyword field, since the name field already indexes it.

### 1.6 Category

- Primary: **Reference**.
- Secondary: **News**.

Rationale: the app is a research and lookup tool rather than a news feed, but the News secondary category matches how Apple classifies election-information apps.
Owner decision required: confirm primary category, since Utilities is a defensible alternative.

### 1.7 Age rating questionnaire answers

Answer every content category as **None**: cartoon/fantasy violence, realistic violence, sexual content or nudity, profanity, horror/fear themes, mature/suggestive themes, alcohol/tobacco/drug use, simulated gambling, medical/treatment information.

Additional questions:

- Unrestricted web access: **No**. The app opens specific external links (official election sources, candidate sources) in the system browser and has no general-purpose browser.
- Gambling and contests: **No**.
- User-generated content shared with other users: **No**. Values text and ballot uploads are private inputs visible only to the account owner.
- In-app purchases: **Yes** (Election Pass consumable).
- Messaging or chat with other users: **No**.

The questionnaire result should come out at the lowest tier.
Recommended: voluntarily raise the rating to **13+** using the age rating override, because the privacy policy states the Services are not directed to children under 13 (`content/legal/privacy-policy.md` section 11).

### 1.8 Export compliance answers

- Does the app use encryption: **Yes**.
- Does it qualify for an exemption: **Yes**. The app uses only standard HTTPS/TLS provided by the operating system and standard networking libraries for calls to the Polis API, Supabase, and Apple.
- Set `ITSAppUsesNonExemptEncryption` to `false` in `mobile/ios/App/App/Info.plist` so App Store Connect does not prompt on every build.
- Proprietary or non-standard cryptography: **No**.
- French encryption declaration: not required for standard-encryption exempt apps.

## 2. Privacy Nutrition Label mapping

This mapping reflects what the code actually collects, which is narrower than the rights reserved in the privacy policy.
No third-party analytics, advertising, or measurement SDK exists in `package.json`, `mobile/package.json`, `src/`, or `mobile/src` as of this draft.
Diagnostics and usage events are first-party rows in the Supabase `app_event_logs` table written by `src/lib/observability.ts` (category, event, severity, route, user_id, details).
If any analytics or advertising SDK is added later, this label must be redone before submission.

**Tracking (Apple definition, cross-app/cross-site):** **No data used for tracking.**
The app contains no ad SDKs, no fingerprinting, and no data sharing with data brokers.
Answer "Do you or your third-party partners use data for tracking" with **No**, and do not implement the App Tracking Transparency prompt.

### 2.1 Data type mapping

| Actual data | Apple data type | Linked to identity | Tracking | Purposes |
|---|---|---|---|---|
| Account email, login credentials (Supabase auth) | Contact Info > Email Address | Yes | No | App Functionality, Account Management |
| Name, if provided on account (`privacy-policy.md` 1.1) | Contact Info > Name | Yes | No | App Functionality |
| Street address entered for ballot lookup; normalized address and address hash stored in `ballot_imports` (migration `011_ballot_import_architecture.sql`); address saved in ballots (`BallotInput.address` in `src/lib/types.ts`) | Contact Info > Physical Address | Yes | No | App Functionality (finding the user's ballot) |
| Coarse location inferred from IP (privacy policy 1.2) | Location > Coarse Location | Yes | No | App Functionality, Fraud Prevention |
| Issue priorities, policy-signal answers, political identity, free-text values (onboarding `valuesProfile`, `src/app/onboarding/page.tsx`) | User Content > Other User Content | Yes | No | App Functionality (guide personalization), Product Personalization |
| Uploaded or pasted sample-ballot content | User Content > Other User Content (and Photos if the native photo picker ships) | Yes | No | App Functionality |
| Support messages to contact@getpolis.vote | User Content > Emails or Text Messages | Yes | No | App Functionality |
| Election Pass purchases: StoreKit transaction IDs, Stripe records, credit balances (`src/lib/app-store.ts`, `src/lib/stripe.ts`) | Purchases > Purchase History | Yes | No | App Functionality, Account Management |
| Usage events: features used, routes, quota consumption (`app_event_logs`, `src/lib/ai-quotas.ts`) | Usage Data > Product Interaction | Yes | No | App Functionality, Analytics (first-party) |
| Error and diagnostic events (`src/lib/observability.ts`, severity error/warning) | Diagnostics > Other Diagnostic Data | Yes | No | App Functionality |
| Device data: device type, OS version, app version, IP in server logs (privacy policy 1.2) | Identifiers / Diagnostics > Other Diagnostic Data | Yes | No | App Functionality, Fraud Prevention |

Political-values inputs are sensitive information.
Apple has no dedicated "political opinions" label category, so they map to User Content, but the consent gate described below is the substantive protection and must be described in the privacy policy (it is, section 4) and in App Review notes.

### 2.2 Third-party AI processing disclosure (Z.AI)

Ballot, race, candidate, and measure details, issue priorities and policy preferences, political identity and free-text values, and uploaded or pasted ballot content are sent to **Z.AI** (`https://api.z.ai`, model `glm-5.2`, `src/lib/zai.ts`) to generate research and guide analysis.
This must be disclosed in three places:

1. **Privacy Nutrition Label:** the User Content rows above cover it; Z.AI acts as a service provider processing data on Polis's behalf, so it stays inside "data collected" rather than "tracking".
2. **Privacy policy:** already disclosed in `content/legal/privacy-policy.md` section 4, including the data categories and the revocation path.
3. **App Review notes:** state plainly that AI features are gated behind explicit consent (section 3 below), because reviewers check political-data handling closely.

### 2.3 Consent gate (how it actually works)

- The current disclosure version is `2026-07-05-v1` (`CURRENT_AI_CONSENT_VERSION` in `src/lib/ai-consent.ts`).
- Any AI endpoint called without current consent returns HTTP 428 with `requiresAiConsent: true` and `consentUrl: "/ai-consent"` (`AI_CONSENT_REQUIRED_PAYLOAD`).
- The consent page (`src/app/ai-consent/page.tsx`) names the provider, states the purpose, lists the exact data categories from `AI_CONSENT_DISCLOSURE`, links to the privacy policy, and offers "Allow and Continue" or "Not Now".
- Declining routes the user home with non-AI ballot browsing and source links still available.
- The grant records the disclosure version and timestamp in the `ai_data_consents` table.
- Consent is revocable from the Account page; after revocation, AI requests are blocked until the current disclosure is approved again.
- A new disclosure version invalidates old grants, because `hasCurrentAiConsent` requires an exact version match.

### 2.4 Data deletion

Account deletion is available in-product from the Account page (`src/app/account/page.tsx`).
It requires the account email, the phrase DELETE, and the password (`src/lib/account-deletion.ts`).
It deletes the auth account and user-linked records, forfeits unused credits, and attempts deletion of the Stripe customer profile (privacy policy sections 7 and 9.4).
Set the App Store Connect "account deletion" answer to Yes only if the flow is reachable from the iOS app (see gap list in 3.4).

## 3. Review notes for the App Review team

### 3.1 What the app does

Polis is a nonpartisan voter research tool for United States elections, launching for the November 3, 2026 midterms.
Users enter their address to find their ballot, choose issue priorities and values, and purchase an Election Pass (consumable, about USD 1.00) to unlock AI-assisted research dossiers and a personalized guide for one complete ballot.
The same credit system works on our website, where purchases go through Stripe; on iOS all purchases go exclusively through StoreKit in-app purchase.
Polis does not endorse candidates or parties.
Every research claim links to its sources, and the app states in its persistent footer that it "is not an official election administration website" and directs users to verify information with official election sources (`src/components/layout/app-footer.tsx`).
When ballot data is unavailable or incomplete, the app links users to their official state or local election office (`src/lib/official-fallbacks.ts`, `src/lib/state-voting-pages.ts`).

### 3.2 Why a demo account is needed

- AI research and guide features require a signed-in account with consent granted and available credit.
- Ballot lookup coverage depends on live election-data availability for the reviewer's address and date, so the demo account has a representative ballot preloaded and cannot dead-end.
- The demo account is preloaded with Election Pass credits so the reviewer can exercise the paid experience without purchasing, and a sandbox purchase can still be tested separately.

Demo credentials (owner decision required: create before submission, see section 4):

- Email: `appreview@getpolis.vote` (placeholder, owner decision required).
- Password: set in App Store Connect review information, never in this repo.

### 3.3 Numbered reviewer steps

1. Launch the app and sign in with the demo account credentials provided in App Store Connect.
2. Note the footer disclaimer stating Polis is not an official election administration website.
3. From the home screen, choose to start a guide; when prompted for values, select two or three issue priorities and continue.
4. When the app first requests AI analysis, the Z.AI consent screen appears; read the listed data categories, then tap "Not Now" to confirm the app continues working without AI (ballot browsing and source links remain available).
5. Return to the analysis action and this time tap "Allow and Continue" to grant consent.
6. Enter any residential US street address to look up a ballot, or open the preloaded demo ballot on the account; if live lookup has no data for your address, the app offers official election-source links and the preloaded ballot covers the rest of the review.
7. Run a candidate analysis using the account's included starter analysis; a research dossier with source links is generated.
8. Open the Election Pass purchase screen and complete a purchase with a sandbox Apple Account; the price shown comes from StoreKit, one credit is added, and the balance updates.
9. Verify the credit unlocks the full guide for the ballot: per-race comparisons matched to the values chosen in step 3, each with links to sources.
10. Open Account, revoke AI consent, and confirm a subsequent AI request is blocked until consent is granted again.
11. In Account, use "Permanently Delete Account" (type the email and DELETE, then the password) to confirm in-app account deletion works end to end; use a secondary throwaway account for this step so the permanent demo account survives, credentials for it are in the review notes.

### 3.4 Parity gaps that block these steps today

The bundled client in `mobile/src/App.tsx` currently implements only: sign in, credit balance display, StoreKit Election Pass purchase with unfinished-transaction retry, and external links to the website for guides and password reset.
Before submission, the iOS client must add, natively or via the bundled web experience:

- the AI consent screen (steps 4, 5, 10),
- address entry, ballot lookup, and ballot import (step 6),
- AI analysis and guide display (steps 7 and 9),
- account deletion (step 11),
- the "not an official election administration website" disclaimer surface (step 2), which today exists only in the web footer component and is not rendered anywhere in `mobile/src`,
- account sign-up, or an explicit decision to keep the iOS app sign-in-only.

Shipping the current purchase-plus-links client would risk rejection under guidelines 4.2 (minimum functionality) and 3.1.1 (paying for content consumed elsewhere), and the external links to the website for core functionality would compound both.

## 4. Demo and review account spec (owner setup instructions)

Create one permanent review account plus one disposable deletion-test account before every submission.

1. Create the permanent account with an owner-controlled inbox (suggested: `appreview@getpolis.vote`, owner decision required) and verify the email.
2. Grant AI consent once from the account so the reviewer can exercise revocation, or leave it ungranted so the consent screen appears naturally on first AI use; leave it ungranted, since the reviewer steps start from the consent flow.
3. Preload a representative ballot: import a ballot for a covered address with several federal, state, and local races plus at least one ballot measure, and save it to the account so review does not depend on live Google Civic coverage.
4. Leave the starter analysis unused (`FREE_STARTER_ANALYSES` defaults to 1 in `src/lib/ai-quotas.ts`) so step 7 works.
5. Credit the account with at least 2 Election Pass credits through the admin path so the paid guide is reachable even if sandbox purchasing misbehaves during review.
6. Ensure the account passes the trust gate (`trustedAccount` in `src/lib/freemium.ts`), since the purchase button is disabled for untrusted accounts in the mobile client.
7. Confirm the API deployment that review will hit has `APPLE_IAP_ENVIRONMENT` set correctly; App Review purchases use the sandbox-style environment on a production app, so verification must accept Apple's review transactions per `docs/app-store-commercial-route.md`.
8. Create the disposable deletion-test account, verify it, and include both credential sets in App Store Connect review notes.
9. After every rejection or resubmission cycle, re-verify the permanent account still signs in, still has credits, and still has its preloaded ballot.

## 5. Asset checklist

### 5.1 Screenshots

The Xcode project targets iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"` in `mobile/ios/App/App.xcodeproj/project.pbxproj`), so both device classes need screenshots unless the target is changed to iPhone-only.
Owner decision required: keep iPad support (and test the layout on iPad) or set the target to iPhone-only before submission.

Required sets for current devices:

- iPhone 6.9-inch display: 1320 x 2868 px portrait (or 2868 x 1320 landscape); this set is mandatory and scales down for smaller iPhones.
- iPad 13-inch display: 2064 x 2752 px portrait (or 2752 x 2064); mandatory only while the app targets iPad.
- 3 to 10 screenshots per set; plan at least 5: ballot lookup, values selection, research dossier with sources, personalized guide, Election Pass screen.
- Do not show real candidates in a way that implies endorsement; use the demo ballot and neutral framing.
- The consent screen makes a strong privacy-story screenshot and supports the review narrative.

### 5.2 App icon

An icon exists at `mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024 x 1024 single-size asset).
It is still the stock Capacitor template icon (blue crossed strokes on a grid background), not Polis branding.
Owner decision required: replace with the final Polis icon before TestFlight, since the template icon would fail 2.3.1 (misleading or placeholder metadata) review standards.

### 5.3 URLs and text assets

- Support URL: owner decision required (`docs/production-readiness-2026-midterms.md` lists this as an open owner action); placeholder `https://getpolis.vote/contact`, which exists as an in-app route (`src/app/contact`) and must exist on the public site.
- Marketing URL (optional field): owner decision required; placeholder `https://getpolis.vote`.
- Privacy policy URL (required): `https://getpolis.vote/privacy`, backed by `content/legal/privacy-policy.md`; confirm it is publicly reachable without sign-in.
- Copyright line: `2026 Atelier SW LLC`.
- Review contact: owner name, phone, and email in App Store Connect (owner decision required).

## 6. Guideline risk assessment

| Guideline | Risk | Mitigation grounded in the app |
|---|---|---|
| 1.1 Objectionable content (defamation, mean-spirited content about real people) | AI research makes factual claims about named candidates | Every dossier links to sources, the footer directs users to verify with official sources, and the readiness plan commits to a hallucination/partisan-skew golden set and an in-product correction flow before launch (`docs/production-readiness-2026-midterms.md`). |
| 5.1.1 / 5.1.2 Data collection, consent, and data use (political data) | Political opinions and values are sensitive data sent to a third-party AI provider | A versioned, explicit, revocable consent gate blocks every AI call server-side with HTTP 428 until granted (`src/lib/ai-consent.ts`), the disclosure names the provider and exact data categories, and the privacy policy section 4 matches it. |
| 5.1.1(v) Account deletion | Apps with accounts must offer in-app deletion | Web deletion exists on the Account page with email, phrase, and password confirmation; the same path must be reachable from the iOS client before submission (gap listed in 3.4). |
| 3.1.1 In-app purchase | Digital content (AI guide credit) must use IAP on iOS | The iOS client sells the Election Pass only through StoreKit with server-side JWS verification and idempotent fulfillment (`docs/app-store-commercial-route.md`, `mobile/src/lib/purchases.ts`); Stripe is confined to the web and the app never links out to purchase, per 3.1.3(b) cross-platform rules. |
| 4.2 Minimum functionality | A thin wrapper around the website gets rejected | The readiness plan requires native v1 value before submission: native file/photo picker for ballot uploads, share sheet and deep links, offline access to saved guides, and an election reminder path; the current sign-in-plus-purchase client is explicitly not the submission candidate (section 3.4). |
| 2.3.1 Accurate metadata, no misleading claims | Overclaiming ballot coverage or officialness | Metadata says "informational research tool", never claims official status, the app states coverage limits in lookup failures (`src/lib/ballot-fallbacks.ts`) and links to official election offices, and the placeholder app icon must be replaced before submission. |
| 5.1 Privacy label accuracy | Label mismatch with observed traffic is a common rejection | The label in section 2 is derived from actual code paths (Supabase, Z.AI, StoreKit, Stripe, first-party event logs) and no analytics or ad SDKs exist; re-audit the label if any SDK is added. |

## Open items summary

1. Owner: support URL, marketing URL, review contact, demo account email, primary category confirmation, age-rating override, iPad support decision.
2. Engineering: mobile parity gaps in section 3.4, including consent, ballot, guide, deletion, sign-up decision, and disclaimer surfaces in the iOS client.
3. Design: replace the stock Capacitor app icon and produce screenshot sets.
4. Compliance: add `ITSAppUsesNonExemptEncryption` to `Info.plist`, and re-verify the privacy label if any analytics SDK lands before submission.
