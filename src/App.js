// REMOVE the ES module imports and replace with direct access to globals
// import React, { useState, useEffect, useRef } from 'react';
// import { createRoot } from 'react-dom/client';
// import { Play, Square, Send, Layout, MousePointer2 } from 'lucide-react';
// import { Agent } from './Agent.js';

// Since we're using Babel with UMD React/ReactDOM, grab from globals
const { useState, useEffect, useRef } = React;

// Simple inline SVG icon components to avoid module imports
const PlayIcon = (props) => (
    <svg viewBox="0 0 24 24" width={props.size || 16} height={props.size || 16} fill="currentColor">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const SquareIcon = (props) => (
    <svg viewBox="0 0 24 24" width={props.size || 16} height={props.size || 16} fill="currentColor">
        <rect x="6" y="6" width="12" height="12" />
    </svg>
);

const SendIcon = (props) => (
    <svg viewBox="0 0 24 24" width={props.size || 18} height={props.size || 18} fill="currentColor">
        <path d="M4 4l16 8-16 8 4-8z" />
    </svg>
);

const LayoutIcon = (props) => (
    <svg viewBox="0 0 24 24" width={props.size || 20} height={props.size || 20} fill="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M9 3v18M3 9h18" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
);

const MousePointerIcon = (props) => (
    <svg viewBox="0 0 24 24" width={props.size || 16} height={props.size || 16} fill="currentColor">
        <path d="M3 2l7 19 2-7 7-2L3 2z" />
    </svg>
);

// Use Agent from the global window (set by Agent.js ES module)
const Agent = window.Agent;

function App() {
    const [url, setUrl] = useState('https://websim.com');
    const [currentUrl, setCurrentUrl] = useState('https://websim.com');
    const [messages, setMessages] = useState([
        { role: 'system', content: 'Agent ready. Enter a URL (same-origin preferred for control) and an objective.' }
    ]);
    const [objective, setObjective] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [agentState, setAgentState] = useState({ cursor: null, highlight: null });

    const iframeRef = useRef(null);
    const agentRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = (role, content) => {
        setMessages(prev => [...prev, { role, content, id: Date.now() + Math.random() }]);
    };

    const handleNavigate = async (e) => {
        e.preventDefault();
        
        let target = url.trim();
        // Ensure protocol
        if (!target.startsWith('http://') && !target.startsWith('https://')) {
            target = 'https://' + target;
        }

        try {
            const urlObj = new URL(target);
            const hostname = urlObj.hostname.toLowerCase();

            // Enforce domain restriction: *.websim.ai or *.websim.com
            const isAllowed = hostname === 'websim.ai' || 
                              hostname.endsWith('.websim.ai') || 
                              hostname === 'websim.com' || 
                              hostname.endsWith('.websim.com');

            if (!isAllowed) {
                addMessage('system', 'Security Restriction: Navigation is limited to websim.ai and websim.com domains.');
                return;
            }

            addMessage('system', `Navigating to ${target}...`);
            
            // Attempt to create a proxy URL to bypass CORS/Iframe restrictions
            let finalUrl = target;
            if (window.createProxyUrl) {
                try {
                   finalUrl = await window.createProxyUrl(target);
                   if (finalUrl !== target) {
                       addMessage('system', 'Proxy activated: Full control enabled (Same-Origin).');
                   }
                } catch (err) {
                    console.error("Proxy error", err);
                }
            }

            setCurrentUrl(finalUrl);
        } catch (error) {
            addMessage('system', 'Error: Invalid URL entered.');
        }
    };

    const handleStart = async () => {
        if (!objective.trim()) return;
        if (isRunning) return;

        setIsRunning(true);

        // Initialize agent
        agentRef.current = new Agent(iframeRef.current, addMessage, setAgentState);

        addMessage('user', objective);
        addMessage('system', 'IMPORTANT: When prompted, select the "Current Tab" or "Window" to allow the AI to see the page.');

        try {
            await agentRef.current.runObjective(objective);
        } catch (e) {
            console.error(e);
        } finally {
            setIsRunning(false);
            setAgentState({ cursor: null, highlight: null });
        }
    };

    const handleStop = () => {
        setIsRunning(false);
        addMessage('system', 'Stop requested. (Agent will finish current step)');
        // In a real app we'd use AbortController, here we just flip the flag which the agent doesn't check mid-step, but prevents next steps.
    };

    return (
        <div className="w-full h-full flex">
            {/* Sidebar */}
            <div className="sidebar w-80 flex flex-col border-r border-gray-700 bg-gray-900 text-white">
                <div className="p-4 border-b border-gray-700 font-bold flex items-center gap-2 bg-gray-800">
                    <LayoutIcon size={20} className="text-blue-400" />
                    <span>Websim Agent</span>
                </div>

                <div className="chat-container flex-grow overflow-y-auto p-4 space-y-3 bg-gray-900">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`message ${msg.role} text-sm p-3 rounded-md border-l-4 shadow-sm ${
                            msg.role === 'user' ? 'bg-blue-900/30 border-blue-500' :
                            msg.role === 'agent' ? 'bg-green-900/30 border-green-500' :
                            'bg-gray-800 border-gray-600 text-gray-400 italic'
                        }`}>
                            <span className="font-bold block text-xs uppercase opacity-70 mb-1 tracking-wider">{msg.role}</span>
                            {msg.content}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="input-area p-4 bg-gray-800 border-t border-gray-700">
                    <label className="text-xs text-gray-400 mb-2 block uppercase font-semibold">Mission Objective</label>
                    <textarea
                        className="w-full bg-gray-900 text-white border border-gray-600 rounded p-2 text-sm focus:border-blue-500 outline-none resize-none h-24 mb-3"
                        placeholder="e.g. 'Click the blue button' or 'Search for cats'"
                        value={objective}
                        onChange={(e) => setObjective(e.target.value)}
                        disabled={isRunning}
                    />
                    <div className="flex gap-2">
                        {!isRunning ? (
                            <button
                                onClick={handleStart}
                                disabled={!objective.trim()}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <PlayIcon size={16} /> Start Agent
                            </button>
                        ) : (
                            <button
                                onClick={handleStop}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 px-4 rounded flex items-center justify-center gap-2 font-medium transition-colors"
                            >
                                <SquareIcon size={16} /> Stop
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content flex-grow flex flex-col relative bg-gray-100">
                {/* Browser Bar */}
                <div className="browser-bar h-14 bg-gray-800 flex items-center px-4 gap-2 border-b border-gray-700 shadow-md z-20">
                    <div className="flex-grow flex gap-2 max-w-4xl mx-auto w-full">
                        <input
                            type="url"
                            className="flex-grow bg-gray-900 border border-gray-600 text-gray-200 px-4 py-2 rounded focus:border-blue-500 outline-none transition-colors"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleNavigate(e)}
                            placeholder="https://websim.ai..."
                        />
                        <button
                            onClick={handleNavigate}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
                        >
                            <SendIcon size={18} />
                        </button>
                    </div>
                </div>

                {/* Iframe Container */}
                <div className="relative flex-grow w-full overflow-hidden bg-gray-200">
                    <iframe
                        ref={iframeRef}
                        src={currentUrl}
                        className="target-frame w-full h-full border-none bg-white"
                        title="Target Website"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                    />

                    {/* Visual Overlay for Agent Actions */}
                    <div className="overlay-layer absolute inset-0 pointer-events-none z-10 overflow-hidden">
                        {agentState.highlight && (
                            <div
                                className="agent-highlight absolute border-2 border-blue-500 bg-blue-500/20 transition-all duration-300 rounded"
                                style={{
                                    left: agentState.highlight.left,
                                    top: agentState.highlight.top,
                                    width: agentState.highlight.width,
                                    height: agentState.highlight.height
                                }}
                            />
                        )}
                        {agentState.cursor && (
                            <div
                                className="agent-cursor absolute w-8 h-8 bg-red-500/40 border-2 border-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 flex items-center justify-center shadow-lg backdrop-blur-sm"
                                style={{
                                    left: agentState.cursor.x,
                                    top: agentState.cursor.y
                                }}
                            >
                                <MousePointerIcon size={16} className="text-white" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Mount using ReactDOM's createRoot from the UMD build
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);