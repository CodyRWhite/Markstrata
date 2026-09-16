# Privacy

Markstrata is a SharePoint web part. It runs in your browser, inside your own
Microsoft 365 tenant, and it has no server of its own to send anything to.

## The web part

**Your documents never leave your tenant.** The web part reads markdown from
the SharePoint library, file URL or page content you point it at, using your
own signed-in session, and renders it in the page. There is no Markstrata
service in the middle, because there is no Markstrata service.

**There is no telemetry.** Nothing counts how often it is used, which documents
are opened, or who opened them. No usage data is collected, so none can be
shared or sold.

**Nothing is fetched from anywhere else while it runs.** The fonts, the
stylesheets, the maths typesetting and the diagram renderer are all inside the
package your administrator installs. A page with Markstrata on it makes no
request to any third party.

**One thing is remembered, in your own browser.** If you switch the theme or
the light and dark mode for yourself, that choice is kept in your browser's
local storage so the page looks the same next time. It stays on your device,
is readable only by you, and is never sent anywhere. Clearing your browser data
removes it.

**What SharePoint itself records** is a matter for SharePoint. Opening a file,
saving one, and version history are ordinary SharePoint operations, audited by
your tenant in the ordinary way, under your organisation's own policies.

## This website

markstrata.com uses Google Analytics to count visits: which pages are read, and
roughly where in the world from. It is there to know whether the documentation
is any use.

There is nothing to sign in to here, so nothing is asked of you and no account
exists. If you would rather not be counted, any content blocker or a browser
with tracking protection on will stop it, and the site works exactly the same.

The analytics script loads only on markstrata.com itself. The web part carries
nothing of the kind.

## Getting in touch

Questions about any of this, or anything that looks wrong, belong in the
project's issue tracker on GitHub, linked at the foot of every page.

This page describes what the software actually does. It is written to be
accurate rather than to be comprehensive legal cover, and your organisation's
own policies govern how you use it.
