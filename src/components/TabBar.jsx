import './TabBar.css';

export default function TabBar({ panes, currentPane, paneStatuses, onSelectPane }) {
  if (panes.length <= 1) return null;

  return (
    <div className="tab-bar">
      {panes.map((pane) => {
        const status = paneStatuses?.[pane.target];
        return (
          <button
            key={pane.target}
            className={`tab ${pane.target === currentPane ? 'active' : ''}`}
            onClick={() => onSelectPane(pane.target)}
          >
            <span className="tab-label">
              {status && status !== 'unknown' && (
                <span className={`tab-status ${status}`} />
              )}
              pane:{pane.target}
            </span>
            <span className="tab-command">{pane.command}</span>
          </button>
        );
      })}
    </div>
  );
}
