import { captureTab, uploadToWebsim, sleep } from './utils.js';
import { IframeController } from './IframeController.js';

export class Agent {
    constructor(iframeElement, addMessage, setAgentState) {
        this.iframeController = new IframeController(iframeElement);
        this.addMessage = addMessage;
        this.setAgentState = setAgentState; 
        this.history = [];
    }

    async runObjective(objective) {
        this.addMessage('system', `Objective started: "${objective}"`);
        
        try {
            // Limited loop steps
            const maxSteps = 5;
            for (let step = 1; step <= maxSteps; step++) {
                this.addMessage('system', `Step ${step}/${maxSteps}: analyzing view...`);
                
                // 1. Capture State (Screen + HTML)
                let screenshotBlob;
                try {
                    // We must wait a moment for the previous action to settle visually
                    await sleep(1000); 
                    screenshotBlob = await captureTab();
                } catch (e) {
                    this.addMessage('system', "Screenshot failed or cancelled by user. Stopping.");
                    return;
                }

                this.addMessage('system', "Processing visual data...");
                const screenshotUrl = await uploadToWebsim(screenshotBlob);
                const html = this.iframeController.getHTML();

                // 2. Consult LLM
                this.addMessage('agent', "Thinking...");
                
                const response = await this.queryLLM(objective, screenshotUrl, html);
                
                if (!response) {
                    this.addMessage('agent', "I failed to generate a valid plan.");
                    break;
                }

                this.addMessage('agent', `Reasoning: ${response.thought || "No thought provided."}`);

                if (response.finished) {
                    this.addMessage('agent', "Objective complete!");
                    break;
                }

                if (response.action) {
                    // Visualize intent
                    if (response.action.selector) {
                        const bounds = this.iframeController.getElementBounds(response.action.selector);
                        if (bounds) {
                            this.setAgentState({
                                cursor: { x: bounds.left + bounds.width/2, y: bounds.top + bounds.height/2 },
                                highlight: bounds
                            });
                        }
                    }

                    await sleep(1000); // Visual pause

                    try {
                        this.addMessage('system', `Executing: ${response.action.type} on ${response.action.selector}`);
                        await this.iframeController.executeAction(response.action);
                    } catch (err) {
                        this.addMessage('system', `Action Error: ${err.message}`);
                        // If action fails (e.g. cross origin), we might want to stop or ask for help
                        if (err.message.includes("Cross-Origin")) {
                            this.addMessage('system', "CRITICAL: I cannot control this page due to browser security (Cross-Origin). I can only see it.");
                            break;
                        }
                    }
                    
                    // Cleanup visual state
                    this.setAgentState({ cursor: null, highlight: null });
                }
            }
        } catch (e) {
            console.error(e);
            this.addMessage('system', `Error: ${e.message}`);
        }
    }

    async queryLLM(objective, screenshotUrl, html) {
        const prompt = `
            You are an autonomous web agent.
            User Objective: "${objective}"
            
            Current State:
            1. HTML Structure (provided below).
            2. Screenshot (provided).
            
            Task:
            Analyze the state and determine the single next best action to move closer to the objective.
            
            Constraints:
            - If the objective is met, set "finished": true.
            - If you need to click something, provide a valid CSS selector.
            - If you need to type, provide the selector and the value.
            - Prefer ID selectors or specific classes. Avoid generic tags like 'div'.
            
            Output JSON only:
            {
                "thought": "Reasoning...",
                "finished": boolean,
                "action": {
                    "type": "click" | "type",
                    "selector": "css_selector",
                    "value": "string_to_type"
                }
            }
        `;

        const messages = [
            {
                role: "system",
                content: "You are a web automation assistant. Respond strictly in JSON."
            },
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "text", text: `HTML Context (Partial):\n${html}` },
                    { type: "image_url", image_url: { url: screenshotUrl } }
                ]
            }
        ];

        try {
            const completion = await window.websim.chat.completions.create({
                messages,
                json: true
            });
            const content = completion.content;
            return JSON.parse(content);
        } catch (e) {
            console.error("LLM Error", e);
            return null;
        }
    }
}

// Expose Agent on the global window object so App.js (transpiled by Babel) can use it without imports
window.Agent = Agent;