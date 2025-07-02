// Enhanced Popup JavaScript for Productivity Tracker

class ProductivityTracker {
    constructor() {
        this.data = null;
        this.isLoading = false;
        this.lastUpdateTime = 0;
        this.updateThrottleTime = 1000; // 1 second throttle
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadData();
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.closest('.nav-tab').dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Refresh button with throttling
        document.getElementById('refreshData').addEventListener('click', () => {
            if (!this.isLoading) {
                this.loadData();
                this.showToast('Data refreshed successfully!', 'success');
            }
        });

        // Footer actions
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('clearData').addEventListener('click', () => this.clearData());
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Update stats when switching to stats tab
        if (tabName === 'stats') {
            this.updateStatsTab();
        }
    }

    loadData() {
        // Prevent multiple simultaneous loads
        if (this.isLoading) return;
        
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleTime) {
            return;
        }
        
        this.isLoading = true;
        this.lastUpdateTime = now;
        
        // Show loading state
        document.getElementById('refreshData').classList.add('loading');
        
        chrome.runtime.sendMessage({ type: "getData" }, (data) => {
            this.isLoading = false;
            document.getElementById('refreshData').classList.remove('loading');
            
            if (chrome.runtime.lastError) {
                console.error('Error loading data:', chrome.runtime.lastError);
                this.showToast('Error loading data', 'error');
                return;
            }
            
            this.data = data || { visits: {}, weeklyVisits: {}, allDailyVisits: {} };
            this.updateDashboard();
            this.updateStatsTab();
        });
    }

    updateDashboard() {
        if (!this.data) return;
        
        const report = document.getElementById("report");
        const totalTimeEl = document.getElementById("totalTime");
        const siteCountEl = document.getElementById("siteCount");
        
        // Get today's visits
        const visits = this.data.visits || {};
        
        if (Object.keys(visits).length === 0) {
            report.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-chart-bar"></i>
                    <span>No activity yet today</span>
                </li>
            `;
            totalTimeEl.textContent = "0h 0m";
            siteCountEl.textContent = "0";
            return;
        }

        // Calculate total time and site count
        let totalSeconds = 0;
        const sites = Object.entries(visits);
        
        sites.forEach(([site, time]) => {
            totalSeconds += Number(time) || 0;
        });

        // Update stats
        totalTimeEl.textContent = this.formatTime(totalSeconds);
        siteCountEl.textContent = sites.length.toString();

        // Sort sites by time spent (descending)
        const sortedSites = sites.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));

        // Update report list
        report.innerHTML = sortedSites.map(([site, time]) => `
            <li>
                <span class="site-name">${this.formatSiteName(site)}</span>
                <span class="time-spent">${this.formatTime(Number(time) || 0)}</span>
            </li>
        `).join('');
    }

    updateStatsTab() {
        if (!this.data) return;

        this.updateUsageStats();
        this.updateWeeklyChart();
        this.updateTopSites();
    }

    updateUsageStats() {
        const avgDailyTimeEl = document.getElementById('avgDailyTime');
        const topSiteEl = document.getElementById('topSite');
        
        // Calculate average daily time from all daily visits
        const allDailyVisits = this.data.allDailyVisits || {};
        const dailyTotals = Object.values(allDailyVisits).map(dayVisits => {
            return Object.values(dayVisits).reduce((sum, time) => sum + (Number(time) || 0), 0);
        });
        
        const avgDaily = dailyTotals.length > 0 ? 
            dailyTotals.reduce((sum, time) => sum + time, 0) / dailyTotals.length : 0;
        
        avgDailyTimeEl.textContent = this.formatTime(avgDaily);
        
        // Find most visited site across all time
        const allSites = {};
        Object.values(allDailyVisits).forEach(dayVisits => {
            Object.entries(dayVisits).forEach(([site, time]) => {
                allSites[site] = (allSites[site] || 0) + (Number(time) || 0);
            });
        });
        
        const topSiteEntry = Object.entries(allSites).sort((a, b) => b[1] - a[1])[0];
        topSiteEl.textContent = topSiteEntry ? this.formatSiteName(topSiteEntry[0]) : 'None';
    }

    updateWeeklyChart() {
        const chartContainer = document.getElementById('weeklyChart');
        const weeklyVisits = this.data.weeklyVisits || {};
        
        if (Object.keys(weeklyVisits).length === 0) {
            chartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-line"></i>
                    <span>Not enough data yet</span>
                </div>
            `;
            return;
        }

        // Get last 7 days
        const last7Days = this.getLast7Days();
        const maxTime = Math.max(...last7Days.map(day => this.getDayTotal(day)));
        
        chartContainer.innerHTML = `
            <div class="chart-bar">
                ${last7Days.map(day => {
                    const dayTotal = this.getDayTotal(day);
                    const height = maxTime > 0 ? (dayTotal / maxTime) * 60 : 2;
                    return `
                        <div class="chart-day">
                            <div class="chart-day-bar" style="height: ${height}px;" title="${this.formatTime(dayTotal)}"></div>
                            <span class="chart-day-label">${this.formatDayLabel(day)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    updateTopSites() {
        const topSitesList = document.getElementById('topSitesList');
        const weeklyVisits = this.data.weeklyVisits || {};
        
        // Aggregate all weekly data
        const siteTotals = {};
        Object.values(weeklyVisits).forEach(weekData => {
            Object.entries(weekData).forEach(([site, time]) => {
                siteTotals[site] = (siteTotals[site] || 0) + (Number(time) || 0);
            });
        });
        
        if (Object.keys(siteTotals).length === 0) {
            topSitesList.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-globe"></i>
                    <span>No data available</span>
                </li>
            `;
            return;
        }

        // Sort and take top 10
        const sortedSites = Object.entries(siteTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        topSitesList.innerHTML = sortedSites.map(([site, time]) => `
            <li>
                <span class="site-name">${this.formatSiteName(site)}</span>
                <span class="time-spent">${this.formatTime(Number(time) || 0)}</span>
            </li>
        `).join('');
    }

    getLast7Days() {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            days.push(date.toDateString());
        }
        return days;
    }

    getDayTotal(dayString) {
        const allDailyVisits = this.data.allDailyVisits || {};
        const dayVisits = allDailyVisits[dayString] || {};
        return Object.values(dayVisits).reduce((sum, time) => sum + (Number(time) || 0), 0);
    }

    formatDayLabel(dayString) {
        const date = new Date(dayString);
        return date.toLocaleDateString('en-US', { weekday: 'short' }).substr(0, 3);
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${remainingSeconds}s`;
        }
    }

    formatSiteName(site) {
        if (!site) return 'Unknown';
        // Remove www. prefix and capitalize first letter
        const cleaned = site.replace(/^www\./, '');
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    exportData() {
        if (!this.data.visits || Object.keys(this.data.visits).length === 0) {
            this.showToast('No data to export', 'error');
            return;
        }

        const exportData = {
            date: new Date().toISOString().split('T')[0],
            todayVisits: this.data.visits,
            weeklyVisits: this.data.weeklyVisits || {},
            allDailyVisits: this.data.allDailyVisits || {},
            totalTimeToday: Object.values(this.data.visits).reduce((sum, time) => sum + (Number(time) || 0), 0),
            exportedAt: new Date().toISOString()
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `productivity-report-${exportData.date}.json`;
        
        // Create download link
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showToast('Data exported successfully!', 'success');
    }

    clearData() {
        if (confirm('Are you sure you want to clear all productivity data? This action cannot be undone.')) {
            chrome.runtime.sendMessage({ type: "clearData" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error clearing data:', chrome.runtime.lastError);
                    this.showToast('Error clearing data', 'error');
                    return;
                }
                
                if (response && response.success) {
                    this.data = { visits: {}, weeklyVisits: {}, allDailyVisits: {} };
                    this.updateDashboard();
                    this.updateStatsTab();
                    this.showToast('All data cleared successfully!', 'success');
                } else {
                    this.showToast('Failed to clear data', 'error');
                }
            });
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const toastIcon = toast.querySelector('.toast-icon');
        const toastMessage = toast.querySelector('.toast-message');
        
        if (!toastIcon || !toastMessage) return;
        
        // Set message
        toastMessage.textContent = message;
        
        // Set icon and style based on type
        toast.classList.remove('error', 'warning');
        if (type === 'error') {
            toast.classList.add('error');
            toastIcon.className = 'toast-icon fas fa-exclamation-circle';
        } else if (type === 'warning') {
            toast.classList.add('warning');
            toastIcon.className = 'toast-icon fas fa-exclamation-triangle';
        } else {
            toastIcon.className = 'toast-icon fas fa-check-circle';
        }
        
        // Show toast
        toast.classList.add('show');
        
        // Hide toast after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Get productivity insights
    getProductivityInsights() {
        if (!this.data.visits) return null;
        
        const sites = Object.entries(this.data.visits);
        const totalTime = sites.reduce((sum, [, time]) => sum + (Number(time) || 0), 0);
        const mostVisited = sites.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))[0];
        
        return {
            totalTime,
            mostVisited: mostVisited ? mostVisited[0] : null,
            mostVisitedTime: mostVisited ? Number(mostVisited[1]) || 0 : 0,
            siteCount: sites.length,
            averageTimePerSite: totalTime / sites.length || 0
        };
    }
}

// Initialize the tracker when DOM is loaded
let tracker;
document.addEventListener('DOMContentLoaded', () => {
    tracker = new ProductivityTracker();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + 1 for Dashboard
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        tracker.switchTab('dashboard');
    }
    
    // Ctrl/Cmd + 2 for Stats
    if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        tracker.switchTab('stats');
    }
    
    // Ctrl/Cmd + R for Refresh
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        tracker.loadData();
        tracker.showToast('Data refreshed!', 'success');
    }
});

// Utility functions
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

function getDomainFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

function isProductiveSite(domain) {
    const productiveDomains = [
        'github.com', 'stackoverflow.com', 'developer.mozilla.org',
        'docs.google.com', 'coursera.org', 'udemy.com', 'edx.org',
        'linkedin.com', 'medium.com', 'dev.to', 'freecodecamp.org'
    ];
    
    return productiveDomains.some(prodDomain => 
        domain.includes(prodDomain) || prodDomain.includes(domain)
    );
}

function getProductivityScore(visits) {
    if (!visits || Object.keys(visits).length === 0) return 0;
    
    const totalTime = Object.values(visits).reduce((sum, time) => sum + (Number(time) || 0), 0);
    let productiveTime = 0;
    
    Object.entries(visits).forEach(([domain, time]) => {
        if (isProductiveSite(domain)) {
            productiveTime += Number(time) || 0;
        }
    });
    
    return totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
}