(() => {
  const CLS_TEXT = "sc-download-text";
  const CLS_DOWNLOAD_BTN = "sc-download-button";
  const dl_logo =
    "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+DQo8c3ZnIHdpZHRoPSIxNnB4IiBoZWlnaHQ9IjE2cHgiIHZpZXdCb3g9IjAgMCAxNiAxNiIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4bWxuczpza2V0Y2g9Imh0dHA6Ly93d3cuYm9oZW1pYW5jb2RpbmcuY29tL3NrZXRjaC9ucyI+DQogICAgPCEtLSBHZW5lcmF0b3I6IFNrZXRjaCAzLjAuMyAoNzg5MSkgLSBodHRwOi8vd3d3LmJvaGVtaWFuY29kaW5nLmNvbS9za2V0Y2ggLS0+DQogICAgPHRpdGxlPlJlY3RhbmdsZSAzMTwvdGl0bGU+DQogICAgPGRlc2M+Q3JlYXRlZCB3aXRoIFNrZXRjaC48L2Rlc2M+DQogICAgPGRlZnMvPg0KICAgIDxnIGlkPSJQYWdlLTEiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHNrZXRjaDp0eXBlPSJNU1BhZ2UiPg0KICAgICAgICA8cGF0aCBkPSJNMywxMSBMMywxMyBMMTMsMTMgTDEzLDExIEwzLDExIFogTTMsNCBMMTMsNCBMOCwxMCBMMyw0IFogTTYsMiBMNiw0IEwxMCw0IEwxMCwyIEw2LDIgWiIgaWQ9IlJlY3RhbmdsZS0zMSIgZmlsbD0icmdiKDM0LCAzNCwgMzQpIiBza2V0Y2g6dHlwZT0iTVNTaGFwZUdyb3VwIi8+DQogICAgPC9nPg0KPC9zdmc+DQo=";
  const timeout = async (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  const arrayIncludes = (string, array) => {
    for (let i = 0; i < array.length; i++) {
      if (string.includes(array[i])) return true;
    }
    return false;
  };

  const removeButtons = () => {
    document
      .querySelectorAll(`.${CLS_DOWNLOAD_BTN}`)
      .forEach((b) => b.remove());
    document
      .querySelectorAll(".sc-download-spinner-container")
      .forEach((b) => b.remove());
  };

  const clearButton = (buttonGroup) => {
    buttonGroup.querySelector(`.${CLS_DOWNLOAD_BTN}`)?.remove();
    buttonGroup.querySelector(".sc-download-spinner-container")?.remove();
  };

  const appendButton = (buttonGroup, small, parentGuest) => {
    if (!buttonGroup) buttonGroup = document.querySelector(".sc-button-group");
    clearButton(buttonGroup);
    const button = document.createElement("button");
    const text = document.createElement("span");
    button.classList.add(CLS_DOWNLOAD_BTN);
    text.classList.add(CLS_TEXT);
    if (small) {
      button.classList.add("sc-download-button-small");
      text.classList.add("sc-download-text-small");
      if (small === "tiny") text.classList.add("sc-download-text-hide");
    }
    // apply dl logo to the button
    dl_logo_img = document.createElement("img");
    dl_logo_img.src = dl_logo;
    dl_logo.style =
      "width: 24px; height: 28px; justify-content: center; align-items: center; display: flex; margin: 8px 16px;";
    button.appendChild(dl_logo_img);
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.setAttribute("title", "Download");
    if (parentGuest) {
      parentGuest.parentNode.insertBefore(button, parentGuest.nextSibling);
    } else {
      buttonGroup.appendChild(button);
    }
    button.appendChild(text);
    return button;
  };

  const parseHTML = async (url) => {
    const html = await fetch(url).then((r) => r.text());
    const json = JSON.parse(html.match(/(\[{)(.*)(?=;)/gm)[0]);
    const parsed = json[json.length - 1].data;
    return parsed;
  };

  const playlist = (button, group, id, parentGuest) => {
    button.onclick = async () => {
      const playlist = await parseHTML(window.location.href);
      if (playlist.kind === "track") {
        chrome.runtime.sendMessage({
          message: "download-track",
          id,
          track: playlist,
        });
      } else {
        chrome.runtime.sendMessage({
          message: "download-playlist",
          id,
          playlist,
        });
      }
    };
  };

  const user = (button, group, id, href) => {
    button.onclick = async () => {
      const user = await parseHTML(href);
      chrome.runtime.sendMessage({ message: "download-user", id, user });
    };
  };

  const scrollListener = () => {
    const buttonGroups = document.querySelectorAll(
      ".soundActions.sc-button-toolbar"
    );
    buttonGroups.forEach((g) => {
      const duplicate = g.querySelector(
        `${`.${CLS_DOWNLOAD_BTN}`}, .sc-download-spinner-container`
      );
      if (duplicate) return;
      const parent = g.parentElement.parentElement.parentElement;
      let button = null;
      let type = true;
      if (parent.classList.contains("soundBadge__content")) {
        button = appendButton(g, "tiny");
        type = "tiny";
      } else {
        button = appendButton(g, true);
      }
      button.onclick = async () => {
        const a = parent.querySelector(".soundTitle__title");
        if (!a) return;
        const json = await parseHTML(a.href);
        if (json.hasOwnProperty("tracks")) {
          chrome.runtime.sendMessage({
            message: "download-playlist",
            playlist: json,
            href: a.href,
          });
        } else {
          chrome.runtime.sendMessage({
            message: "download-track",
            track: json,
            href: a.href,
          });
        }
      };
    });
  };

  const track = async () => {
    if (
      arrayIncludes(window.location.href, ["/messages", "/you"]) &&
      !window.location.href.includes("history")
    )
      return;
    const duplicate = document.querySelector(`.${CLS_DOWNLOAD_BTN}`);
    let button = duplicate;
    let buttons = document.querySelector(".sc-button-group");
    if (!buttons) {
      await timeout(1000);
      buttons = document.querySelector(".sc-button-group");
    }
    if (!buttons) return;
    let urlBit = window.location.href
      .match(/(soundcloud.com\/)(.*)$/)?.[0]
      .replace("soundcloud.com/", "");
    if (urlBit.endsWith("/")) urlBit = urlBit.slice(0, -1);
    urlBit = urlBit
      .replace("/popular-tracks", "")
      .replace("/tracks", "")
      .replace("/albums", "")
      .replace("/sets", "")
      .replace("/reposts", "");
    if (window.location.href === `https://soundcloud.com/${urlBit}/sets`) {
      scrollListener();
      return window.addEventListener("scroll", scrollListener);
    }
    if (window.location.href.includes("/sets")) {
      const id = `sc-button-id-${Math.floor(Math.random() * 100)}`;
      buttons = document.querySelector(".systemPlaylistDetails__controls");
      const nodes = document.querySelectorAll(".systemPlaylistDetails__button");
      let parentGuest = nodes[nodes.length - 1];
      if (!buttons) {
        buttons = document.querySelector(".sc-button-group");
        parentGuest = null;
      }
      buttons.classList.add(id);
      removeButtons();
      button = appendButton(buttons, false, parentGuest);
      window.removeEventListener("scroll", scrollListener);
      return playlist(button, buttons, id, parentGuest);
    }
    if (
      arrayIncludes(window.location.href, [
        "/discover",
        "/stream",
        "/search",
        "/likes",
      ]) ||
      window.location.href.includes("history")
    ) {
      scrollListener();
      return window.addEventListener("scroll", scrollListener);
    }
    const id = `sc-button-id-${Math.floor(Math.random() * 100)}`;
    buttons.classList.add(id);
    if (!button) button = appendButton(buttons);
    if (!urlBit.includes("/")) {
      scrollListener();
      window.addEventListener("scroll", scrollListener);
      const href = `https://soundcloud.com/${urlBit}`;
      return user(button, buttons, id, href);
    }
    removeButtons();
    button = appendButton(buttons);
    window.removeEventListener("scroll", scrollListener);
    button.onclick = async () => {
      const track = await parseHTML(window.location.href);
      chrome.runtime.sendMessage({ message: "download-track", track, id });
    };
  };

  chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
      if (request.message == "history-change") {
        chrome.storage.sync.get("info", (result) => {
          if (!result?.info?.state || result.info.state === "on") {
            chrome.runtime.sendMessage({ message: "set-state", state: "on" });
            setTimeout(track, 100);
          }
        });
      }
      if (request.message === "update-state") {
        if (request.state === "off") {
          removeButtons();
          window.removeEventListener("scroll", scrollListener);
        } else {
          setTimeout(track, 100);
        }
      } else if (request.message === "download-stopped") {
        if (request.id) {
          const group = document.querySelector(`.${request.id}`);
          if (group) {
            group.classList.remove(request.id);
            clearButton(group);
            appendButton(group);
          }
        }
        track();
      } else if (request.message === "clear-spinner") {
        const buttonGroups = document.querySelectorAll(
          ".soundActions.sc-button-toolbar"
        );
        buttonGroups.forEach((g) => {
          let parent = g.parentElement.parentElement.parentElement;
          let a = parent.querySelector(".soundTitle__title");
          if (a?.href === request.href) {
            clearButton(g);
            let button = null;
            let type = true;
            if (parent.classList.contains("soundBadge__content")) {
              button = appendButton(g, "tiny");
              type = "tiny";
            } else {
              button = appendButton(g, true);
            }
            button.onclick = async () => {
              const json = await parseHTML(a.href);
              if (json.hasOwnProperty("tracks")) {
                chrome.runtime.sendMessage({
                  message: "download-playlist",
                  playlist: json,
                  href: a.href,
                });
              } else {
                chrome.runtime.sendMessage({
                  message: "download-track",
                  track: json,
                  href: a.href,
                });
              }
            };
          }
        });
      }
    }
  );

  chrome.storage.sync.get("info", (result) => {
    if (!result?.info?.state || result.info.state === "on") {
      setTimeout(track, 100);
    }
  });
})();
