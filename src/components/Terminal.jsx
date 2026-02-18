import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 5;

export default function Terminal({ output, onData, paneCols }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const terminal = new XTerm({
      cursorBlink: false,
      cursorStyle: 'block',
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: "'Menlo', 'Courier New', monospace",
      lineHeight: 1.15,
      scrollback: 0,
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: 'rgba(78, 204, 163, 0.3)',
        black: '#1a1a2e',
        red: '#e74c3c',
        green: '#4ecca3',
        yellow: '#f1c40f',
        blue: '#3498db',
        magenta: '#9b59b6',
        cyan: '#1abc9c',
        white: '#e0e0e0',
        brightBlack: '#576574',
        brightRed: '#ff6b6b',
        brightGreen: '#6edb99',
        brightYellow: '#feca57',
        brightBlue: '#54a0ff',
        brightMagenta: '#c39bd3',
        brightCyan: '#48dbfb',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminal.onData((data) => onDataRef.current(data));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      requestAnimationFrame(() => fitAddon.fit());
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  // Adjust font size to match pane column width
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !paneCols) return;

    // Start with default font size
    terminal.options.fontSize = DEFAULT_FONT_SIZE;
    fitAddon.fit();

    // If terminal cols is less than pane cols, shrink font to fit
    if (terminal.cols < paneCols) {
      const ratio = terminal.cols / paneCols;
      const newFontSize = Math.max(MIN_FONT_SIZE, Math.floor(DEFAULT_FONT_SIZE * ratio));
      terminal.options.fontSize = newFontSize;
      fitAddon.fit();

      // Fine-tune: if still too few cols, shrink one more
      if (terminal.cols < paneCols && newFontSize > MIN_FONT_SIZE) {
        terminal.options.fontSize = newFontSize - 1;
        fitAddon.fit();
      }
    }
  }, [paneCols]);

  // Update terminal content when output changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !output) return;

    terminal.write('\x1b[2J\x1b[H' + output);
  }, [output]);

  return <div ref={containerRef} className="terminal-container" />;
}
