import { describe, it, expect } from 'vitest';
import { TABS, TAB_ICONS } from '../shared/config/tabs';
import type { TabConfig, TabType } from '../shared/types/types';

describe('Tab Configuration', () => {
  it('should have 8 tabs defined', () => {
    expect(TABS).toHaveLength(8);
  });

  it('should have all required tab IDs', () => {
    const ids = TABS.map((t: TabConfig) => t.id);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('browsers');
    expect(ids).toContain('tools');
    expect(ids).toContain('history');
    expect(ids).toContain('notifications');
    expect(ids).toContain('online');
    expect(ids).toContain('chat');
  });

  it('should have navLabel, title, and subtitle for each tab', () => {
    TABS.forEach((tab: TabConfig) => {
      expect(tab.navLabel).toBeTruthy();
      expect(tab.title).toBeTruthy();
      expect(tab.subtitle).toBeTruthy();
    });
  });

  it('should have unique tab IDs', () => {
    const ids = TABS.map((t: TabConfig) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should have an icon for each tab type', () => {
    const tabTypes: TabType[] = ['dashboard', 'browsers', 'tools', 'history', 'notifications', 'chat'];
    tabTypes.forEach(type => {
      expect(TAB_ICONS[type]).toBeDefined();
    });
  });

  it('TAB_ICONS should have same keys as tab IDs', () => {
    const tabIds = TABS.map((t: TabConfig) => t.id);
    const iconKeys = Object.keys(TAB_ICONS);
    expect(iconKeys.sort()).toEqual(tabIds.sort());
  });

  it('should keep mobile bar order and labels', () => {
    expect(TABS.map((t: TabConfig) => [t.id, t.mobileLabel ?? t.navLabel])).toEqual([
      ['dashboard', 'Início'],
      ['browsers', 'Web'],
      ['history', 'Logs'],
      ['tools', 'Ferr.'],
      ['notifications', 'Cham.'],
      ['online', 'Online'],
      ['chat', 'Chat'],
      ['settings', 'Config'],
    ]);
  });
});
