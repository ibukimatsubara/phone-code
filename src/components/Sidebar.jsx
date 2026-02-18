import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({
  open,
  sessions,
  allPanes,
  currentSession,
  currentPane,
  onFetchPanes,
  onSelectPane,
  onClose,
}) {
  const [expandedSessions, setExpandedSessions] = useState(new Set());

  const toggleExpand = (sessionName) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionName)) {
        next.delete(sessionName);
      } else {
        next.add(sessionName);
        // Fetch panes when expanding
        if (!allPanes[sessionName]) {
          onFetchPanes(sessionName);
        }
      }
      return next;
    });
  };

  const isExpanded = (name) => expandedSessions.has(name);

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <div className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">Sessions</div>

        <div className="sidebar-list">
          {sessions.map((session) => {
            const panes = allPanes[session.name] || [];
            const expanded = isExpanded(session.name);

            return (
              <div key={session.name} className="session-group">
                <button
                  className={`session-item ${session.name === currentSession ? 'active' : ''}`}
                  onClick={() => toggleExpand(session.name)}
                >
                  <span className="expand-icon">
                    {expanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <span className="session-label">{session.name}</span>
                  {session.attached && <span className="attached-badge">attached</span>}
                </button>

                {expanded &&
                  panes.map((pane) => {
                    const isActive =
                      session.name === currentSession && pane.target === currentPane;
                    return (
                      <button
                        key={pane.target}
                        className={`pane-item ${isActive ? 'active' : ''}`}
                        onClick={() => onSelectPane(session.name, pane.target)}
                      >
                        <span className="pane-indicator">
                          {isActive ? '\u2726' : '\u2022'}
                        </span>
                        <span className="pane-label">pane:{pane.target}</span>
                        <span className="pane-command">{pane.command}</span>
                      </button>
                    );
                  })}
              </div>
            );
          })}

          {sessions.length === 0 && (
            <div className="sidebar-empty">No tmux sessions found</div>
          )}
        </div>
      </div>
    </>
  );
}
