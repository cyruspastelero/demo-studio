import { LayoutTemplate } from 'lucide-react';
import { plainText, PROMPT_GROUPS, type Prompt } from '../lib/prompts';
import { CopyPrompt, PromptText, type Copier } from './library';

export const PROMPT_COUNT = PROMPT_GROUPS.reduce((sum, g) => sum + g.prompts.length, 0);

function PromptCard({ prompt, copy }: { prompt: Prompt; copy: Copier }) {
  return (
    <article className="prompt-card" data-testid="prompt-card" data-prompt={prompt.id}>
      <PromptText text={prompt.text} />
      <p className="prompt-what">{prompt.what}</p>
      <div className="prompt-foot">
        <CopyPrompt text={prompt.text} copy={copy} label={`Copy prompt: ${plainText(prompt.text)}`} />
      </div>
    </article>
  );
}

export function PromptsView({ copy, onTemplates }: { copy: Copier; onTemplates: () => void }) {
  return (
    <section id="prompts" className="home-section" data-testid="prompts-view">
      <div className="home-heading">
        <p className="eyebrow quiet">Prompts</p>
        <h1>Things to ask Claude</h1>
        <p className="home-summary">
          Copy one, paste it into Claude Code in your demos folder, and change the <mark className="prompt-ph">highlighted</mark> parts first.
        </p>
      </div>
      {PROMPT_GROUPS.map((group) => (
        <section key={group.id} className="prompt-group" aria-labelledby={`prompts-${group.id}`}>
          <div className="section-bar">
            <h2 id={`prompts-${group.id}`}>{group.title}</h2>
            <p className="section-note">{group.note}</p>
          </div>
          <div className="prompt-grid">
            {group.prompts.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} copy={copy} />)}
            {group.id === 'templates' && (
              <article className="prompt-card prompt-pointer">
                <p className="prompt-pointer-title">Copy the look of a video you like</p>
                <p className="prompt-what">The prompt that makes a new template, and every template you have, are in the Templates menu.</p>
                <div className="prompt-foot">
                  <button className="btn" onClick={onTemplates}><LayoutTemplate size={14} />Open Templates</button>
                </div>
              </article>
            )}
          </div>
        </section>
      ))}
    </section>
  );
}
