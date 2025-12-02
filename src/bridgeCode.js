export const bridgeCode = `
const WebSocket = require('ws');
const puppeteer = require('puppeteer');

// CONFIGURATION
const PORT = 3001;
const HEADLESS = false; // Set to true to hide the browser window

console.log("Installing dependencies if missing...");
console.log("Ensure you have run: npm install ws puppeteer");

const wss = new WebSocket.Server({ port: PORT });
console.log(\`Bridge running on ws://localhost:\${PORT}\`);

let browser;
let page;

async function initBrowser() {
    if (browser) return;
    console.log("Launching browser...");
    try {
        browser = await puppeteer.launch({
            headless: HEADLESS,
            defaultViewport: null,
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });
        page = (await browser.pages())[0];
        await page.setViewport({ width: 1280, height: 800 });
        console.log("Browser launched.");
    } catch (e) {
        console.error("Failed to launch browser:", e);
    }
}

wss.on('connection', async (ws) => {
    console.log('Client connected');
    await initBrowser();

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type);

            if (data.type === 'navigate') {
                if (!page) await initBrowser();
                await page.goto(data.url, { waitUntil: 'domcontentloaded' });
                ws.send(JSON.stringify({ type: 'navigated', url: data.url }));
            }

            if (data.type === 'get_state') {
                if (!page) await initBrowser();

                // Get HTML (Cleaned)
                const html = await page.evaluate(() => {
                    // Simple cleaning to reduce tokens
                    const clone = document.documentElement.cloneNode(true);
                    const toRemove = clone.querySelectorAll('script, style, svg, link, noscript');
                    toRemove.forEach(el => el.remove());
                    return clone.outerHTML;
                });

                // Get Screenshot
                const screenshotBuffer = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 });
                const screenshot = \`data:image/jpeg;base64,\${screenshotBuffer}\`;

                ws.send(JSON.stringify({
                    type: 'state',
                    html: html.substring(0, 25000), // Truncate
                    screenshot: screenshot
                }));
            }

            if (data.type === 'action') {
                if (!page) await initBrowser();
                const action = data.action;
                console.log("Executing action:", action);

                if (action.type === 'click') {
                    if (action.selector) {
                        try {
                            await page.waitForSelector(action.selector, { timeout: 2000 });
                            await page.click(action.selector);
                        } catch (e) {
                            console.log("Click failed:", e.message);
                        }
                    }
                } else if (data.type === 'type' || action.type === 'type') {
                     // Support both action.type and root type for compatibility
                     const selector = action.selector;
                     const value = action.value;
                     if (selector) {
                        try {
                            await page.waitForSelector(selector, { timeout: 2000 });
                            // Clear input first usually
                            await page.evaluate((sel) => document.querySelector(sel).value = '', selector);
                            await page.type(selector, value);
                            await page.keyboard.press('Enter');
                        } catch (e) {
                            console.log("Type failed:", e.message);
                        }
                     }
                }

                await new Promise(r => setTimeout(r, 1000));
                ws.send(JSON.stringify({ type: 'action_complete' }));
            }

        } catch (e) {
            console.error("Error processing message:", e);
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
`;