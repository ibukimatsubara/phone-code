import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({
  open,
  sessions,
  currentSession,
  panes,
  currentPane,
  onSelectSession,
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
      }
      return next;
    });
  };

  // Auto-expand current session
  const isExpanded = (name) =>
    expandedSessions.has(name) || name === currentSession;

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <div className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">Sessions</div>

        <div className="sidebar-list">
          {sessions.map((session) => (
            <div key={session.name} className="session-group">
              <button
                className={`session-item ${session.name === currentSession ? 'active' : ''}`}
                onClick={() => {
                  if (session.name === currentSession) {
                    toggleExpand(session.name);
                  } else {
                    onSelectSession(session.name);
                  }
                }}
              >
                <span className="expand-icon">
                  {isExpanded(session.name) ? '\u25BC' : '\u25B6'}
                </span>
                <span className="session-label">{session.name}</span>
                {session.attached && <span className="attached-badge">attached</span>}
              </button>

              {isExpanded(session.name) &&
                session.name === currentSession &&
                panes.map((pane) => (
                  <button
                    key={pane.target}
                    className={`pane-item ${pane.target === currentPane ? 'active' : ''}`}
                    onClick={() => onSelectPane(pane.target)}
                  >
                    <span className="pane-indicator">
                      {pane.target === currentPane ? '\u2726' : '\u2022'}
                    </span>
                    <span className="pane-label">
                      pane:{pane.target}
                    </span>
                    <span className="pane-command">{pane.command}</span>
                  </button>
                ))}
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="sidebar-empty">No tmux sessions found</div>
          )}
        </div>
      </div>
    </>
  );
}
