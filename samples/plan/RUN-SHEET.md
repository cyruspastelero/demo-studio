# Run sheet: Wrenfield Analytics (fictional sample)

The story beat by beat, with the exact words typed on camera. Times are for the how-to.

Story: why (card) -> set it up (01, 02) -> use it (03, 04, 05) -> proof (06, 07) -> edge (08) -> close

## Cast (fictional)

| Who | Role | Window or account |
| --- | --- | --- |
| Riley Chen | Growth lead at Harbor Studio | Playwright MCP browser, riley@example.com |
| Sam Ortiz | Founder at Harbor Studio | Window "sam", port 9334, sam@example.com |

## Beats

### Intro card (0:00 to 0:04)

- Card: "Last week, in one answer." / "Wrenfield Analytics"
- Voiceover draft: Monday morning. Someone asks where last week's signups came from, and you open
  five tabs to find out.

### Beat 1: create the project (0:04 to 0:19)

- Where: app.example.com/projects/new
- Action: type the name, press Create with the owner email empty, read the error, fill it, Create.
- Typed on camera: `Spring launch`, then `riley@example.com`
- Expected result: "Enter an owner email" under the field; then the project page, under 2s.
- Voiceover draft: Start with a project. Miss a field and it tells you which one.

### Beat 2: the ingest key (0:19 to 0:33)

- Where: Settings, Keys
- Action: Create key, name it, pick Read only, Generate, Copy. Key is masked in the page.
- Typed on camera: `Website tracking`
- Expected result: the key panel with a Copy button, under 1s. The mask catches the `wf_test_` prefix.
- Voiceover draft: Then make one read-only key for your site. It can send events, and nothing else.

### Beat 3: the dashboard (0:33 to 0:51)

- Where: Dashboard
- Action: point at Weekly active users, then scroll to Signups by channel, Retention, Top pages.
- Typed on camera: nothing
- Expected result: 4,812 weekly users; signups chart for 10 to 16 March.
- Voiceover draft: A few minutes later, your week is on one page.

### Beat 4: ask the assistant (0:51 to 1:11), hero

- Where: Assistant
- Action: click the composer, type, Enter, wait for the reply, scroll it into view.
- Typed on camera: `Which channel brought the most signups last week, and how does it compare to the week before?`
- Expected result: "The newsletter: 471 of 1,240 signups, 38%, up from 29% the week before."
  Reply in 6 to 10s; trim the wait to about 1s in the edit.
- Voiceover draft: Or just ask. The answer comes from your own numbers, so you can check it.

### Beat 5: hide test traffic (1:11 to 1:23)

- Where: Settings, Reports
- Action: point at visits, flip "Hide test traffic", point at visits again.
- Expected result: 18,960 visits becomes 17,402.
- Voiceover draft: One switch hides your own test traffic.

### Beat 6: invite a viewer (1:23 to 1:35)

- Where: Team
- Action: Invite member, email, Role Viewer, Send invite; the new row appears.
- Typed on camera: `sam@example.com`
- Expected result: dialog closes, row "Sam Ortiz, Viewer, Invited".
- Voiceover draft: Share it with the team. Viewers don't need a paid seat.

### Beat 7: Sam sees it (1:35 to 1:45)

- Where: window "sam", Dashboard
- Action: the dashboard loads; pointer rests on 4,812.
- Expected result: same numbers, no edit buttons.
- Voiceover draft: Sam sees the same numbers, and can't change them by accident.

### Beat 8: no data (1:45 to 1:59), edge case

- Where: Assistant
- Typed on camera: `How many signups did we get in February?`
- Expected result: "There's no data before 3 March, when tracking started."
- Voiceover draft: And when there's no data, it says so. It doesn't guess.

## Close

- End card: "Wrenfield Analytics" / "wrenfield dot example dot com" shown as `wrenfield.example.com`
- Voiceover draft: Wrenfield. Your week, in one answer. Try it free at wrenfield dot example dot com.
