import React, { useRef, useEffect, useState } from 'react';
import { marked } from 'marked';
import { useAIProgress } from '@/contexts/AIProgressContext';
import { aiLogService, type AILogState } from '@/services/aiLogService';
import type { AIProgressStep, AILogEntry } from '@/types/aiProgress';
import { Brain, Zap, Cog, CheckCircle, AlertCircle, RefreshCw, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X } from 'lucide-react';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Maps progress steps to display metadata (icon, label, color)
 */
const STEP_CONFIG: Record<AIProgressStep, { icon: React.ReactNode; label: string; color: string }> = {
  idle: { icon: null, label: 'Idle', color: '#999' },
  planning: { icon: <Brain size={14} />, label: 'Planning', color: '#9b59b6' },
  calling_api: { icon: <Zap size={14} />, label: 'Generating', color: '#4a90e2' },
  processing: { icon: <Cog size={14} />, label: 'Processing', color: '#f39c12' },
  self_checking: { icon: <CheckCircle size={14} />, label: 'Evaluating', color: '#16a085' },
  iterating: { icon: <RefreshCw size={14} />, label: 'Refining', color: '#e67e22' },
  complete: { icon: <CheckCircle size={14} />, label: 'Complete', color: '#27ae60' },
  error: { icon: <AlertCircle size={14} />, label: 'Error', color: '#e74c3c' },
};

/**
 * Format timestamp to readable time
 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

/**
 * Format duration in a human-readable format
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

/**
 * Render markdown content safely
 */
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const html = marked.parse(content) as string;
  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        fontSize: '12px',
        lineHeight: '1.5',
        color: '#1a1a1a',
        wordBreak: 'break-word',
      }}
    />
  );
};

/**
 * Single log entry component
 */
const LogEntryComponent: React.FC<{ entry: AILogEntry; isLatest: boolean }> = ({ entry, isLatest }) => {
  const [expanded, setExpanded] = useState(isLatest);
  const stepConfig = STEP_CONFIG[entry.step];
  const hasThinking = entry.thinkingText && entry.thinkingText.trim().length > 0;

  // Auto-expand latest entry when it gets content
  useEffect(() => {
    if (isLatest && hasThinking) {
      setExpanded(true);
    }
  }, [isLatest, hasThinking]);

  return (
    <div
      style={{
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        padding: '8px 0',
      }}
    >
      {/* Entry header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: hasThinking ? 'pointer' : 'default',
        }}
        onClick={() => hasThinking && setExpanded(!expanded)}
      >
        <span style={{ color: '#666', fontSize: '11px', fontFamily: 'monospace' }}>
          {formatTime(entry.timestamp)}
        </span>
        <span style={{ color: stepConfig.color, display: 'flex', alignItems: 'center' }}>
          {stepConfig.icon}
        </span>
        <span style={{ color: stepConfig.color, fontSize: '12px', fontWeight: 500 }}>
          {stepConfig.label}
        </span>
        {entry.iteration && entry.iteration.max > 0 && (
          <span style={{ color: '#888', fontSize: '11px' }}>
            [{entry.iteration.current}/{entry.iteration.max}]
          </span>
        )}
        {entry.durationMs && (
          <span style={{ color: '#888', fontSize: '11px', marginLeft: 'auto' }}>
            {formatDuration(entry.durationMs)}
          </span>
        )}
        {hasThinking && (
          <span style={{ color: '#666', marginLeft: hasThinking && !entry.durationMs ? 'auto' : '8px' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </div>

      {/* Message */}
      {entry.message && (
        <div style={{ color: '#555', fontSize: '12px', marginTop: '4px', paddingLeft: '20px' }}>
          {entry.message}
        </div>
      )}

      {/* Error details */}
      {entry.error && (
        <div style={{
          color: '#e74c3c',
          fontSize: '12px',
          marginTop: '4px',
          paddingLeft: '20px',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          padding: '8px',
          borderRadius: '4px',
        }}>
          <div style={{ fontWeight: 500 }}>{entry.error.message}</div>
          {entry.error.details && (
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
              {entry.error.details}
            </div>
          )}
        </div>
      )}

      {/* Thinking text (collapsible) */}
      {hasThinking && expanded && (
        <div
          style={{
            marginTop: '8px',
            paddingLeft: '20px',
            borderLeft: '2px solid rgba(0, 0, 0, 0.15)',
            marginLeft: '6px',
          }}
        >
          <MarkdownContent content={entry.thinkingText!} />
        </div>
      )}
    </div>
  );
};

const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 320;

/**
 * AIProgressPanel displays a console-style log of all AI operations
 * Subscribes to both the React context and the aiLogService singleton
 */
export const AIProgressPanel: React.FC = () => {
  const { state: contextState, clearLog: clearContextLog } = useAIProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  // Subscribe to aiLogService for entries from agenticService
  const [serviceLog, setServiceLog] = useState<AILogEntry[]>([]);
  const [serviceState, setServiceState] = useState<AILogState>({ step: 'idle', message: '', elapsedMs: 0, isActive: false });

  useEffect(() => {
    const unsubLog = aiLogService.subscribeToLog(setServiceLog);
    const unsubState = aiLogService.subscribeToState(setServiceState);
    return () => {
      unsubLog();
      unsubState();
    };
  }, []);

  // Merge logs from both sources, deduplicate by id, sort by timestamp
  const mergedLog = React.useMemo(() => {
    const allEntries = [...contextState.log, ...serviceLog];
    const uniqueById = new Map<string, AILogEntry>();
    for (const entry of allEntries) {
      uniqueById.set(entry.id, entry);
    }
    return Array.from(uniqueById.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [contextState.log, serviceLog]);

  // Combined state: active if either source is active
  const isActive = serviceState.isActive ||
    (contextState.step !== 'idle' && contextState.step !== 'complete' && contextState.step !== 'error');
  const elapsedMs = serviceState.isActive ? serviceState.elapsedMs : contextState.elapsedMs;

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mergedLog, isMinimized]);

  // Show panel when new activity starts
  useEffect(() => {
    if (isActive) {
      setIsDismissed(false);
    }
  }, [isActive]);

  // Resize handling
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new width based on mouse position from right edge of viewport
      const newWidth = window.innerWidth - e.clientX - 16; // 16px for padding
      setPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Clear both logs
  const handleClearLog = () => {
    clearContextLog();
    aiLogService.clearLog();
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Don't render if dismissed and no activity
  if (isDismissed && !isActive) {
    return null;
  }

  // Don't render if no log entries and idle
  if (mergedLog.length === 0 && !isActive) {
    return null;
  }

  return (
    <aside
      style={{
        width: isMinimized ? '48px' : `${panelWidth}px`,
        minWidth: isMinimized ? '48px' : `${panelWidth}px`,
        height: '100%',
        backgroundColor: '#fafafa',
        display: 'flex',
        flexDirection: 'row',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Resize handle */}
      {!isMinimized && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            width: '4px',
            height: '100%',
            cursor: 'col-resize',
            backgroundColor: isResizing ? '#2196f3' : 'transparent',
            transition: 'background-color 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!isResizing) {
              (e.target as HTMLElement).style.backgroundColor = '#e0e0e0';
            }
          }}
          onMouseLeave={(e) => {
            if (!isResizing) {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }
          }}
        />
      )}

      {/* Main panel content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderLeft: isMinimized ? 'none' : '1px solid #e0e0e0',
          backgroundColor: '#fafafa',
        }}
      >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMinimized ? 'center' : 'space-between',
          padding: isMinimized ? '12px 8px' : '12px 14px',
          borderBottom: '1px solid #eee',
          backgroundColor: '#f5f5f5',
          flexShrink: 0,
        }}
      >
        {/* Minimized: just show toggle button with indicator */}
        {isMinimized ? (
          <button
            onClick={() => setIsMinimized(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
            title="Expand AI Console"
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isActive ? '#27ae60' : '#999',
                animation: isActive ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            <ChevronLeft size={16} />
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isActive ? '#27ae60' : '#999',
                  animation: isActive ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span style={{ color: '#1a1a1a', fontSize: '13px', fontWeight: 600 }}>
                AI Console
              </span>
              {isActive && (
                <span style={{ color: '#666', fontSize: '11px' }}>
                  {formatDuration(elapsedMs)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {mergedLog.length > 0 && (
                <button
                  onClick={handleClearLog}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear log"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Collapse panel"
              >
                <ChevronRight size={14} />
              </button>
              {!isActive && (
                <button
                  onClick={() => setIsDismissed(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Hide panel"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Log entries */}
      {!isMinimized && (
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '8px 12px',
          }}
        >
          {mergedLog.length === 0 ? (
            <div style={{ color: '#666', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
              No AI activity yet
            </div>
          ) : (
            mergedLog.map((entry, index) => (
              <LogEntryComponent
                key={entry.id}
                entry={entry}
                isLatest={index === mergedLog.length - 1}
              />
            ))
          )}
        </div>
      )}

      {/* Styles */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }

          .markdown-content h1,
          .markdown-content h2,
          .markdown-content h3,
          .markdown-content h4 {
            color: #1a1a1a;
            margin: 8px 0 4px 0;
            font-size: 13px;
            font-weight: 600;
          }

          .markdown-content p {
            margin: 4px 0;
            color: #333;
          }

          .markdown-content code {
            background: rgba(0, 0, 0, 0.08);
            color: #c7254e;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px;
          }

          .markdown-content pre {
            background: rgba(0, 0, 0, 0.06);
            padding: 8px;
            border-radius: 4px;
            overflow-x: hidden;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            word-break: break-word;
            margin: 8px 0;
            border: 1px solid rgba(0, 0, 0, 0.1);
          }

          .markdown-content pre code {
            background: none;
            color: #333;
            padding: 0;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .markdown-content code {
            word-break: break-word;
          }

          .markdown-content ul,
          .markdown-content ol {
            margin: 4px 0;
            padding-left: 20px;
          }

          .markdown-content li {
            margin: 2px 0;
            color: #333;
          }

          .markdown-content a {
            color: #2196f3;
          }

          .markdown-content blockquote {
            border-left: 3px solid #2196f3;
            margin: 8px 0;
            padding-left: 12px;
            color: #555;
            background: rgba(33, 150, 243, 0.05);
            padding: 8px 12px;
            border-radius: 0 4px 4px 0;
          }

          .markdown-content img {
            max-width: 100%;
            max-height: 150px;
            object-fit: contain;
            border-radius: 4px;
            border: 1px solid rgba(0, 0, 0, 0.15);
            margin: 8px 0;
            display: block;
            background: #fafafa;
          }

          .markdown-content strong {
            color: #1a1a1a;
            font-weight: 600;
          }
        `}
      </style>
      </div>
    </aside>
  );
};
