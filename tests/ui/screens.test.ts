// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFinishPanel } from '../../src/ui/finish-panel.ts';
import { createStartScreen } from '../../src/ui/start-screen.ts';

afterEach(() => {
  document.body.replaceChildren();
});

describe('start → race → finish flow', () => {
  it('fires onRace from the start screen and onRaceAgain from the finish panel', () => {
    const events: string[] = [];
    const start = createStartScreen(document.body, { onRace: () => events.push('race') });
    const finish = createFinishPanel(document.body, { onRaceAgain: () => events.push('again') });

    start.show();
    expect(start.element.hidden).toBe(false);
    expect(finish.element.hidden).toBe(true);
    const race = start.element.querySelector('button');
    expect(race?.textContent).toBe('Race');
    race?.click();
    expect(events).toEqual(['race']);

    start.hide();
    finish.show({ timeMs: 134800, bestLapMs: 40370 });
    expect(finish.element.hidden).toBe(false);
    expect(finish.element.textContent).toContain('Finished');
    expect(finish.element.textContent).toContain('2:14.80');
    expect(finish.element.textContent).toContain('0:40.37');
    const again = finish.element.querySelector('button');
    expect(again?.textContent).toBe('Race again');
    again?.click();
    expect(events).toEqual(['race', 'again']);
  });

  it('start screen has a navy ground class, display title and a primary RACE button', () => {
    const start = createStartScreen(document.body, { onRace: vi.fn(), subtitle: 'Dust Bowl · 3 laps' });
    start.show();
    expect(start.element.classList.contains('ui-start')).toBe(true);
    expect(start.element.querySelector('h1')?.textContent).toBe('DailyAI Racer');
    const race = start.element.querySelector('button');
    expect(race?.classList.contains('ui-button--primary')).toBe(true);
    expect(document.activeElement).toBe(race);
    expect(start.element.textContent).toContain('Dust Bowl · 3 laps');
  });

  it('finish panel shows dashes when there is no best lap', () => {
    const finish = createFinishPanel(document.body, { onRaceAgain: vi.fn() });
    finish.show({ timeMs: 60000, bestLapMs: null });
    expect(finish.element.textContent).toContain('–:––.––');
    expect(finish.element.querySelector('.ui-hatch pattern')).not.toBeNull();
  });
});
