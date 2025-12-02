export class BridgeController {
    constructor(wsUrl = 'ws://localhost:3001') {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.isConnected = false;
        this.messageHandlers = new Set();
        this.pendingRequests = new Map(); // id -> resolve
    }

    async connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return true;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);
                
                this.ws.onopen = () => {
                    this.isConnected = true;
                    console.log("Bridge Connected");
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    // Handle response
                    if (this.pendingRequests.has(data.type)) {
                        this.pendingRequests.get(data.type)(data);
                        // Don't delete immediately if it's a subscription, but here we do simple req/res
                    }
                };

                this.ws.onerror = (err) => {
                    console.error("Bridge Error", err);
                    this.isConnected = false;
                    reject(err);
                };
                
                this.ws.onclose = () => {
                    this.isConnected = false;
                }

            } catch (e) {
                reject(e);
            }
        });
    }

    async navigate(url) {
        if (!this.isConnected) await this.connect();
        this.ws.send(JSON.stringify({ type: 'navigate', url }));
    }

    // Unified State Getter (HTML + Screenshot)
    // Returns { html, screenshotDataUrl }
    async getState() {
        if (!this.isConnected) throw new Error("Bridge not connected");
        
        return new Promise((resolve) => {
            // Register handler for 'state' message
            const handler = (data) => {
                if (data.type === 'state') {
                    this.ws.removeEventListener('message', listener);
                    resolve({
                        html: data.html,
                        screenshot: data.screenshot
                    });
                }
            };
            
            const listener = (event) => handler(JSON.parse(event.data));
            this.ws.addEventListener('message', listener);
            
            this.ws.send(JSON.stringify({ type: 'get_state' }));
        });
    }

    async executeAction(action) {
         if (!this.isConnected) throw new Error("Bridge not connected");
         
         return new Promise((resolve) => {
             const listener = (event) => {
                 const data = JSON.parse(event.data);
                 if (data.type === 'action_complete' || data.type === 'error') {
                     this.ws.removeEventListener('message', listener);
                     if (data.type === 'error') throw new Error(data.message);
                     resolve(true);
                 }
             };
             this.ws.addEventListener('message', listener);
             
             this.ws.send(JSON.stringify({ type: 'action', action }));
         });
    }
}

export class BridgeController {
    constructor(wsUrl = 'ws://localhost:3001') {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.isConnected = false;
    }

    async connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return true;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);
                
                this.ws.onopen = () => {
                    this.isConnected = true;
                    console.log("Bridge Connected");
                    resolve(true);
                };

                this.ws.onerror = (err) => {
                    console.error("Bridge Error", err);
                    this.isConnected = false;
                    reject(err);
                };
                
                this.ws.onclose = () => {
                    this.isConnected = false;
                }
                
                // Keep alive helper?
                this.ws.onmessage = (e) => {}; 

            } catch (e) {
                reject(e);
            }
        });
    }

    async navigate(url) {
        if (!this.isConnected) await this.connect();
        this.ws.send(JSON.stringify({ type: 'navigate', url }));
    }

    async getState() {
        if (!this.isConnected) throw new Error("Bridge not connected");
        
        return new Promise((resolve) => {
            const listener = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'state') {
                    this.ws.removeEventListener('message', listener);
                    resolve({
                        html: data.html,
                        screenshot: data.screenshot
                    });
                }
            };
            this.ws.addEventListener('message', listener);
            this.ws.send(JSON.stringify({ type: 'get_state' }));
        });
    }

    async executeAction(action) {
         if (!this.isConnected) throw new Error("Bridge not connected");
         
         return new Promise((resolve) => {
             const listener = (event) => {
                 const data = JSON.parse(event.data);
                 if (data.type === 'action_complete' || data.type === 'error') {
                     this.ws.removeEventListener('message', listener);
                     resolve(true);
                 }
             };
             this.ws.addEventListener('message', listener);
             this.ws.send(JSON.stringify({ type: 'action', action }));
         });
    }
}

