const URL = 'https://todomvc.com/examples/react/dist/';
const p = await tabFor('todomvc.com/examples/react', URL);
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await prep(p);
// The site's own "about this framework" side panel is not part of the app being shown.
await p.addStyleTag({ content: 'aside.learn { display: none !important; } body.learn-bar { padding-left: 0 !important; } .learn-bar > .todoapp, .learn-bar > .info { margin-left: auto !important; margin-right: auto !important; left: 0 !important; }' });
await p.getByPlaceholder('What needs to be done?').waitFor();
ensure(p, 'todomvc.com/examples/react');
await placeCursor(p);
stop = await record(p, '_tmp01');
await sleep(1300);
await click(p, p.getByPlaceholder('What needs to be done?'), 0.82);
for (const todo of ['Write the shot list', 'Record the scenes', 'Send the cut']) {
  await sleep(350);
  await typeHuman(p, todo);
  await sleep(300);
  await p.keyboard.press('Enter');
  await p.getByText(todo, { exact: true }).waitFor();
}
await park(p, W * 0.78, H * 0.42);
await sleep(2600);
const r = await stop(); stop = null;
return { frames: r.frames, items: await p.locator('.todo-list li').count(), left: await p.locator('.todo-count').innerText() };
