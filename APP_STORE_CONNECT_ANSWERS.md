# App Store Connect — answers to click through

Draft answers for the two questionnaires you must complete yourself (both are
legal attestations tied to your Apple ID, so I can't submit them).

Everything below follows from one fact, which is true of this app: **it collects
nothing, transmits nothing, and makes no network requests at runtime.**

---

## Part 0 — creating the app record

**My Apps → + → New App**

| Field | Value |
| --- | --- |
| Platforms | iOS |
| Name | `Financed Emissions` |
| Primary Language | English (U.S.) |
| Bundle ID | `com.coweeeee.pcafmobile` |
| SKU | `pcafmobile001` |
| User Access | Full Access |

> **Bundle ID must exist first.** It appears in that dropdown only after it has
> been registered. EAS registers it automatically the first time you run a build
> with these credentials. If the dropdown is empty, either run
> `eas build --profile production --platform ios` first, or register it manually
> at developer.apple.com → Certificates, Identifiers & Profiles → Identifiers →
> + → App IDs → App → Bundle ID `com.coweeeee.pcafmobile`.
>
> I changed `app.json` to this bundle ID — it previously read
> `com.pcafdemo.financedemissions`, which would not have matched the record you
> are creating.

---

## Part 1 — App Privacy questionnaire

**App Store Connect → your app → App Privacy**

### First question

> **Do you or your third-party partners collect data from this app?**

**Answer: No, we do not collect data from this app.**

That single answer completes the questionnaire. Apple will not ask you to
categorise anything further, and the App Store listing will show **"Data Not
Collected."**

Apple defines "collect" as transmitting data off the device. This app transmits
nothing, so "No" is accurate — not a convenience.

### If you want to verify category by category

Apple only shows this list if you answer "Yes" above. It is reproduced here so
you can satisfy yourself the "No" is right before attesting to it.

| Apple data category | Answer | Why |
| --- | --- | --- |
| Contact Info — name, email, phone, address, other | **Data Not Collected** | No accounts, no sign-in, no contact form in the app |
| Health & Fitness — health, fitness | **Data Not Collected** | No HealthKit, no such data touched |
| Financial Info — payment info, credit info, other financial info | **Data Not Collected** | ⚠️ See note below — this is the one to read |
| Location — precise, coarse | **Data Not Collected** | No location APIs, no permission requested |
| Sensitive Info | **Data Not Collected** | None touched |
| Contacts | **Data Not Collected** | No Contacts access |
| User Content — emails/messages, photos/videos, audio, gameplay, customer support, other | **Data Not Collected** | An imported CSV stays on device; never transmitted |
| Browsing History | **Data Not Collected** | No browser, no web views that track |
| Search History | **Data Not Collected** | No search is recorded |
| Identifiers — user ID, device ID | **Data Not Collected** | No user IDs, no IDFA/IDFV read, no advertising SDK |
| Purchases — purchase history | **Data Not Collected** | No IAP, free app |
| Usage Data — product interaction, advertising data, other usage data | **Data Not Collected** | No analytics SDK of any kind |
| Diagnostics — crash data, performance data, other diagnostic data | **Data Not Collected** | No Sentry/Crashlytics/Bugsnag; no crash reporting |
| Surroundings — environment scanning | **Data Not Collected** | No ARKit/room scanning |
| Body — hands, head | **Data Not Collected** | No such APIs |
| Other Data | **Data Not Collected** | Nothing else is gathered |

**⚠️ Financial Info — the one category worth thinking about, and why it is still
"Data Not Collected."**

Users can import a CSV of their portfolio holdings, which is genuinely financial
information. It is still "Data Not Collected" because Apple's definition of
collection is **transmitting data off the device**. Apple's own guidance states
that data which "is only stored on the device and is not sent off the device"
does not count as collected.

In this app the CSV is parsed on device, the holdings are written to the app's
private local storage so the portfolio survives a restart, and nothing is ever
transmitted — there is no backend to transmit to. So the answer is accurate.

If Apple's reviewer ever queries it, the factual reply is: *"Imported portfolio
data is parsed and stored exclusively on device. The application performs no
network requests at runtime and has no server component."*

### Tracking

> **Do you or your third-party partners use data for tracking purposes?**

**Answer: No.**

No advertising identifiers, no data brokers, no cross-app or cross-site linking.
The app does not use the AppTrackingTransparency framework because there is
nothing to ask permission for.

### Privacy Policy URL

Paste this into **App Store Connect → App Information → Privacy Policy URL**:

```
https://raw.githubusercontent.com/coweeeee/pcaf-mobile/main/PRIVACY.md
```

That URL works and is publicly reachable, which is Apple's actual requirement.
It renders as plain text. If you would rather it render as a formatted page,
enable GitHub Pages (repo → Settings → Pages → Source: Deploy from a branch →
`main` / root) and use:

```
https://coweeeee.github.io/pcaf-mobile/PRIVACY
```

Either is acceptable. Confirm whichever you choose loads in a private browser
window before submitting — a policy URL behind a login is a common rejection.

---

## Part 2 — Age Rating questionnaire

**App Store Connect → your app → Age Rating → Edit**

Apple overhauled this form in 2025; it now produces 4+, 9+, 13+, 16+ or 18+.
Every content question below is **None** for this app — it has no user-generated
content, no social features, no purchases, no ads, no web browsing, and no
mature themes of any kind.

### Content descriptors — all "None"

| Question | Answer |
| --- | --- |
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Contests | None |
| Violent Sexual Content | None |

### Interactive / capability questions

| Question | Answer | Why |
| --- | --- | --- |
| Does your app contain user-generated content? | **No** | No posting, sharing, comments or profiles. An imported CSV is private to the device |
| Does your app include chat, messaging, or social features? | **No** | None |
| Does your app allow users to communicate or share content with others? | **No** | No share/export-to-others feature |
| Does your app include advertising? | **No** | No ad SDK |
| Does your app include in-app purchases? | **No** | Free, no IAP |
| Does your app include gambling? | **No** | None |
| Does your app include contests or sweepstakes? | **No** | None |
| Does your app provide unrestricted web access? | **No** | No embedded browser; the app makes no network requests at all |
| Does your app include age-restricted content requiring 18+? | **No** | None |
| Is your app made for kids (Kids Category)? | **No** | It is a finance tool for adults — but it is safe for all ages, which is a different thing from being *designed* for children. Do **not** opt into the Kids Category; that imposes extra requirements and is not what this app is |

### Expected result

**4+**, with no content descriptors.

### ⚠️ One question to read carefully rather than click past

Recent versions of this form ask about **medical or wellness information** and,
separately, about **financial services or advice**. This app:

- gives **no** medical information → None
- gives **no** personalised financial advice, offers no brokerage or trading, and
  handles no money. It is an analytical/educational calculator.

If a question asks specifically whether the app *provides financial advice or
investment recommendations*, the answer is **No**. If it asks whether the app
*relates to financial services or information*, the honest answer is **Yes** —
it is a Finance-category analytical tool. Neither answer raises the rating above
4+, but they are different questions, so read which one is being asked.

If you hit a question here whose wording doesn't match anything above, stop and
send it to me rather than guessing — a wrong attestation is worse than a delay.

---

## Part 3 — App Information

| Field | Value |
| --- | --- |
| Primary Category | **Finance** |
| Secondary Category | *(optional)* Education — reasonable, since the app is largely a worked explanation of a methodology. Leave blank if unsure; it has no effect on review |
| Content Rights | Check **"No, it does not contain, show, or access third-party content"** — see note |
| Age Rating | 4+ (from Part 2) |
| Privacy Policy URL | see Part 1 |

**Content Rights note.** The app displays figures derived from public data
sources (SEC EDGAR, Climate TRACE, EPA GHGRP, Yahoo Finance) that are compiled
at build time. This is factual public data reproduced as computed numbers, not
third-party *content* in the sense Apple means (video, music, articles). "No" is
the correct answer. If you'd rather be conservative, answering "Yes" and naming
the sources is also defensible and does not trigger extra review — say so and
I'll draft that wording.

---

## Part 4 — Export compliance

You will be asked this at build upload:

> **Does your app use encryption?**

**Answer: No.**

`app.json` already declares `ITSAppUsesNonExemptEncryption: false`, so this
should be answered automatically and not prompt you. The app makes no network
requests and implements no cryptography.

---

## Part 5 — the order to do things in

1. **You:** create the app record (Part 0).
2. **Me:** `eas build --profile production --platform ios` — needs your
   `eas login` first, and will prompt to generate a distribution certificate and
   provisioning profile. Say yes; EAS manages them.
3. **Me:** `eas submit --platform ios --profile production`, choosing the app
   record you created.
4. **You:** App Privacy (Part 1) and Age Rating (Part 2).
5. **You:** paste listing copy and keywords from `APP_STORE_LISTING.md`, upload
   screenshots.
6. **You:** attach the build, then **Submit for Review**.

**No Paid Apps agreement is needed.** This is a free app with no in-app
purchases, so the Free Apps agreement you already accepted on joining the
Developer Program is sufficient. Skip Agreements, Tax, and Banking entirely.

---

## Part 6 — iOS privacy manifests (`NSPrivacyAccessedAPITypes`)

Apple requires a declared reason for a handful of "required reason" APIs, even
in an app that collects nothing. The relevant ones here are **User Defaults**
(AsyncStorage) and **File Timestamp / Disk Space** (the file picker).

**Static check — done, and clean.** Both packages that touch those APIs ship
their own `PrivacyInfo.xcprivacy`, which Xcode aggregates into the app's
manifest at build time:

| Package | Ships a manifest |
| --- | --- |
| `@react-native-async-storage/async-storage` | yes — `ios/PrivacyInfo.xcprivacy` |
| `expo-file-system` | yes — `ios/PrivacyInfo.xcprivacy` |
| `expo-document-picker`, `expo-haptics`, `react-native-svg`, `expo-router` | none, and none needed — they use no required-reason API |

So `app.json` deliberately has **no** `expo.ios.privacyManifests` block: adding
one would duplicate declarations the pods already make.

**⚠️ What I could not verify.** The definitive check is the production build log
and the App Store Connect upload response, and both need your Apple credentials
— I can't run them. After the build, do this:

1. Watch the `eas build` log for `Missing privacy manifest` or
   `NSPrivacyAccessedAPITypes` warnings.
2. After `eas submit`, check email for an Apple "ITMS-91053: Missing API
   declaration" notice. This arrives within ~30 minutes of upload and is a
   warning, not a rejection, on first occurrence.

**If a warning does appear**, add the reported API to `app.json` and rebuild.
Ready-to-paste block covering the two most likely codes:

```json
"ios": {
  "privacyManifests": {
    "NSPrivacyAccessedAPITypes": [
      {
        "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
        "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
      },
      {
        "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
        "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
      },
      {
        "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
        "NSPrivacyAccessedAPITypeReasons": ["E174.1"]
      }
    ]
  }
}
```

Reason codes: `CA92.1` = access to user defaults limited to the app itself.
`C617.1` = file timestamps for files the user selected. `E174.1` = disk space
checked to write a user-requested file. All three are accurate for this app —
but only add the ones Apple actually reports, since an unnecessary declaration
is noise.

Send me the exact warning text and I'll produce the precise block.
