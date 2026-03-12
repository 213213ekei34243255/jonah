const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('api', {
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    close: () => ipcRenderer.send('close-window'),

    getNews: (page) => ipcRenderer.invoke('get-news', page),
    searchGoogle: (query) => ipcRenderer.invoke('search-google', query),

    getSearchURL: (query) => {
        return `file://${path.join(__dirname, 'search.html')}?q=${encodeURIComponent(query)}`;
    }
});