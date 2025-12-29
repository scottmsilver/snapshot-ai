import React, { useRef, useEffect, useState } from 'react';
import { marked } from 'marked';
import { useAIProgress } from '@/contexts/AIProgressContext';
import type { AIProgressStep, AILogEntry } from '@/types/aiProgress';
import { Brain, Zap, Cog, CheckCircle, AlertCircle, RefreshCw, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';

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
        borderBottom: '1px solid #3a3a3a',
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
        <div style={{ color: '#aaa', fontSize: '12px', marginTop: '4px', paddingLeft: '20px' }}>
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
            borderLeft: '2px solid #4a4a4a',
            marginLeft: '6px',
          }}
        >
          <MarkdownContent content={entry.thinkingText!} />
        </div>
      )}
    </div>
  );
};

/**
 * AIProgressPanel displays a console-style log of all AI operations
 */
export const AIProgressPanel: React.FC = () => {
  const { state, clearLog } = useAIProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.log, isMinimized]);

  // Show panel when new activity starts
  useEffect(() => {
    if (state.step !== 'idle') {
      setIsDismissed(false);
    }
  }, [state.step]);

  const isActive = state.step !== 'idle' && state.step !== 'complete' && state.step !== 'error';

  // Don't render if dismissed and no activity
  if (isDismissed && !isActive) {
    return null;
  }

  // Don't render if no log entries and idle
  if (state.log.length === 0 && !isActive) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: isMinimized ? '200px' : '400px',
        minWidth: isMinimized ? '200px' : '400px',
        maxWidth: isMinimized ? '200px' : '400px',
        height: isMinimized ? 'auto' : '300px',
        minHeight: isMinimized ? 'auto' : '300px',
        maxHeight: isMinimized ? 'auto' : '300px',
        backgroundColor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid rgba(200, 200, 200, 0.4)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: isMinimized ? 'none' : '1px solid rgba(200, 200, 200, 0.3)',
          backgroundColor: 'rgba(245, 245, 245, 0.5)',
          borderRadius: isMinimized ? '8px' : '8px 8px 0 0',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isActive ? '#27ae60' : '#666',
              animation: isActive ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
            AI Console
          </span>
          {isActive && (
            <span style={{ color: '#888', fontSize: '11px' }}>
              {formatDuration(state.elapsedMs)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isMinimized && state.log.length > 0 && (
            <button
              onClick={clearLog}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
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
            onClick={() => setIsMinimized(!isMinimized)}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {!isActive && (
            <button
              onClick={() => {
                clearLog();
                setIsDismissed(true);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close console"
            >
              <X size={14} />
            </button>
          )}
        </div>
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
          {state.log.length === 0 ? (
            <div style={{ color: '#666', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
              No AI activity yet
            </div>
          ) : (
            state.log.map((entry, index) => (
              <LogEntryComponent 
                key={entry.id} 
                entry={entry} 
                isLatest={index === state.log.length - 1}
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
            color: #fff;
            margin: 8px 0 4px 0;
            font-size: 13px;
          }
          
          .markdown-content p {
            margin: 4px 0;
          }
          
          .markdown-content code {
            background: #3a3a3a;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px;
          }
          
          .markdown-content pre {
            background: #2a2a2a;
            padding: 8px;
            border-radius: 4px;
            overflow-x: hidden;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            word-break: break-word;
            margin: 8px 0;
          }
          
          .markdown-content pre code {
            background: none;
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
          }
          
          .markdown-content a {
            color: #4a90e2;
          }
          
          .markdown-content blockquote {
            border-left: 2px solid #4a4a4a;
            margin: 8px 0;
            padding-left: 12px;
            color: #888;
          }
          
          .markdown-content img {
            max-width: 100%;
            max-height: 150px;
            object-fit: contain;
            border-radius: 4px;
            border: 1px solid #4a4a4a;
            margin: 8px 0;
            display: block;
            background: #2a2a2a;
          }
        `}
      </style>
    </div>
  );
};
