// Utility to capture the current screen/tab
// Returns a blob of the screenshot
export async function captureTab() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: "browser", // Prefer browser tab
            },
            audio: false,
            selfBrowserSurface: "include", // Allow capturing the current tab
            preferCurrentTab: true
        });

        const track = stream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(track);
        
        // Grab a frame
        const bitmap = await imageCapture.grabFrame();
        
        // Stop the stream immediately
        track.stop();

        // Convert to Blob via Canvas
        const canvas = document.createElement('canvas');
        
        // Resize image to reduce payload size for LLM (max 1024px width)
        let width = bitmap.width;
        let height = bitmap.height;
        const MAX_WIDTH = 1024;
        
        if (width > MAX_WIDTH) {
            height = Math.round(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.85); // Use JPEG for better compression/token efficiency
        });
    } catch (err) {
        console.error("Screen capture failed:", err);
        throw err;
    }
}

// Upload file to Websim storage
export async function uploadToWebsim(blob) {
    // Create a file object from blob
    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });
    try {
        const url = await window.websim.upload(file);
        return url;
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export async function createProxyUrl(targetUrl) {
    try {
        console.log("Creating proxy for:", targetUrl);
        let html;
        
        // 1. Try fetching directly (works for same-origin or permissive headers)
        try {
            const response = await fetch(targetUrl);
            if (!response.ok) throw new Error("Direct fetch failed");
            html = await response.text();
        } catch (e) {
            console.log("Direct fetch failed, trying CORS proxy...");
            // 2. Try CORS proxy (corsproxy.io is generally reliable)
            try {
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error("Proxy fetch failed");
                html = await response.text();
            } catch (proxyErr) {
                // 3. Fallback to allorigins (slower but different mechanism)
                console.log("Primary proxy failed, trying backup...");
                const backupUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(backupUrl);
                const data = await response.json();
                html = data.contents;
            }
        }

        // 3. Process HTML
        // Inject <base> tag to fix relative links (images, css, etc.)
        const baseTag = `<base href="${targetUrl}" target="_self">`;
        if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>${baseTag}`);
        } else {
            html = `<html><head>${baseTag}</head>` + html;
        }

        // Inject Agent Helper Script
        // - Intercepts clicks to handle navigation via parent (keeps user in proxy)
        // - Allows future extensibility for postMessage actions
        const script = `
        <script>
            (function() {
                console.log("Websim Agent Proxy Active");
                
                // Intercept clicks for navigation
                document.addEventListener('click', function(e) {
                    const link = e.target.closest('a');
                    if (link && link.href) {
                        // Allow hash navigation on same page
                        const url = new URL(link.href);
                        if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash) {
                            return; 
                        }

                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Request navigation from parent
                        window.parent.postMessage({
                            type: 'PROXY_NAVIGATE',
                            url: link.href
                        }, '*');
                    }
                }, true);
            })();
        </script>
        `;
        
        html += script;

        // 4. Create Blob URL
        const blob = new Blob([html], { type: 'text/html' });
        return URL.createObjectURL(blob);

    } catch (e) {
        console.warn("Proxy creation failed:", e);
        // Fallback to original URL (will likely fail CORS in iframe)
        return targetUrl;
    }
}

// Expose for App.js
window.createProxyUrl = createProxyUrl;