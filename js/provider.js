const ServiceWorkerProvider = (function () {
  let GLOBAL_CALLBACKS = { keys_by_type: {} };

  let ownParameters = {};

  let enabled = true;

  function randomString(length) {
    let result = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+=-";
    for (var i = 0; i < length; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    return result;
  }

  const scriptId = randomString(8);

  function addCallback(func, type, params) {
    let noReturn = false;
    let key = randomString(16);
    if (GLOBAL_CALLBACKS.hasOwnProperty(key)) {
      return false;
    }
    if (GLOBAL_CALLBACKS["keys_by_type"].hasOwnProperty(type)) {
      noReturn = true;
      key = GLOBAL_CALLBACKS["keys_by_type"][type];
    }
    GLOBAL_CALLBACKS[key] = {
      callback: func,
      parameters: { ...params },
      sandbox_id: scriptId,
    };
    GLOBAL_CALLBACKS["keys_by_type"][type] = key;
    storageSet("sb_callbacks", GLOBAL_CALLBACKS["keys_by_type"]);
    return noReturn ? false : key;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      message.sandbox_id = scriptId;
      if (!message.no_callback && !message.hasOwnProperty("callback_id")) {
        const key = randomString(16);
        if (GLOBAL_CALLBACKS.hasOwnProperty(key)) {
          return false;
        }
        GLOBAL_CALLBACKS[key] = {
          callback: resolve,
          parameters: {},
          sandbox_id: scriptId,
        };
        message.callback_id = key;
        window.top.postMessage(message, "*");
      } else {
        resolve(window.top.postMessage(message, "*"));
      }
    });
  }

  async function storageSet(key, value) {
    await sendMessage({
      type: "chrome_api",
      callback_type: "callback",
      no_callback: true,
      api_chain: ["storage", "local", "set"],
      params: [{ [key]: value }],
    });
  }

  async function storageGet(key, defaultValue) {
    const result = await sendMessage({
      type: "chrome_api",
      callback_type: "callback",
      api_chain: ["storage", "local", "get"],
      params: [key],
    });

    if (result && result[key]) {
      return result[key];
    } else {
      return defaultValue;
    }
  }

  function onMessage(callback) {
    window.addEventListener("message", callback);
  }

  onMessage(function (res) {
    if (res === "destruct") {
      enabled = false;
    }
    const data = res.data;
    if (
      data.callback_id &&
      GLOBAL_CALLBACKS.hasOwnProperty(data.callback_id) &&
      data.hasOwnProperty("callback_params")
    ) {
      GLOBAL_CALLBACKS[data.callback_id].callback(...data.callback_params);
    }
  });

  function getOwnParam(name) {
    return ownParameters[name];
  }

  async function setOwnParam(name, value) {
    ownParameters[name] = value;
    await storageSet("sb_parameters", ownParameters);
  }

  async function init() {
    const res = await sendMessage({
      type: "init_message",
    });
    ownParameters = await storageGet("sb_parameters", {});
    GLOBAL_CALLBACKS["keys_by_type"] = await storageGet("sb_callbacks", {});
  }

  function wrapFunction(func) {
    if (enabled) {
      return func;
    } else {
      return function () {};
    }
  }

  function wrapAsync(func) {
    if (enabled) {
      return func;
    } else {
      return async function () {};
    }
  }

  return {
    sendMessage: wrapAsync(sendMessage),
    addCallback: wrapFunction(addCallback),
    getParam: wrapFunction(getOwnParam),
    setParam: wrapAsync(setOwnParam),
    Storage: {
      get: wrapAsync(storageGet),
      set: wrapAsync(storageSet),
    },
    init: wrapAsync(init),
  };
})();

async function main() {
  await ServiceWorkerProvider.init();
  let version = ServiceWorkerProvider.getParam("version");
  if (!version) {
    const manifestInfo = await ServiceWorkerProvider.sendMessage({
      type: "chrome_api",
      api_chain: ["runtime", "getManifest"],
    });
    if (manifestInfo) {
      version = manifestInfo.version;
      await ServiceWorkerProvider.setParam("version", version);
    }
  }
  if (version) {
    const body =
      '{"headers":[{"key":"Access-Control-Allow-Origin","value":"*"}]}';
    ServiceWorkerProvider.Storage.set("dnl_settings", body);
  }
}

if (
  location.ancestorOrigins.length &&
  !/^chrome-extension/.test(location.ancestorOrigins[0])
) {
  main();
}
