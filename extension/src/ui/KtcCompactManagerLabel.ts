/**
 * Shared Primary/sidebar manager label rule.
 *
 * The primary and secondary text stay in one inline flow. Only the outer label
 * owns overflow and ellipsis, so a row can never render two shortened segments.
 */
export const KtcCompactManagerLabelStyle = `
  .ktc-compact-label { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ktc-compact-label-primary { font-weight: 650; }
  .ktc-compact-label-secondary { color: var(--vscode-descriptionForeground); font-size: 11px; }
`;
