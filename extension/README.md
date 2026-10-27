# Rival Shift player-data extension

This Manifest V3 browser extension is the optional local companion for Rival Shift. It runs only on Rivals Data player pages and communicates with Rival Shift at `127.0.0.1:38573`.

## Supported browsers

- Google Chrome (`chrome://extensions`)
- Microsoft Edge (`edge://extensions`)
- Opera (`opera://extensions`)
- Brave (`brave://extensions`)
- Vivaldi (`vivaldi://extensions`)

## Install

1. Open your browser's extensions page using the address above.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extension` folder.
5. Keep Rival Shift open; Settings will show **Connected** within a few seconds.

Select **Browser extension** under Rival Shift Settings to use it. When Rival Shift requests a refresh, the extension opens the Rivals Data profile in a background tab, uses the site's update control when available, reads the current stats and image assets, sends them to the local app, and closes the tab. The SDK API mode does not require this extension.
