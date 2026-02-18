import './TabBar.css';

export default function TabBar({ panes, currentPane, onSelectPane }) {
  if (panes.length <= 1) return null;

  return (
    <div className="tab-bar">
      {panes.map((pane) => (
        <button
          key={pane.target}
          className={`tab ${pane.target === currentPane ? 'active' : ''}`}
          onClick={() => onSelectPane(pane.target)}
        >
          <span className="tab-label">
            {pane.target === currentPane && '\u2726 '}
            pane:{pane.target}
          </span>
          <span className="tab-command">{pane.command}</span>
        </button>
      ))}
    </div>
  );
}
