import { useState, useCallback, useEffect, useRef } from 'react';
import useWebSocket from './hooks/useWebSocket';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import Terminal from './components/Terminal';
import InputBar from './components/InputBar';
import './App.css';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [panes, setPanes] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [currentPane, setCurrentPane] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('');

  const currentSessionRef = useRef(currentSession);
  const currentPaneRef = useRef(currentPane);
  currentSessionRef.current = currentSession;
  currentPaneRef.current = currentPane;

  const { send, connected } = useWebSocket({
    onMessage: (msg) => {
      switch (msg.type) {
        case 'sessions':
          setSessions(msg.data);
          break;
        case 'panes':
          setPanes(msg.data);
          break;
        case 'output':
          setTerminalOutput(msg.data);
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

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !currentSession) {
      selectSession(sessions[0].name);
    }
  }, [sessions]);

  // Auto-select first pane
  useEffect(() => {
    if (panes.length > 0 && !currentPane) {
      selectPane(panes[0].target);
    }
  }, [panes]);

  const selectSession = useCallback(
    (sessionName) => {
      setCurrentSession(sessionName);
      setCurrentPane(null);
      setPanes([]);
      setTerminalOutput('');
      send({ type: 'panes', session: sessionName });
    },
    [send]
  );

  const selectPane = useCallback(
    (paneTarget) => {
      setCurrentPane(paneTarget);
      setTerminalOutput('');
      const session = currentSessionRef.current;
      if (session) {
        send({ type: 'subscribe', target: `${session}:${paneTarget}` });
      }
    },
    [send]
  );

  const handleInput = useCallback(
    (text) => {
      const session = currentSessionRef.current;
      const pane = currentPaneRef.current;
      if (session && pane) {
        send({ type: 'input', target: `${session}:${pane}`, data: text });
      }
    },
    [send]
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

      const currentIndex = panes.findIndex((p) => p.target === currentPaneRef.current);
      if (currentIndex === -1) return;

      if (dx < 0 && currentIndex < panes.length - 1) {
        selectPane(panes[currentIndex + 1].target);
      } else if (dx > 0 && currentIndex > 0) {
        selectPane(panes[currentIndex - 1].target);
      }
    },
    [panes, selectPane]
  );

  return (
    <div className="app">
      <header className="header">
        <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          ☰
        </button>
        <span className="session-name">{currentSession || 'phone-code'}</span>
        <span className={`status ${connected ? 'on' : 'off'}`}>
          {connected ? '\u25CF' : '\u25CB'}
        </span>
      </header>

      <Sidebar
        open={sidebarOpen}
        sessions={sessions}
        currentSession={currentSession}
        panes={panes}
        currentPane={currentPane}
        onSelectSession={(s) => {
          selectSession(s);
          setSidebarOpen(false);
        }}
        onSelectPane={(p) => {
          selectPane(p);
          setSidebarOpen(false);
        }}
        onClose={() => setSidebarOpen(false)}
      />

      <TabBar panes={panes} currentPane={currentPane} onSelectPane={selectPane} />

      <div
        className="terminal-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Terminal output={terminalOutput} onData={handleTerminalData} />
      </div>

      <InputBar onSubmit={handleInput} onSpecialKey={handleSpecialKey} />
    </div>
  );
}
