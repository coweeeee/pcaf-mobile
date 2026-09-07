# Privacy Policy — Financed Emissions

**Last updated: 7 September 2026**

## Summary

**Financed Emissions collects no personal data of any kind.**

There are no accounts, no sign-in, no analytics, no advertising, no tracking, no
crash reporting, and no third-party SDKs that gather information about you. The
app makes no network requests while you use it.

## What the app does with your data

Everything the app calculates happens **on your device**, against a reference
dataset that is compiled before release and shipped inside the app itself.

If you import a portfolio CSV file:

- The file is read on your device and parsed there.
- The resulting holdings are stored **only** on your device, in the app's own
  private storage, so the app can show the same portfolio next time you open it.
- The file and its contents are **never transmitted anywhere.** There is no
  server to transmit them to — this app has no backend.
- You can remove the stored portfolio at any time by tapping **Reset to demo
  portfolio** on the Import screen, or by deleting the app.

Your portfolio holdings are financial information, and they never leave your
device.

## Network activity

The app makes **no network requests at runtime.** It does not contact any
server, API, or analytics endpoint while you use it.

The reference dataset that ships with the app is built beforehand, on a
developer machine, from public sources (SEC EDGAR, Climate TRACE, EPA GHGRP and
Yahoo Finance). That data-gathering happens during development, not on your
device and not while you are using the app.

## Data we collect

None. To be explicit, the app does not collect, transmit, sell, or share:

- Contact information (name, email address, phone number, physical address)
- Health, fitness, or medical information
- Financial information, including your portfolio holdings
- Precise or coarse location
- Contacts, messages, photos, videos, audio, or other files
- Browsing or search history
- Identifiers, including device ID, advertising ID, or user ID
- Usage data, product interaction, or advertising data
- Diagnostics, crash logs, or performance data
- Purchase history
- Any other data

There is no tracking as defined by Apple's App Tracking Transparency framework.
The app does not use the AppTrackingTransparency framework because it has
nothing to request permission for.

## Permissions

The app requests **no runtime permissions** — no location, camera, microphone,
contacts, photos, or notifications.

Choosing a CSV file uses the standard iOS document picker. iOS grants the app
access to only the single file you pick, at the moment you pick it. The app has
no access to the rest of your files.

## Children

The app is rated 4+ and is safe for all ages. It collects no data from anyone,
including children.

## Third-party services

None are used at runtime.

The app is built with the Expo and React Native open-source frameworks. No
analytics, attribution, advertising, or crash-reporting service is included in
the build.

## Data retention and deletion

The only data stored is the portfolio you choose to import, held in the app's
private on-device storage. It is deleted when you tap **Reset to demo
portfolio**, or when you delete the app. Because nothing is ever transmitted,
there is no server-side copy to request the deletion of.

## Accuracy disclaimer

This app is a demonstration of the PCAF (Partnership for Carbon Accounting
Financials) methodology. Its emissions figures combine measured facility data
with sector-average estimates, and every figure is labelled with its source and
data quality score inside the app. It is not investment advice, not assured
data, and not a substitute for a licensed emissions dataset in any regulatory or
published disclosure.

## Changes to this policy

Any change will be published at this URL, with the "last updated" date above
revised. Since the app collects nothing, changes are expected to be rare.

## Contact

Questions about this policy or the app:

- GitHub Issues: https://github.com/coweeeee/pcaf-mobile/issues
- Email: sneakergoathead1@gmail.com
