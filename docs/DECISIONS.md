# Decisions

<!-- Append-only. One entry per real choice — if it was obvious, it was not a
     decision. The reason is the load-bearing part: without it the entry reads
     as arbitrary and gets re-argued. Supersede, never delete. -->

## Decided

**Before a drift word, Tuck looks at the page again: typing, then a short excerpt (2026-11-01, issue #5).**
URL and title cannot tell a work chat from a feed on the same site: Safa was nudged while messaging a teammate about this project in LinkedIn's chat window. Typing is a yes/no checked before every drift word: focus in a text field and a key pressed in the last minute (only that time is noted). The excerpt is read a little ahead because it takes a model call: up to 1,000 characters from where the person types, else from the middle of the window. It is redacted, sent to a model that does not train on it, and only the verdict is kept. It rules out screenshots and site-specific scraping, and it never runs on pages with a password field or on the never-read sites.

**"This is for my task" on a whole site lasts 30 minutes; for good only after 3 different days (2026-11-01, issue #5).**
One click meant "this visit is work", but it made the whole site work forever, which hides the next real drift there (the feed after the chat). Title labels (YouTube and the like) still last.

**{{The decision, in one sentence.}}**
{{Why, and what it rules out.}}

## Rejected

- **{{The attractive idea that keeps coming back}}** — {{the concrete reason it fails here}}

## Superseded

- ~~Relevance from URL + title only (v1, under test)~~ — 2026-11-01, replaced by the second look: the hypothesis failed on mixed sites (issue #5).
- ~~{{old decision}}~~ — {{YYYY-MM-DD}}, replaced by {{new}}: {{why it changed}}

## Open

- {{question}} — settled by {{what evidence would decide it}}
