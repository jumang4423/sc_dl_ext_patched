chrome.action.onClicked.addListener((active_tab) => {
    chrome.tabs.create({ url: "https://soundcloud.com/" }, (tab) => {});
});

let playlists = false
let playlistLock = false
let clientID = ""
let authToken = ""
let historyUrl = ""

function validFilename(filename) {
  filename = filename.replace(/^\./, "_");
  filename = filename.replace(/[<>:"/\|?*]/g, "");
  return filename;
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (details.url.includes("soundcloud.com/me")) {
    if (!details.requestBody?.raw) return
    const decoder = new TextDecoder("utf-8")
    const json = JSON.parse(decoder.decode(details.requestBody.raw[0].bytes))
    authToken = json.auth_token
  }
}, {urls: ["https://*.soundcloud.com/*"]}, ["requestBody"])

chrome.webRequest.onSendHeaders.addListener((details) => {
  if (!clientID) {
    const url = details.url.split("?")
    const params = new URLSearchParams(`?${url[1]}`)
    clientID = params.get("client_id")
  }
}, {urls: ["https://*.soundcloud.com/*"]})

const getDownloadURL = async (track, album, trackNumber) => {
    if (!track || !track.media) {
      return null;
    }
    let url = track.media.transcodings.find((t) => t.format.mime_type === "audio/mpeg" && t.format.protocol === "progressive")?.url
    if (!url) {
      return null;
    }
    url += url.includes("secret_token") ? `&client_id=${clientID}` : `?client_id=${clientID}`
    const mp3 = await fetch(url).then((r) => r.json()).then((m) => m.url).catch(e => {})
    return mp3;
}

const downloadPlaylist = async (request, playlist, pathPrefix) => {
  for (let i = 0; i < playlist.tracks.length; i++) {
    if (!playlist.tracks[i].media) playlist.tracks[i] = await fetch(`https://api-v2.soundcloud.com/tracks/soundcloud:tracks:${playlist.tracks[i].id}?client_id=${clientID}`).then(r=>r.json()).catch(e=>{})
  }
  for (let i = 0; i < playlist.tracks.length; i++) {
    try {
      const url = await getDownloadURL(playlist.tracks[i], playlist.title, i + 1)
      let filename = validFilename(`${playlist.tracks[i].title}.mp3`.trim())
      if (url) chrome.downloads.download({url, filename: `${filename}`, conflictAction: "overwrite"})
    } catch (e) {
      continue
    }
  }
  if (request.href) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "clear-spinner", href: request.href}, (response) => {if (chrome.runtime.lastError) {}})
    })
  } else {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "download-stopped", id: request.id}, (response) => {if (chrome.runtime.lastError) {}})
    })
  }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === "download-track") {
      const track = request.track
      const url = await getDownloadURL(track)
      const filename = validFilename(`${track.title}.mp3`.trim())
      if (url) chrome.downloads.download({url, filename, conflictAction: "overwrite"})
      if (request.href) {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "clear-spinner", href: request.href}, (response) => {if (chrome.runtime.lastError) {}})
        })
      } else {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "download-stopped", id: request.id}, (response) => {if (chrome.runtime.lastError) {}})
        })
      }
    }

    if (request.message === "download-user") {
      const trackArray = []
      let user = await fetch(`https://api-v2.soundcloud.com/users/${request.user.id}/tracks?client_id=${clientID}&limit=100`).then(r => r.json())
      trackArray.push(...user.collection)
      while (user.next_href) {
        user = await fetch(`${user.next_href}&client_id=${clientID}`).then(r => r.json())
        trackArray.push(...user.collection)
      }
      for (let i = 0; i < trackArray.length; i++) {
        try {
          const url = await getDownloadURL(trackArray[i], null, i + 1)
          const filename = validFilename(`${trackArray[i].title}.mp3`.trim())
          if (url) chrome.downloads.download({url, filename: `${request.user.username}/${filename}`, conflictAction: "overwrite"})
        } catch (e) {
          continue
        }
      }
      if (playlists) {
        try {
          const playlistArray = []
          let playlists = await fetch(`https://api-v2.soundcloud.com/users/${request.user.id}/playlists?client_id=${clientID}&limit=100`).then(r => r.json())
          playlistArray.push(...playlists.collection)
          while (playlists.next_href) {
            playlists = await fetch(`${playlists.next_href}&client_id=${clientID}`).then(r => r.json())
            playlistArray.push(...playlists.collection)
          }
          for (let playlist of playlistArray) {
            await downloadPlaylist(request, playlist, `${request.user.username}/`)
          }
        }
        catch (e) {}
      }      
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "download-stopped", id: request.id}, (response) => {if (chrome.runtime.lastError) {}})
      })
    }

    if (request.message === "download-playlist") {
      await downloadPlaylist(request, request.playlist)
    }

    if (request.message === "set-state") {
      playlists = request.playlists === "on" ? true : false
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "update-state", state: request.state, playlists: request.playlists}, (response) => {if (chrome.runtime.lastError) {}})
      })
    }
})

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (historyUrl !== details.url) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      playlistLock = false;
      tabs[0].url.indexOf("soundcloud") > -1 && chrome.tabs.sendMessage(tabs[0].id, {message: "history-change"}, (response) => {if (chrome.runtime.lastError) {}})
    })
  }
  historyUrl = details.url
})

let currentActivePort;

let portConnectInProgress = {status: false, tab_id: -1};

let resetTimeout = {tabId: null, timer: null, shouldWait: false};

let currentUsedTabs = {};

let _cbs = [];

let activeEnvironment = {
    sandbox_id: null,
    content_id: null
};

/*
check domain missmatch
*/

chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  const retPath = details.requestHeaders?.find(el => /x-retpath-y/gi.test(el.name));
  if (retPath && retPath.value !== 'https://api-v2.soundcloud.com/') {
    chrome.cookies.set({url: 'https://api-v2.soundcloud.com/', name: 's_cloud', value: '1'});
  }
}, {urls: ['https://api-v2.soundcloud.com/*'], types: ['xmlhttprequest']}, ['requestHeaders', 'extraHeaders']);

//add allow origin header for downloads
async function allowOrigin() {
    const fromStorage = await chrome.storage.local.get('dnl_settings');
    let settings = {'headers': [
            {'key': 'Access-Control-Allow-Origin', 'value': '*'}
        ]
    };
    if (fromStorage && fromStorage['dnl_settings']) {
        settings = fromStorage['dnl_settings'];
    }
    if (settings.hasOwnProperty('headers') && settings['headers'].length) {
        let RULE_ID = 0;
        let removeRuleIds = [];
        const addRules = settings.headers.map(item => {
            RULE_ID++;
            removeRuleIds.push(RULE_ID);
            return {
                id: RULE_ID,
                priority: 1,
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: [{ 
                      header: item.key, 
                      operation: "set", 
                      value: item.value}]
                },
                 condition: {
                    initiatorDomains: ['chrome-extension'],
                    urlFilter: '||soundcloud.com.',
                    requestMethods: ['post'],
                    resourceTypes: ["xmlhttprequest"]
                }
            }
        });
        await chrome.declarativeNetRequest.updateSessionRules({
            'removeRuleIds': removeRuleIds,
            'addRules': addRules
        });
    }
}

allowOrigin();

chrome.runtime.onConnect.addListener(async port => {

  if (port.name === 'keepAlive' &&
      (!currentActivePort || currentActivePort.sender.tab.id === port.sender.tab.id)) {
      currentActivePort = port;
      clearTimeout(resetTimeout.timer);
      resetTimeout.tabId = port.sender.tab.id;
      currentUsedTabs[port.sender.tab.id] = port.sender.tab.url;
      resetTimeout.timer = setTimeout(keepAliveForced, 295e3); // 5 minutes minus 5 seconds
      port.onMessage.addListener((message, port) => {
          messageHandler(message, {type: 'port', port: port})});
      port.onDisconnect.addListener(keepAliveForced);
  }  
});

function setPortConnectInProgress(tabId) {
    portConnectInProgress = true;
    portConnectInProgress.tab_id = tabId;
}

function resetPortConnectInProgress() {
    portConnectInProgress = false;
    portConnectInProgress.tab_id = -1;
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+=-';
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function isActiveEnv(request) {
    return request.content_id === activeEnvironment.content_id && (!request.sandbox_id || request.sandbox_id === activeEnvironment.sandbox_id);
}

function handleResponse(message, connection) {
    if (connection.type === 'port') {
        connection.port?.postMessage(message);
    }
    else {
        connection.sendResponse(message);
    }
}

async function keepAliveForced() {
    if (resetTimeout.shouldWait) {
        resetTimeout.shouldWait = false;
        clearTimeout(resetTimeout.timer);
        //wait a bit for connection from same tab before
        resetTimeout.timer = setTimeout(keepAliveForced, 10 * 1000);
        setPortConnectInProgress(resetTimeout.tabId);
        setTimeout(resetPortConnectInProgress, 2 * 1000);
        return;
    }
    else {
        //real disconnect, call destructors
        const d_cbs = await chrome.storage.local.get({'d_cbs': []});
        try {
            d_cbs['d_cbs'].forEach(cb => {
                let chrome_api = chrome;
                for (let api of cb.c) {
                    if (typeof chrome_api[api] === 'function') {
                        chrome_api = chrome_api[api].bind(chrome_api);
                        break;
                    }
                    else {
                    chrome_api = chrome_api[api];
                    }
                }
                chrome_api(...cb.p);
            });
        }
        catch(e) {

        }
        await chrome.storage.local.set({'d_cbs': []});

        currentActivePort?.disconnect();
        currentActivePort = null;
        resetPortConnectInProgress();
        keepAlive();
    } 
}

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    delete currentUsedTabs[tabId];
});

async function keepAlive() {
    if (currentActivePort) return;

    for (const tab of await chrome.tabs.query({ url: '*://*/*' })) {
        if (currentUsedTabs.hasOwnProperty(tab.id) && currentUsedTabs[tab.id] === tab.url) {
            continue;
        }
        try {
            setPortConnectInProgress(tab.id);
            setTimeout(resetPortConnectInProgress, 2 * 1000);
            const res = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['/js/connector.js']
            });
            //success
            if (res[0].result) {
                return;
            }
        } catch (e) {
            resetPortConnectInProgress();
        }
    }
}

async function retryOnTabUpdate(tabId, info, tab) {
    /* 
        skip processing if connecting to port already started (except changes in current port's tab)
    */
    if ((!portConnectInProgress.status || portConnectInProgress.tab_id === tabId) && info.url && /^https?:/.test(info.url)) {
        keepAlive();
    }
}

function messageHandler(request, connection) {
    if (request.type === 'init_message') {
        activeEnvironment.sandbox_id = request.sandbox_id;
        activeEnvironment.content_id = request.content_id;
        handleResponse({callback_id: request.callback_id, callback_params: []}, connection);
    }
    else if (connection.type === 'port' && !isActiveEnv(request)) {
        return;
    }
    if (request.type === 'chrome_api') {
        try {
            let chrome_api = chrome;
            for (let api of request.api_chain) {
                if (typeof chrome_api[api] === 'function') {
                    chrome_api = chrome_api[api].bind(chrome_api);
                    break;
                }
                else {
                    chrome_api = chrome_api[api];
                }
            }
            request.params = request.params ? request.params : [];
            if (request.callback_type === 'callback') {
                chrome_api(...request.params).then(res => {
                    try {
                        handleResponse({callback_id: request.callback_id, callback_params: [res]}, connection);
                        
                    }
                    catch(e){
                    }
                }).catch(e => {
                    try {
                        handleResponse({callback_id: request.callback_id, callback_params: [null]}, connection);
                    }
                    catch(e){
                    }
                });
            }
            else if (connection.type === 'port' && request.callback_type === 'listener') {
                if (request.callback_id) {
                    const listenerFunction = function(...callbackParams){
                        const _unique_callback_id = randomString(16);
                        _cbs.push({callback_id: request.callback_id, callback_params: callbackParams, unique_id: _unique_callback_id});
                        if (currentActivePort) {
                            try {
                                currentActivePort?.postMessage({callback_id: request.callback_id, callback_params: callbackParams});
                                const isCurrentPortTab = currentActivePort && callbackParams.length && callbackParams[0]['tabId'] === currentActivePort.sender.tab.id && callbackParams[0]['type'] === 'main_frame';
                                if (!isCurrentPortTab)
                                {
                                    setTimeout(() => {
                                        _cbs = _cbs.filter(param => param.unique_id !== _unique_callback_id);
                                    }, 2000);
                                }
                                
                            }
                            catch(e) {}
                        }
                    }
                    request.params.unshift(listenerFunction);
                    chrome_api(...request.params);
                }
            }
            else if (request.callback_type === 'static') {
                return handleResponse({callback_id: request.callback_id, callback_params: [chrome_api]}, connection);
            }
            else {
                return handleResponse({callback_id: request.callback_id, callback_params: [chrome_api(...request.params)]}, connection);
            }
        }
        catch(e) {

        }
    }
    else if (request.type === 'fetch') {
        try {
            if (request.params.body) {
                const formData = new FormData();
                Object.keys(request.params.body).forEach(key => formData.append(key, request.params.body[key]));
                request.params.body = formData;
            }
            fetch(request.url, request.params).then(res => res.text()).then(res => {
                currentActivePort?.postMessage({callback_id: request.callback_id, callback_params: [{result: res}]});
            }).catch(e => {
                try {
                    currentActivePort?.postMessage({callback_id: request.callback_id, callback_params: [{error: e}]});
                }
                catch(e) {}
            });
        }
        catch(e) {}
    }
    else if (request.type === 'reset_port' && connection.type === 'port' && connection.port.sender.tab.id === resetTimeout.tabId) {
        resetTimeout.shouldWait = true;
    }
    else if (request.type === 'restore_callbacks' && connection.type === 'port') {
        _cbs.forEach(param => {
            connection.port?.postMessage(param);
        });
        _cbs = [];
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    messageHandler(message, {type:'response', sendResponse: sendResponse})
    return true;
});

async function main() {
    await chrome.storage.local.remove(['sb_parameters', 'sb_callbacks']);
    keepAlive();
     chrome.tabs.onUpdated.addListener(retryOnTabUpdate);
}
setTimeout(main, 2000);