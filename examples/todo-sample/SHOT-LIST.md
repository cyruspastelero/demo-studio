# Shot list: todo-sample

| # | Part | Scene stem | On screen | Caption | Length | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | use | 01-add-todos | Three todos typed, each lands in the list on Enter | Type it. Press Enter. | 10s | |
| 02 | use | 02-complete-and-filter | Two todos ticked; Active, Completed, All | Tick things off. Filter what is left. | 13s | 01 (same three todos) |
| 03 | use | 03-clear-completed | Clear completed removes the two done todos | Clear the finished ones in one click. | 6s | 02 (two done) |

The three scenes run in one pass on one open tab, so the list on screen carries from one to the next.

## Edit plan (to docs/quality-bar.md)

All three scenes share one window run, cropped to the list (`[540, 150, 840, 430]` source px).

| # | Callout pill | Zoom target (when, what) | Highlight | Music |
| --- | --- | --- | --- | --- |
| 01 | statement "Type it. Press Enter." as the window lands | none | none | bed from frame 0 |
| 02 | none (two zooms carry it) | 0.3 s, the second todo as it is ticked; 6.4 s, the footer as All shows | "Record the scenes" text; "Clear completed" | |
| 03 | statement "Done ones, gone." after the clear | none (the zoom from 02 eases back as it is clicked) | none | dip as the list clears |

| Card | Kind | Title (accent in bold) | Subtitle or tagline |
| --- | --- | --- | --- |
| intro | hero | A todo list in **three** moves. | Recorded and cut with demo-studio. |
| outro | end | Real app. Real **clicks.** | github.com/Cyvid7-Darus10/demo-studio |
