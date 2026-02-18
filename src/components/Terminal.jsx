import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 3;
const MAX_FONT_SIZE = 28;

export default function Terminal({ output, onData, paneCols, fontSize, onFontSizeChange }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const onDataRef = useRef(onData);
  const paneColsRef = useRef(paneCols);
  onDataRef.current = onData;
  paneColsRef.current = paneCols;

  useEffect(() => {
    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'block',
      fontSize: fontSize || DEFAULT_FONT_SIZE,
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

    // Pinch-to-zoom
    let lastPinchDist = 0;
    const container = containerRef.current;

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist - lastPinchDist;

        if (Math.abs(delta) > 8) {
          const current = terminal.options.fontSize || DEFAULT_FONT_SIZE;
          const next = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, current + (delta > 0 ? 1 : -1)));
          if (next !== current) {
            onFontSizeChange?.(next);
          }
          lastPinchDist = dist;
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      terminal.dispose();
    };
  }, []);

  // Apply font size changes and handle overflow
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !fontSize) return;

    terminal.options.fontSize = fontSize;
    fitAddon.fit();

    // Enable horizontal scroll if terminal is narrower than pane
    const cols = paneColsRef.current;
    const container = containerRef.current;
    const xtermEl = container?.querySelector('.xterm-screen');
    if (xtermEl && cols && terminal.cols < cols) {
      // Calculate needed width from character cell width
      const cellWidth = xtermEl.offsetWidth / terminal.cols;
      const neededWidth = Math.ceil(cellWidth * cols) + 16;
      xtermEl.style.width = neededWidth + 'px';
      xtermEl.style.minWidth = neededWidth + 'px';
      container.classList.add('overflow-x');
    } else if (xtermEl) {
      xtermEl.style.width = '';
      xtermEl.style.minWidth = '';
      container.classList.remove('overflow-x');
    }
  }, [fontSize, paneCols]);

  // Auto-fit font size on initial pane load
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !paneCols || fontSize) return;

    // Shrink font until terminal cols >= pane cols
    let size = DEFAULT_FONT_SIZE;
    while (size >= MIN_FONT_SIZE) {
      terminal.options.fontSize = size;
      fitAddon.fit();
      if (terminal.cols >= paneCols) break;
      size--;
    }
    onFontSizeChange?.(size);
  }, [paneCols]);

  // Update terminal content when output changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !output) return;

    terminal.write('\x1b[2J\x1b[H' + output);
  }, [output]);

  return <div ref={containerRef} className="terminal-container" />;
}
