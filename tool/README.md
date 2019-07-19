<a id="Build"></a>
### Build (optional)
```
cd SnapcutJS
sh ./compile.sh
```

<a id="Demo"></a>
## Demo

<a id="SetupServer"></a>
### Set-up the server
```
cd SnapcutJS
python -m SimpleHTTPServer 8000
```

<a id="Run"></a>
### Run the demo in a browser
Go to address http://127.0.0.1:8000

The demo will start with a default test input image.

You can upload any other image by pressing the file input button in the bottom.

<a id="Interaction"></a>
### Interaction
There will be two windows in the demo page, interaction window and result window.

You can do segmentation interaction with mouse in the interaction window on the input image.

Press left mouse button for foreground stroke, and right mouse button for background stroke.

And the segmentation contours will be visualized instantly with dash lines in this window.

The segmented object will be displayed instantly in the result window, blended above the check-board pattern.

Press the space keyboard button to restart the interaction.
