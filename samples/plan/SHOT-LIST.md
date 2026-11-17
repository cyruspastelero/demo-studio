# Shot list: Wrenfield Analytics (fictional sample)

Goal: a growth lead believes they can set Wrenfield up in minutes and get a straight answer about
last week's signups without building a report.
Audience: founders and growth leads at small software companies.

## Quality bar (every take)

- 1440x810 CSS at DPR 2, then 1920x1080, 30fps, silent
- One world: workspace Harbor Studio, week of 10 to 16 March, 1,240 signups, 4,812 weekly users
- No trial banner, no "Saved" toast, no other workspaces in the switcher
- Ingest key masked in the page; every frame across scene 02's reveal checked
- Pointer glides, pauses, clicks, parks; 1 to 1.5s head and 2 to 3s tail on every take

## Scenes

Recipe = the file in `samples/scenes/` the scene body starts from.

| # | Part | Scene | What's on screen | Caption | Length | Depends on | Recipe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | setup | 01-create-project | New project form: name only, error "Enter an owner email", then fixed and created | Name it. That's the first step. | 15s | reset | form-validation |
| 02 | setup | 02-ingest-key | Settings, Keys: create "Website tracking", Read only, key revealed (masked), Copy | One read-only key. | 14s | 01 | secret-reveal |
| 03 | use | 03-dashboard-tour | Dashboard: 4,812 weekly users, then Signups by channel, Retention, Top pages | Your week on one page. | 18s | seed | dashboard-tour |
| 04 | use | 04-ask-assistant | Riley asks which channel brought the most signups; answer: newsletter, 471 of 1,240, up from 29% to 38% | Ask in plain words. | 20s | seed, 03 | ai-chat-reply |
| 05 | use | 05-hide-test-traffic | Settings, Reports: switch "Hide test traffic"; visits 18,960 to 17,402 | Test traffic, gone. | 12s | seed | settings-toggle |
| 06 | proof | 06-invite-viewer | Team: invite sam@example.com as Viewer; new row appears | Share it with the team. | 12s | reset | modal-dialog |
| 07 | proof | 07-sam-sees-report | Sam's window: the same dashboard, read only | Same numbers, no extra seat. | 10s | 06 | two-person-handoff |
| 08 | edge | 08-assistant-no-data | Riley asks about February; answer: no data before 3 March | It says when it doesn't know. | 14s | seed | ai-chat-reply |

Scenes 03, 04 and 05 quote the same numbers. If you re-seed, re-shoot all three in one pass.
Scene 07 is recorded in a second window ("sam") with `rec.mjs`.

## Videos

- **Promo (about 1:30):** intro card, 03, 04, 05, 06 + 07, outro card. Setup is one card.
- **How-to (about 3:00):** every scene in order, with part cards for setup, use and sharing.
- **Social 9:16:** scene 04 alone, `fit: crop` on the answer, caption band.

## Accounts and state needed before recording

- [ ] Riley Chen (growth lead) logged in to the Playwright MCP browser, workspace Harbor Studio
- [ ] Sam Ortiz (founder) logged in to window "sam" (port 9334), Viewer invite accepted off camera
      after scene 06's take, then reset for any re-take
- [ ] Seed: 4 weeks of events, 1,240 signups for 10 to 16 March, newsletter 471, test traffic
      1,558 visits from the "qa-bot" user agent, no data before 3 March
- [ ] Reset script `tools/reset.sh`: deletes project "Spring launch", key "Website tracking",
      the Sam invite, and turns "Hide test traffic" off
