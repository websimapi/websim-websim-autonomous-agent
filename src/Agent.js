import { captureTab, uploadToWebsim, sleep, blobToDataURL } from './utils.js';
import { IframeController } from './IframeController.js';

export class Agent {
    constructor(controller, addMessage, setAgentState) {
        this.controller = controller;
        this.addMessage = addMessage;
        this.setAgentState = setAgentState; 
        this.history = [];
    }

    async runObjective(objective) {
        this.addMessage('system', `Objective started: "${objective}"`);
        
        try {
            // Limited loop steps
            const maxSteps = 15;
            for (let step = 1; step <= maxSteps; step++) {
                this.addMessage('system', `Step ${step}/${maxSteps}: analyzing view...`);
                
                // 1. Capture State (Screen + HTML)
                let screenshotDataUrl;
                let html;

                // Determine if we are using Bridge or Iframe based on method existence
                if (this.controller.getState) {
                     // Bridge Mode
                    this.addMessage('system', "Fetching state from Bridge...");
                    try {
                        const state = await this.controller.getState();
                        html = state.html;
                        screenshotDataUrl = state.screenshot;
                    } catch (e) {
                        this.addMessage('system', "Bridge Error: " + e.message);
                        break;
                    }
                } else {
                    // Iframe Mode
                    // We must wait a moment for the previous action to settle visually
                    await sleep(1000); 
                    let screenshotBlob;
                    try {
                        screenshotBlob = await captureTab();
                    } catch (e) {
                        this.addMessage('system', "Screenshot failed or cancelled by user. Stopping.");
                        return;
                    }

                    this.addMessage('system', "Processing visual data...");
                    // Upload for persistence (as requested by user)
                    // await uploadToWebsim(screenshotBlob); // Optional now for speed
                    
                    // Convert to Base64 Data URL for LLM (Required by API)
                    screenshotDataUrl = await blobToDataURL(screenshotBlob);
                    
                    html = this.controller.getHTML();
                }

                // 2. Consult LLM
                this.addMessage('agent', "Thinking...");
                
                const response = await this.queryLLM(objective, screenshotDataUrl, html);
                
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
                    // Visualize intent (Only works well for Iframe currently, Bridge coords might differ)
                    // If Bridge, we might skip overlay or map it if we knew viewport.
                    if (response.action.selector && this.controller.getElementBounds) {
                        const bounds = this.controller.getElementBounds(response.action.selector);
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
                        await this.controller.executeAction(response.action);
                    } catch (err) {
                        this.addMessage('system', `Action Error: ${err.message}`);
                        if (err.message.includes("Cross-Origin")) {
                             this.addMessage('system', "CRITICAL: Cross-Origin Error. Please switch to 'Local Bridge' mode.");
                             break;
                        }
                    }
                    
                    this.setAgentState({ cursor: null, highlight: null });
                }
            }
        } catch (e) {
            console.error(e);
            this.addMessage('system', `Error: ${e.message}`);
        }
    }

    async queryLLM(objective, screenshotDataUrl, html) {
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
                    { type: "image_url", image_url: { url: screenshotDataUrl } }
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