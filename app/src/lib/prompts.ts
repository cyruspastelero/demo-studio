// Ready-to-copy prompts for the home screen's Prompts and Templates views. A part to change is
// written as [[like this]] in the data: the view highlights it, and the copied text drops the
// brackets, so what lands in Claude reads as one plain sentence.

export interface Prompt {
  id: string;
  text: string;
  what: string;
}

export interface PromptGroup {
  id: string;
  title: string;
  note: string;
  prompts: Prompt[];
}

export interface Segment {
  text: string;
  placeholder: boolean;
}

const PLACEHOLDER = /\[\[([^\]]+)\]\]/g;

// The prompt split into plain parts and parts to change, in order.
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), placeholder: false });
    out.push({ text: match[1], placeholder: true });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), placeholder: false });
  return out;
}

// The text to put on the clipboard: the prompt without the [[ ]] markers.
export function plainText(text: string): string {
  return text.replace(PLACEHOLDER, '$1');
}

export function placeholders(text: string): string[] {
  return segments(text).filter((s) => s.placeholder).map((s) => s.text);
}

export const TEMPLATE_COPIER: Prompt = {
  id: 'template-copier',
  text: 'Make a template from [[~/Videos/reference.mp4]]: split it, check it frame by frame and save its look.',
  what: 'Claude splits the video into frames, checks them one by one and saves the colours, type and pacing as a template you can reuse.',
};

// Template ids come from template folders, which may be someone else's. Only an id of the
// template-id shape goes into a prompt (in backticks); anything else stays a part to fill in.
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

// "Use" on a template card copies this, with the template's id filled in.
export function templatePrompt(id: string): string {
  const named = TEMPLATE_ID.test(id) ? `\`${id}\`` : id === '[[<id>]]' ? id : '[[<id>]]';
  return `Make a demo of [[app.example.com]] using template ${named}.`;
}

export const PROMPT_GROUPS: PromptGroup[] = [
  {
    id: 'start',
    title: 'Start',
    note: 'Your first demo, or a new one.',
    prompts: [
      {
        id: 'try-it',
        text: 'Try it: record the todo sample end to end.',
        what: 'Claude records the bundled todo app sample and cuts it into a video. No account or login needed.',
      },
      {
        id: 'logged-in',
        text: 'Make a demo of [[app.example.com]]. Goal: [[what viewers should be able to do after watching]]. Audience: [[who will watch it]]. I\'m logged in to the sandbox in the Playwright browser.',
        what: 'Claude plans the scenes with you, then records them in the browser you are already logged in to.',
      },
      {
        id: 'keychain',
        text: 'Make a demo of [[app.example.com]]. The sandbox login is [[demo@example.com]] and the password is in my Keychain as [[demo-acme]].',
        what: 'Claude logs in off camera with the password from your Keychain, and never writes it in the chat or a file.',
      },
    ],
  },
  {
    id: 'templates',
    title: 'Templates',
    note: 'Reuse a look across demos.',
    prompts: [
      {
        id: 'use-template',
        text: templatePrompt('[[<id>]]'),
        what: 'Claude makes the demo in the colours, type and pacing of that template. Find ids in the Templates menu.',
      },
      {
        id: 'list-templates',
        text: 'List my templates.',
        what: 'Claude lists the templates in your demos folder and the ones built in, with their ids.',
      },
    ],
  },
  {
    id: 'fix',
    title: 'Fix and finish',
    note: 'After the first cut.',
    prompts: [
      {
        id: 'reshoot',
        text: 'Re-shoot scene [[03]], the reply was slow.',
        what: 'Claude records that scene again and swaps the new take into the cut. The other scenes stay as they are.',
      },
      {
        id: 'narrate',
        text: 'Narrate it with ElevenLabs and add a music bed.',
        what: 'Claude writes the voiceover lines, has ElevenLabs read them and mixes them over music that dips under the voice.',
      },
      {
        id: 'social',
        text: 'Make 4:5 and 9:16 versions.',
        what: 'Claude reframes the cut for feeds and stories, keeping the important part of each shot in view.',
      },
      {
        id: 'package',
        text: 'Package it for an editor.',
        what: 'Claude builds a handoff folder with numbered clips, title cards, voiceover files and notes, ready to zip.',
      },
    ],
  },
  {
    id: 'housekeeping',
    title: 'Housekeeping',
    note: 'Keep the folder tidy.',
    prompts: [
      {
        id: 'organise',
        text: 'Organise my demos.',
        what: 'Claude moves stray files into the standard layout, fixes the index and asks once before deleting anything.',
      },
      {
        id: 'status',
        text: 'What state are my demos in?',
        what: 'Claude reads every demo folder and tells you what is done and what to do next for each one.',
      },
    ],
  },
];
