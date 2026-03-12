const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const axios = require('axios');

const GOOGLE_API_KEY = "AIzaSyADND9PItYgU1JJwYclnW5E5ZWrZQiomaE";
const GOOGLE_CX = "227fd21b1ac784f3b";

// 🔥 ADD THIS
const NEWS_API_KEY = "707146fc1eed4462a9609898231f68cd";

let mainWindow;


// ✅ GOOGLE SEARCH
ipcMain.handle('search-google', async (event, query) => {
    try {
        const response = await axios.get(
            `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&cx=${GOOGLE_CX}&key=${GOOGLE_API_KEY}`
        );
        return response.data;
    } catch (error) {
        console.error("Google API Error:", error.message);
        return null;
    }
});


// 🔥 ✅ NEWS API HANDLER (ADD THIS)
let cachedNews = null; // 🔥 GLOBAL CACHE

ipcMain.handle('get-news', async (event, page = 1) => {
    try {
        const config = {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json"
            }
        };

        let response = await axios.get(
            `https://newsapi.org/v2/top-headlines?country=in&pageSize=12&page=${page}&apiKey=${NEWS_API_KEY}`,
            config
        );

        if (response.data.totalResults === 0) {
            response = await axios.get(
                `https://newsapi.org/v2/everything?q=technology&pageSize=12&page=${page}&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`,
                config
            );
        }

        // ✅ SAVE SUCCESSFUL DATA
        cachedNews = response.data;

        return response.data;

    } catch (error) {
        console.error(
            "News API Error:",
            error.response?.status,
            error.response?.data || error.message
        );

        // 🔥 RETURN CACHE IF AVAILABLE
        if (cachedNews) {
            console.log("Using cached news");
            return cachedNews;
        }

        return null;
    }
});


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        icon: path.join(__dirname, 'assets/logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            sandbox: false,
            partition: "persist:main"
        }
    });

    const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    const ses = session.fromPartition("persist:main");

    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders["User-Agent"] = userAgent;
        callback({ requestHeaders: details.requestHeaders });
    });

    mainWindow.loadFile('index.html');
    mainWindow.webContents.openDevTools();
}


app.whenReady().then(async () => {
    const ses = session.fromPartition("persist:main");

    await ses.clearCache();
    await ses.clearStorageData();

    createWindow();
});


// ✅ WINDOW CONTROLS
ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});