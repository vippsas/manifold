/** Board-view styling. Token-only + `color-mix` for status-tinted surfaces, so it tracks every theme. */
export const PANEL_CSS = `
  .wt-root { height:100%; overflow:auto; box-sizing:border-box; padding:var(--space-md) var(--space-lg) 48px;
    font-family:var(--font-sans); font-size:var(--type-ui-small); color:var(--text-secondary); }

  /* KPI tiles. auto-fit rather than a fixed 4: the panel is no longer only the
     full-window Dashboard card — the activity rail opens it in a half-width dock
     pane, where four fixed columns overflow instead of wrapping. */
  .wt-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(132px,1fr)); gap:var(--space-sm); }
  .wt-kpi { position:relative; overflow:hidden; background:var(--bg-elevated); border:1px solid var(--border);
    border-radius:var(--radius-lg); padding:var(--space-md); box-shadow:var(--shadow-subtle); }
  .wt-kpi .v { font-size:28px; font-weight:680; line-height:1; letter-spacing:-.02em; color:var(--text-primary);
    font-variant-numeric:tabular-nums; }
  .wt-kpi .l { margin-top:6px; font-size:var(--type-ui-caption); color:var(--text-secondary);
    display:flex; align-items:center; gap:6px; }
  .wt-kpi .glow { position:absolute; right:-28px; top:-28px; width:84px; height:84px; border-radius:50%;
    filter:blur(24px); opacity:.4; pointer-events:none; }
  .wt-kpi .dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
  .wt-kpi.active .v { color:var(--status-running); } .wt-kpi.active .glow { background:var(--status-running); }
  .wt-kpi.idle .glow { background:var(--text-muted); }
  .wt-kpi.dirty .v { color:var(--status-waiting); } .wt-kpi.dirty .glow { background:var(--status-waiting); }
  .wt-kpi.prune .v { color:var(--status-error); } .wt-kpi.prune .glow { background:var(--status-error); }

  /* Board columns */
  .wt-board { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:var(--space-md);
    margin-top:var(--space-lg); align-items:start; }
  /* min-width:0 — a grid item's auto minimum is its content, so the long mono
     branch names would otherwise push the columns wider than the pane. */
  .wt-col { min-width:0; background:color-mix(in srgb, var(--text-primary) 2%, transparent); border:1px solid var(--divider);
    border-radius:var(--radius-lg); padding:var(--space-sm); }
  .wt-colhead { display:flex; align-items:center; gap:var(--space-sm); padding:2px 4px var(--space-sm); }
  .wt-colhead .ct { margin-left:auto; font-size:var(--type-ui-caption); color:var(--text-muted);
    background:var(--bg-elevated); border:1px solid var(--border); padding:1px 8px; border-radius:var(--radius-pill);
    font-variant-numeric:tabular-nums; }
  .wt-colempty { padding:12px 6px; color:var(--text-muted); font-size:var(--type-ui-caption); }

  /* Mini card (one worktree) */
  .wt-mini { background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--radius-md);
    padding:10px 11px; margin-bottom:var(--space-sm); transition:transform 150ms ease, border-color 150ms ease; }
  .wt-mini:hover { transform:translateY(-1px); border-color:color-mix(in srgb, var(--text-primary) 14%, var(--border)); }
  .wt-mini.focus { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent-subtle); }
  .wt-mini .r { font-size:var(--type-ui-micro); color:var(--text-muted); margin-bottom:6px;
    display:flex; align-items:center; gap:6px; }
  .wt-mini .r .d { width:5px; height:5px; border-radius:50%; background:var(--text-muted); flex:0 0 auto; }
  .wt-mini .mf { display:flex; align-items:center; gap:var(--space-sm); margin-top:9px; }

  /* Status pills (column headers) */
  .wt-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:var(--radius-pill);
    font-size:var(--type-ui-caption); font-weight:600; text-transform:capitalize; }
  .wt-pill .d { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
  .wt-pill.active { color:var(--status-running); background:color-mix(in srgb, var(--status-running) 15%, transparent); }
  .wt-pill.active .d { background:var(--status-running); box-shadow:0 0 7px var(--status-running); }
  .wt-pill.idle { color:var(--text-secondary); background:color-mix(in srgb, var(--text-primary) 8%, transparent); }
  .wt-pill.idle .d { background:var(--text-muted); }
  .wt-pill.stale { color:var(--status-error); background:color-mix(in srgb, var(--status-error) 14%, transparent); }
  .wt-pill.stale .d { background:var(--status-error); }

  /* Branch label */
  .wt-branch { font-family:var(--font-mono); font-size:var(--type-ui-small); color:var(--text-primary);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; }
  .wt-branch .ns { color:var(--text-muted); }

  /* Diff stat (ahead/behind) */
  .wt-diff { display:inline-flex; align-items:center; gap:7px; font-family:var(--font-mono);
    font-size:var(--type-ui-caption); font-variant-numeric:tabular-nums; }
  .wt-diff .a { color:var(--status-done); } .wt-diff .b { color:var(--status-error); } .wt-diff .z { color:var(--text-muted); }
  .wt-bars { display:inline-flex; gap:2px; align-items:flex-end; }
  .wt-bars i { width:3px; border-radius:2px; display:block; }
  .wt-bars i.a { background:var(--status-done); } .wt-bars i.b { background:var(--status-error); }

  /* dirty/clean chips + lock */
  .wt-chip { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:var(--radius-pill);
    font-size:var(--type-ui-caption); font-weight:550; }
  .wt-chip.dirty { color:var(--status-waiting); background:color-mix(in srgb, var(--status-waiting) 15%, transparent); }
  .wt-chip.clean { color:var(--text-muted); border:1px solid var(--border); }
  .wt-lock { margin-left:auto; color:var(--status-waiting); opacity:.85; font-size:var(--type-ui-caption); }

  /* Prune column rows */
  .wt-prunerow { border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:6px; overflow:hidden;
    background:var(--bg-elevated); }
  .wt-prunehead { display:flex; align-items:center; gap:8px; padding:9px 11px; cursor:pointer; user-select:none;
    transition:background 150ms ease; }
  .wt-prunehead:hover { background:var(--list-hover-bg); }
  .wt-prunehead .caret { color:var(--text-muted); font-size:9px; transition:transform 100ms ease; flex:0 0 auto; }
  .wt-prunehead.open .caret { transform:rotate(90deg); }
  .wt-prunehead .nm { flex:1; min-width:0; color:var(--text-primary); font-weight:550; font-size:var(--type-ui-small);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wt-prunehead .n { min-width:22px; height:20px; padding:0 6px; display:inline-grid; place-items:center; flex:0 0 auto;
    background:color-mix(in srgb, var(--text-primary) 8%, transparent); color:var(--text-primary);
    font-size:var(--type-ui-caption); font-weight:650; border-radius:var(--radius-pill); font-variant-numeric:tabular-nums; }
  .wt-pruneall { opacity:0; appearance:none; cursor:pointer; font:inherit; font-size:var(--type-ui-micro); font-weight:600;
    padding:3px 8px; border-radius:var(--radius-sm); color:var(--status-error);
    border:1px solid color-mix(in srgb, var(--status-error) 30%, transparent);
    background:color-mix(in srgb, var(--status-error) 13%, transparent);
    transition:opacity 150ms ease, background 150ms ease; }
  .wt-prunehead:hover .wt-pruneall { opacity:1; }
  .wt-pruneall:hover { background:color-mix(in srgb, var(--status-error) 22%, transparent); }
  .wt-prunelist { border-top:1px solid var(--divider); padding:4px 0; }
  .wt-branchrow { display:flex; align-items:center; gap:8px; padding:5px 11px 5px 26px; font-family:var(--font-mono);
    color:var(--text-muted); font-size:var(--type-ui-caption); transition:background 150ms ease; }
  .wt-branchrow:hover { background:var(--list-hover-bg); }
  .wt-branchrow .bn { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wt-branchrow .ago { color:var(--text-muted); font-family:var(--font-sans); flex:0 0 auto; }
  .wt-del { opacity:0; appearance:none; background:transparent; border:none; color:var(--text-muted); cursor:pointer;
    padding:0 2px; font-size:var(--type-ui-small); line-height:1; flex:0 0 auto;
    transition:opacity 150ms ease, color 150ms ease; }
  .wt-branchrow:hover .wt-del { opacity:1; }
  .wt-del:hover { color:var(--status-error); }

  .wt-empty { padding:var(--space-xl); color:var(--text-muted); text-align:center; }
`
