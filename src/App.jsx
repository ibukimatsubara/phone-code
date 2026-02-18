import { useState, useCallback, useEffect, useRef } from 'react';
import useVisualViewport from './hooks/useVisualViewport';
import useWebSocket from './hooks/useWebSocket';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import Terminal from './components/Terminal';
import InputBar from './components/InputBar';
import './App.css';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [allPanes, setAllPanes] = useState({}); // { sessionName: [panes] }
  const [currentSession, setCurrentSession] = useState(null);
  const [currentPane, setCurrentPane] = useState(null);
  const [currentPaneCols, setCurrentPaneCols] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [fontSize, setFontSize] = useState(null); // null = auto-fit
  const [paneStatuses, setPaneStatuses] = useState({}); // { target: status }

  const currentSessionRef = useRef(currentSession);
  const currentPaneRef = useRef(currentPane);
  currentSessionRef.current = currentSession;
  currentPaneRef.current = currentPane;

  const currentPanes = allPanes[currentSession] || [];
  const viewportHeight = useVisualViewport();

  const { send, connected } = useWebSocket({
    onMessage: (msg) => {
      switch (msg.type) {
        case 'sessions':
          setSessions(msg.data);
          break;
        case 'panes':
          setAllPanes((prev) => ({ ...prev, [msg.session]: msg.data }));
          break;
        case 'output':
          setTerminalOutput(msg.data);
          if (msg.status) {
            setPaneStatuses((prev) => ({ ...prev, [msg.target]: msg.status }));
          }
          break;
        case 'pane_statuses':
          setPaneStatuses((prev) => ({ ...prev, ...msg.data }));
          break;
        case 'error':
          console.error('[server]', msg.message);
          break;
      }
    },
  });

  // Request sessions on connect
  useEffect(() => {
    if (connected) {
      send({ type: 'sessions' });
    }
  }, [connected, send]);

  // Auto-select first session on initial load
  useEffect(() => {
    if (sessions.length > 0 && !currentSession) {
      const name = sessions[0].name;
      setCurrentSession(name);
      send({ type: 'panes', session: name });
    }
  }, [sessions]);

  // Auto-select first pane when current session's panes arrive
  useEffect(() => {
    if (currentPanes.length > 0 && !currentPane) {
      navigateToPane(currentSession, currentPanes[0].target);
    }
  }, [currentPanes]);

  const fetchPanes = useCallback(
    (sessionName) => {
      send({ type: 'panes', session: sessionName });
    },
    [send]
  );

  const navigateToPane = useCallback(
    (sessionName, paneTarget) => {
      setCurrentSession(sessionName);
      setCurrentPane(paneTarget);
      setTerminalOutput('');
      setFontSize(null); // reset to auto-fit for new pane

      // Get pane cols from allPanes
      const paneList = allPanes[sessionName] || [];
      const pane = paneList.find((p) => p.target === paneTarget);
      if (pane) {
        const cols = parseInt(pane.size.split('x')[0], 10);
        setCurrentPaneCols(cols);
      }

      send({ type: 'subscribe', target: `${sessionName}:${paneTarget}` });
    },
    [send, allPanes]
  );

  const handleSpecialKey = useCallback(
    (key) => {
      const session = currentSessionRef.current;
      const pane = currentPaneRef.current;
      if (session && pane) {
        send({ type: 'key', target: `${session}:${pane}`, key });
      }
    },
    [send]
  );

  const handleTerminalData = useCallback(
    (data) => {
      const session = currentSessionRef.current;
      const pane = currentPaneRef.current;
      if (session && pane) {
        send({ type: 'input', target: `${session}:${pane}`, data });
      }
    },
    [send]
  );

  // Swipe handling
  const touchStartRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx)) return;

      const idx = currentPanes.findIndex((p) => p.target === currentPaneRef.current);
      if (idx === -1) return;

      if (dx < 0 && idx < currentPanes.length - 1) {
        navigateToPane(currentSessionRef.current, currentPanes[idx + 1].target);
      } else if (dx > 0 && idx > 0) {
        navigateToPane(currentSessionRef.current, currentPanes[idx - 1].target);
      }
    },
    [currentPanes, navigateToPane]
  );

  return (
    <div className="app" style={viewportHeight ? { height: viewportHeight } : undefined}>
      <header className="header">
        <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          ☰
        </button>
        <span className="session-name">{currentSession || 'phone-code'}</span>
        {currentPane && paneStatuses[currentPane] && paneStatuses[currentPane] !== 'unknown' && (
          <span className={`claude-status ${paneStatuses[currentPane]}`} />
        )}
        <span className={`status ${connected ? 'on' : 'off'}`}>
          {connected ? '\u25CF' : '\u25CB'}
        </span>
      </header>

      <Sidebar
        open={sidebarOpen}
        sessions={sessions}
        allPanes={allPanes}
        currentSession={currentSession}
        currentPane={currentPane}
        onFetchPanes={fetchPanes}
        onSelectPane={(session, pane) => {
          navigateToPane(session, pane);
          setSidebarOpen(false);
        }}
        onClose={() => setSidebarOpen(false)}
      />

      <TabBar
        panes={currentPanes}
        currentPane={currentPane}
        paneStatuses={paneStatuses}
        onSelectPane={(p) => navigateToPane(currentSession, p)}
      />

      <div
        className="terminal-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Terminal
          output={terminalOutput}
          onData={handleTerminalData}
          paneCols={currentPaneCols}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
        />
      </div>

      <InputBar
        onSpecialKey={handleSpecialKey}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />
    </div>
  );
}
