// ===================================
// STABLE SINGLE-WEBVIEW MULTI TAB
// ===================================

let tabData = [];
let activeTabIndex = 0;

document.addEventListener("DOMContentLoaded", function () {

    const webview = document.getElementById("browser");
    const firstTab = document.querySelector(".tab");
    const tabBar = document.querySelector(".tab-bar");
    const newTabBtn = document.querySelector(".new-tab");
    const urlBar = document.getElementById("urlBar");

    webview.addEventListener("did-navigate", () => {
        injectTrustPanel();
    });

    webview.addEventListener("did-navigate-in-page", () => {
        injectTrustPanel();
    });

    // Initial tab
    tabData.push({
        title: "New Tab",
        url: webview.src
    });

    // ENTER KEY
    urlBar.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            loadURL();
        }
    });

    // NEW TAB BUTTON
    newTabBtn.addEventListener("click", function () {
        createNewTab("home.html");
    });

    // TAB CLICK + CLOSE
    tabBar.addEventListener("click", function (e) {

        // CLOSE
        if (e.target.classList.contains("close-tab")) {
            e.stopPropagation();
            closeTab(e.target.parentElement);
            return;
        }

        // SWITCH
        const tabElement = e.target.closest(".tab");
        if (!tabElement) return;

        const tabsUI = document.querySelectorAll(".tab");
        const index = Array.from(tabsUI).indexOf(tabElement);

        if (index !== -1) {
            switchTab(index);
        }
    });

});


webview.addEventListener("dom-ready", () => {
    webview.openDevTools();

    // ✅ FIRST LOAD FIX
    setTimeout(() => {
        injectTrustPanel();
    }, 1000);
});


function loadURL() {

    const input = document.getElementById("urlBar").value.trim();
    const webview = document.getElementById("browser");

    if (!input) return;

    let finalURL = "";

    if (input.startsWith("http://") || input.startsWith("https://")) {
        finalURL = input;
    } 
    else if (input.includes(".")) {
        finalURL = "https://" + input;
    } 
    else {
        finalURL = `file:///` + location.pathname.replace(/[^/]*$/, '') + `search.html?q=${encodeURIComponent(input)}`;
    }
    

    webview.src = finalURL;
    tabData[activeTabIndex].url = finalURL;
}



function createNewTab(url) {

    const tabBar = document.querySelector(".tab-bar");
    const webview = document.getElementById("browser");

    // Remove active class
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

    // Create new tab UI
    const newTab = document.createElement("div");
    newTab.className = "tab active";
    newTab.innerHTML = `
        <img src="assets/logo2.jpeg" class="tab-logo">
        <span>New Tab</span>
        <span class="close-tab">✕</span>
    `;

    tabBar.insertBefore(newTab, document.querySelector(".new-tab"));

    tabData.push({
        title: "New Tab",
        url: url
    });

    activeTabIndex = tabData.length - 1;

    webview.src = url;
}

function switchTab(index) {

    const webview = document.getElementById("browser");

    document.querySelectorAll(".tab").forEach((t, i) => {
        t.classList.toggle("active", i === index);
    });

    activeTabIndex = index;

    webview.src = tabData[index].url;
}

function closeTab(tabElement) {

    const tabsUI = document.querySelectorAll(".tab");
    const index = Array.from(tabsUI).indexOf(tabElement);

    if (tabData.length === 1) return;

    tabData.splice(index, 1);
    tabElement.remove();

    activeTabIndex = 0;
    switchTab(0);
}



function goBack() {
    const webview = document.getElementById("browser");
    if (webview.canGoBack()) webview.goBack();
}

function goForward() {
    const webview = document.getElementById("browser");
    if (webview.canGoForward()) webview.goForward();
}

function refreshPage() {
    document.getElementById("browser").reload();
}




function toggleAI() {
    document.getElementById("aiPanel").classList.toggle("ai-hidden");
}
