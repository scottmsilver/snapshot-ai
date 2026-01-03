import React, { useRef, useEffect, useState, useCallback } from 'react';
import { marked } from 'marked';
import { useAIProgress } from '@/contexts/AIProgressContext';
import { aiLogService, type AILogState } from '@/services/aiLogService';
import { useCoordinateHighlightOptional } from '@/contexts/CoordinateHighlightContext';
import type { AIProgressStep, AILogEntry } from '@/types/aiProgress';
import { Brain, Zap, Cog, CheckCircle, AlertCircle, RefreshCw, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Bug, Copy, Check } from 'lucide-react';
import { EditRegionDebugOverlay } from './EditRegionDebugOverlay';

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
 * Pre-process markdown to wrap coordinates in spans with data attributes
 * This allows us to use event delegation to detect hovers
 */
const wrapCoordinatesInHtml = (html: string): string => {
  // Match patterns like (123, 456) or (123,456) but NOT inside base64 data or URLs
  // We look for coordinates that are surrounded by word boundaries or common punctuation
  return html.replace(
    /(?<![A-Za-z0-9+/=])(\((\d{1,5}),\s*(\d{1,5})\))(?![A-Za-z0-9+/=])/g,
    (match, full, x, y) => {
      return `<span class="coord-highlight" data-x="${x}" data-y="${y}" style="cursor:pointer;background:rgba(33,150,243,0.15);border-radius:3px;padding:0 2px;font-family:monospace;color:#1976d2;border-bottom:1px dashed #1976d2;">${full}</span>`;
    }
  );
};

/**
 * Render markdown content safely with interactive coordinates
 */
const MarkdownContent: React.FC<{
  content: string;
}> = ({ content }) => {
  const coordContext = useCoordinateHighlightOptional();
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse markdown and wrap coordinates
  const html = marked.parse(content) as string;
  const processedHtml = wrapCoordinatesInHtml(html);

  // Handle mouse events on coordinate spans via event delegation
  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('coord-highlight')) {
      const x = parseInt(target.dataset.x || '0', 10);
      const y = parseInt(target.dataset.y || '0', 10);
      coordContext?.setHighlightedCoord({ x, y });
    }
  }, [coordContext]);

  const handleMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('coord-highlight')) {
      coordContext?.setHighlightedCoord(null);
    }
  }, [coordContext]);

  return (
    <div
      ref={containerRef}
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: processedHtml }}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
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
const LogEntryComponent: React.FC<{
  entry: AILogEntry;
  isLatest: boolean;
  onShowDebug?: (debugData: AILogEntry['debugData']) => void;
}> = ({ entry, isLatest, onShowDebug }) => {
  const [expanded, setExpanded] = useState(isLatest);
  const stepConfig = STEP_CONFIG[entry.step];
  const hasThinking = entry.thinkingText && entry.thinkingText.trim().length > 0;
  const hasDebugData = !!entry.debugData;

  // Debug: log when we have debug data
  useEffect(() => {
    if (hasDebugData) {
      console.log('📊 LogEntryComponent: Entry has debugData', entry.id, 'regions:', entry.debugData?.editRegions?.length);
    }
  }, [hasDebugData, entry.id, entry.debugData]);

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
        {hasDebugData && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowDebug?.(entry.debugData);
            }}
            style={{
              background: 'none',
              border: '1px solid #FF6B00',
              color: '#FF6B00',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              marginLeft: entry.durationMs ? '8px' : 'auto',
            }}
            title="View edit regions debug overlay"
          >
            <Bug size={10} />
            Debug
          </button>
        )}
        {hasThinking && (
          <span style={{ color: '#666', marginLeft: hasThinking && !entry.durationMs && !hasDebugData ? 'auto' : '8px' }}>
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

      {/* Iteration image preview */}
      {entry.iterationImage && expanded && (
        <div
          style={{
            marginTop: '8px',
            paddingLeft: '20px',
            marginLeft: '6px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: '500',
              color: '#666',
              marginBottom: '4px',
            }}
          >
            Generated Image:
          </div>
          <img
            src={entry.iterationImage}
            alt="Generated iteration"
            style={{
              maxWidth: '100%',
              maxHeight: '200px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              objectFit: 'contain',
            }}
          />
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
  const [debugData, setDebugData] = useState<AILogEntry['debugData'] | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Copy log content to clipboard
  const handleCopyLog = useCallback(() => {
    // Build plain text representation of the log
    const logText = mergedLog.map(entry => {
      const lines: string[] = [];
      const stepConfig = STEP_CONFIG[entry.step];

      // Header line
      lines.push(`[${formatTime(entry.timestamp)}] ${stepConfig.label}${entry.iteration ? ` [${entry.iteration.current}/${entry.iteration.max}]` : ''}${entry.durationMs ? ` (${formatDuration(entry.durationMs)})` : ''}`);

      // Message
      if (entry.message) {
        lines.push(`  ${entry.message}`);
      }

      // Error
      if (entry.error) {
        lines.push(`  ERROR: ${entry.error.message}`);
        if (entry.error.details) {
          lines.push(`  ${entry.error.details}`);
        }
      }

      // Thinking text - strip markdown and excessive whitespace
      if (entry.thinkingText) {
        // Strip images (base64 data) but keep the alt text
        const stripped = entry.thinkingText
          .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[Image: $1]') // Replace images with placeholder
          .replace(/```[\s\S]*?```/g, (match) => match) // Keep code blocks
          .trim();
        if (stripped) {
          lines.push('');
          lines.push(stripped);
        }
      }

      return lines.join('\n');
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy log:', err);
    });
  }, [mergedLog]);

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
    <>
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
                <>
                  <button
                    onClick={handleCopyLog}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copied ? '#27ae60' : '#888',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={copied ? 'Copied!' : 'Copy log to clipboard'}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
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
                </>
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
                onShowDebug={setDebugData}
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

    {/* Debug overlay - rendered outside aside so it's not constrained */}
    {debugData && (
      <EditRegionDebugOverlay
        debugData={debugData}
        onClose={() => setDebugData(null)}
      />
    )}
    </>
  );
};
