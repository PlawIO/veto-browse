/**
 * Shared Veto-branded style helpers for options pages.
 * Replaces all the isDarkMode ternary spaghetti with centralized tokens.
 */

export function v(isDarkMode: boolean) {
  return {
    bg: isDarkMode ? '#080808' : '#f5f5f5',
    surface: isDarkMode ? '#0d0d0d' : '#ffffff',
    elevated: isDarkMode ? '#1a1a1a' : '#f2f2f2',
    muted: isDarkMode ? '#0d0d0d' : '#f2f2f2',
    text: isDarkMode ? '#fafafa' : '#080808',
    textSecondary: isDarkMode ? '#b8b8b8' : '#525252',
    textMuted: isDarkMode ? '#737373' : '#737373',
    accent: '#F97316',
    accentHover: '#ea6a0e',
    border: isDarkMode ? '#1f1f1f' : '#e5e5e5',
    borderStrong: isDarkMode ? '#2e2e2e' : '#cccccc',
    inputBg: isDarkMode ? '#1a1a1a' : '#f5f5f5',
    success: isDarkMode ? '#6EE7A0' : '#16A34A',
    danger: isDarkMode ? '#F5A3A3' : '#DC2626',
    warning: isDarkMode ? '#FCD28D' : '#F59E0B',
  };
}

/** Card container style */
export function cardStyle(isDarkMode: boolean): React.CSSProperties {
  const t = v(isDarkMode);
  return { backgroundColor: t.surface, border: `1px solid ${t.border}`, padding: '24px' };
}

/** Input field style */
export function inputStyle(isDarkMode: boolean, width?: string): React.CSSProperties {
  const t = v(isDarkMode);
  return {
    backgroundColor: t.inputBg,
    border: `1px solid ${t.border}`,
    color: t.text,
    outline: 'none',
    ...(width ? { width } : {}),
  };
}

/** Toggle switch — returns style for the track */
export function toggleTrackStyle(checked: boolean, isDarkMode: boolean): React.CSSProperties {
  const t = v(isDarkMode);
  return { backgroundColor: checked ? t.accent : isDarkMode ? '#2e2e2e' : '#cccccc' };
}
