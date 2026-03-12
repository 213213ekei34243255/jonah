const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    search: (query) => ipcRenderer.invoke('search-google', query),

    getNews: (page = 1) => ipcRenderer.invoke('get-news', page)
});