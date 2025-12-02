export class IframeController {
    constructor(iframeElement) {
        this.iframe = iframeElement;
    }

    getDocument() {
        try {
            return this.iframe.contentDocument || this.iframe.contentWindow?.document;
        } catch (e) {
            // Suppress error logging here to avoid spamming user console, 
            // as we handle null checks downstream.
            return null;
        }
    }

    // Get simplified HTML for the AI
    getHTML() {
        const doc = this.getDocument();
        if (!doc) return "<html><body><!-- Cross-Origin Content: HTML Unavailable. Relying on visual screenshot only. --></body></html>";

        // We want to strip scripts and styles to save tokens, 
        // but keep structure and IDs/Classes/Attributes for selectors.
        const clone = doc.documentElement.cloneNode(true);

        // Remove scripts, styles, svgs (too verbose)
        const toRemove = clone.querySelectorAll('script, style, svg, link, noscript');
        toRemove.forEach(el => el.remove());

        // Helper to clean attributes
        const cleanAttributes = (node) => {
            if (node.nodeType === 1) { // Element
                const attrs = [...node.attributes];
                for (const attr of attrs) {
                    if (attr.name.startsWith('on') || attr.name === 'style') {
                        node.removeAttribute(attr.name);
                    }
                }
                // Recurse
                node.childNodes.forEach(cleanAttributes);
            }
        };
        cleanAttributes(clone);

        // Very basic truncation to avoid hitting context limits hard
        let html = clone.outerHTML;
        if (html.length > 20000) {
            html = html.substring(0, 20000) + "... (truncated)";
        }
        return html;
    }

    // Attempt to execute an action
    async executeAction(action) {
        const doc = this.getDocument();
        if (!doc) throw new Error("Cannot execute action: Cross-Origin restriction (Proxy inactive).");

        const { type, selector, value } = action;

        console.log("Executing:", action);

        const element = doc.querySelector(selector);
        if (!element) {
            throw new Error(`Element not found: ${selector}`);
        }

        // Scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait for scroll
        await new Promise(r => setTimeout(r, 500));

        if (type === 'click') {
            // Trigger events - try multiple ways to ensure frameworks pick it up
            element.focus();

            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                const event = new MouseEvent(eventType, {
                    view: this.iframe.contentWindow,
                    bubbles: true,
                    cancelable: true,
                    buttons: 1
                });
                element.dispatchEvent(event);
            });

        } else if (type === 'type') {
            element.focus();

            // Set value
            // React/Frameworks override the value setter, so we need the native one
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            if (nativeInputValueSetter && element instanceof HTMLInputElement) {
                 nativeInputValueSetter.call(element, value);
            } else {
                element.value = value;
            }

            // Trigger input events for frameworks (React etc)
            const inputEvent = new Event('input', { bubbles: true });
            element.dispatchEvent(inputEvent);
            const changeEvent = new Event('change', { bubbles: true });
            element.dispatchEvent(changeEvent);

            // Simulate keypresses (simplified)
            const keyEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
            element.dispatchEvent(keyEvent);
        }

        return true;
    }

    // Get coordinates for overlay
    getElementBounds(selector) {
        const doc = this.getDocument();
        if (!doc) return null;
        const el = doc.querySelector(selector);
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
    }
}