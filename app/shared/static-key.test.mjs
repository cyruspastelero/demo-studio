import { describe, expect, it } from 'vitest';
import { staticKey } from './static-key.mjs';

describe('staticKey', () => {
  it('keeps media and template previews at their own path', () => {
    expect(staticKey('/media/recordings/raw/01-add-todos-t1.mp4')).toBe('media/recordings/raw/01-add-todos-t1.mp4');
    expect(staticKey('/api/template-preview/built-in/house/01.png')).toBe('api/template-preview/built-in/house/01.png');
  });
  it('gives API reads a .json file and thumbnails a .jpg, with the query folded into the name', () => {
    expect(staticKey('/api/session')).toBe('api/session.json');
    expect(staticKey('/api/thumb?path=a%2Fb.mp4&t=1.00&w=160')).toBe('api/thumb__path_a_2Fb.mp4_t_1.00_w_160.jpg');
  });
  it('cannot climb out of the data folder', () => {
    expect(staticKey('/api/thumb?path=..%2F..%2Fx')).not.toContain('/..');
  });
});
