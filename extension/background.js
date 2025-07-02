// Enhanced background.js with usage tracking functionality
let activeTab = null;
let visitStartTime = null;

// Initialize on script load
chrome.runtime.onStartup.addListener(() => {
    console.log("Extension started");
});

// Load when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated");
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            handleTabChange(tab);
        }
    } catch (error) {
        console.error("Error handling tab activation:", error);
    }
});

// Listen for tab updates (URL changes, page loads)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only process when URL changes or page completes loading
    if ((changeInfo.url || changeInfo.status === "complete") && tab.url) {
        // Skip chrome internal pages
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            return;
        }
        handleTabChange(tab);
    }
});

function handleTabChange(tab) {
    try {
        const url = new URL(tab.url);
        const domain = cleanDomain(url.hostname);
        
        console.log("Tab changed to:", domain);

        // Track time for previous tab
        const now = Date.now();
        if (activeTab && visitStartTime && activeTab !== domain) {
            const duration = Math.floor((now - visitStartTime) / 1000);
            if (duration > 0) { // Only save if spent at least 1 second
                saveVisit(activeTab, duration);
            }
        }

        // Update current active tab
        activeTab = domain;
        visitStartTime = now;
        
    } catch (error) {
        console.error("Error in handleTabChange:", error);
    }
}

function cleanDomain(domain) {
    if (!domain) return '';
    // Remove www. prefix and convert to lowercase
    return domain.replace(/^www\./, '').toLowerCase();
}

function saveVisit(domain, timeSpent) {
    if (!domain || timeSpent <= 0) return;
    
    chrome.storage.local.get(["visits", "weeklyVisits"], (result) => {
        let visits = result.visits || {};
        let weeklyVisits = result.weeklyVisits || {};
        const today = new Date().toDateString();
        const currentWeek = getWeekKey(new Date());
        
        // Store daily visits
        if (!visits[today]) {
            visits[today] = {};
        }
        visits[today][domain] = (visits[today][domain] || 0) + timeSpent;
        
        // Store weekly visits
        if (!weeklyVisits[currentWeek]) {
            weeklyVisits[currentWeek] = {};
        }
        weeklyVisits[currentWeek][domain] = (weeklyVisits[currentWeek][domain] || 0) + timeSpent;
        
        // Keep only last 7 days of daily data
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        Object.keys(visits).forEach(date => {
            if (new Date(date) < sevenDaysAgo) {
                delete visits[date];
            }
        });
        
        // Keep only last 4 weeks of weekly data
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        
        Object.keys(weeklyVisits).forEach(weekKey => {
            const weekDate = new Date(weekKey);
            if (weekDate < fourWeeksAgo) {
                delete weeklyVisits[weekKey];
            }
        });
        
        chrome.storage.local.set({ visits, weeklyVisits }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving visit:", chrome.runtime.lastError);
            }
        });
    });
}

function getWeekKey(date) {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
    startOfWeek.setDate(diff);
    return startOfWeek.toDateString();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received message:", request);
    
    if (request.type === "getData") {
        chrome.storage.local.get(["visits", "weeklyVisits"], (result) => {
            // Return today's visits and weekly data
            const today = new Date().toDateString();
            const currentWeek = getWeekKey(new Date());
            const todayVisits = result.visits && result.visits[today] ? result.visits[today] : {};
            const weeklyVisits = result.weeklyVisits || {};
            
            sendResponse({
                visits: todayVisits,
                weeklyVisits: weeklyVisits,
                allDailyVisits: result.visits || {}
            });
        });
        return true; // Required for async response
        
    } else if (request.type === "clearData") {
        chrome.storage.local.clear(() => {
            if (chrome.runtime.lastError) {
                console.error("Error clearing data:", chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                activeTab = null;
                visitStartTime = null;
                console.log("All data cleared");
                sendResponse({ success: true });
            }
        });
        return true;
    }
    
    // Default response for unknown message types
    sendResponse({ success: false, error: "Unknown message type" });
    return false;
});

// Save visit time when extension is suspended/unloaded
chrome.runtime.onSuspend.addListener(() => {
    if (activeTab && visitStartTime) {
        const duration = Math.floor((Date.now() - visitStartTime) / 1000);
        if (duration > 0) {
            saveVisit(activeTab, duration);
        }
    }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus - save current visit time
        if (activeTab && visitStartTime) {
            const duration = Math.floor((Date.now() - visitStartTime) / 1000);
            if (duration > 0) {
                saveVisit(activeTab, duration);
            }
        }
        activeTab = null;
        visitStartTime = null;
    } else {
        // Browser gained focus - get current active tab
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
            if (tabs.length > 0 && tabs[0].url && 
                !tabs[0].url.startsWith('chrome://') && 
                !tabs[0].url.startsWith('chrome-extension://')) {
                handleTabChange(tabs[0]);
            }
        });
    }
});