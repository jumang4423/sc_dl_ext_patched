(function () {
let singletonePortToWorker;
let listener;
let singletoneTimeoutID;

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+=-';
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

var scriptId = randomString(8);

async function connectToSW(iframe) {
    const _port = await chrome.runtime.connect({ name: 'keepAlive' });
    clearTimeout(singletoneTimeoutID);
    singletoneTimeoutID = setTimeout(async function() {
        await singletonePortToWorker?.postMessage({type: 'reset_port', content_id: scriptId});
        await singletonePortToWorker?.disconnect();
        singletonePortToWorker = await connectToSW(iframe);
    }, 3 * 60 * 1000);
    
    _port.onMessage.addListener(function(message, port) {
        iframe?.contentWindow.postMessage(message, '*');
    });

    _port.onDisconnect.addListener(async function() {
        if (iframe) {
            iframe.contentWindow.postMessage('destruct', '*');
            iframe.parentNode.removeChild(iframe);
            iframe = null;
        }
        singletonePortToWorker = null;
        removeEventListener("message", listener);
        listener = null;
        clearTimeout(singletoneTimeoutID);
    });
    return _port;
}

async function main() {
    let iframe = document.querySelector('#sbox');
    if (iframe) {
        return false;
    }
    iframe = document.createElement('iframe');
    iframe.style = 'display: none;'
    iframe.id = 'sbox';
    iframe.src = chrome.runtime.getURL('/js/sandbox.html');

    singletonePortToWorker = await connectToSW(iframe);
   
    document.body.appendChild(iframe);

    listener = addEventListener("message", (event) => {
        try {
            singletonePortToWorker?.postMessage({...event.data, content_id: scriptId});
        }
        catch(e) {
            event.ports[0].postMessage({error: e});
        }
    }, false);
}

if (window.flag_sb_unique_st) {
    return false;
}
else {
    window.flag_sb_unique_st = true;
    main();
    return true;
}
})();
