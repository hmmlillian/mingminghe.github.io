// Note: everything is wrapped in a closure to prevent leaking globals
(function () {
    // history size for stroke undo/redo
    var gUndoSteps = 10;
    // image downsample resolution for the bottom level
    var gImageSize = 350;
    // paint mode
    var gPaintMode = 0
    // interation stroke radius
    var gStrokeRadius = 20;
    // mask feathering radius, for boundary blurring in getMask and getBlend
    var gFeatherRadius = 5;
    // mask refining radius, for boundary refinement in getRefinedMask and getRefinedBlend
    var gRefineRadius = 10;
    // contour extracking sample distance
    var gContourDistance = 2;
    // the dash interval of contour drawing
    var gContourDash = 3;
    // contour animation speed per frame
    var gContourAnimation = 1;
    // animation update FPS
    var gAnimationFPS = 20;
    
    var gImage = null;
    var gContourCanvas = null;
    var gOverlayCanvas = null;
    var gForeCanvas = null;
    var gBackCanvas = null;
    var gContourContext = null;
    var gOverlayContext = null;
    var gForeContext = null;
    var gBackContext = null;
    var gContourImageData = null;
    var gOverlayImageData = null;
    var gForeImageData = null;
    var gBackImageData = null;

    var gInited = false;
    var gUpdated = false;
    var gRefine = false;
    var gLeftDrag = false;
    var gRightDrag = false;
    var gLastPos = null;
    var gContoursNum = 0;
    var gDisplayTimer = 0;

    var gSetImageHandle = null;
    var gUpdateSelectionHandle = null;
    var gRestartSelectionHandle = null;
    var gFinishStrokeHandle = null;
    var gUndoStrokeHandle = null;
    var gRedoStrokeHandle = null;
    var gGetMaskHandle = null;
    var gGetRefinedMaskHandle = null;
    var gGetForegroundHandle = null;
    var gGetRefinedForegroundHandle = null;
    var gGetBackgroundHandle = null;
    var gGetRefinedBackgroundHandle = null;
    var gGetBlendHandle = null;
    var gGetRefinedBlendHandle = null;
    var gUpdateContoursHandle = null;
    var gGetContourFlagHandle = null;
    var gGetContourSizeHandle = null;
    var gGetContourHandle = null;

    // initialize core with input image
    // called once after updating the image before any core function
    function initDrag() {
        if (gInited || gImage == null || gImage.width == 0) {
            return;
        }
        gSetImageHandle = Module.cwrap('setImage', null, ['number', 'number', 'number', 'number', 'number']);
        gUpdateSelectionHandle = Module.cwrap('updateSelection', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
        gRestartSelectionHandle = Module.cwrap('restartSelection', null, []);
        gFinishStrokeHandle = Module.cwrap('finishStroke', null, []);
        gUndoStrokeHandle = Module.cwrap('undoStroke', null, []);
        gRedoStrokeHandle = Module.cwrap('redoStroke', null, []);
        gGetMaskHandle = Module.cwrap('getMask', null, ['number', 'number']);
        gGetRefinedMaskHandle = Module.cwrap('getRefinedMask', null, ['number', 'number']);
        gGetForegroundHandle = Module.cwrap('getForeground', null, ['number', 'number']);
        gGetRefinedForegroundHandle = Module.cwrap('getRefinedForeground', null, ['number', 'number']);
        gGetBackgroundHandle = Module.cwrap('getBackground', null, ['number', 'number']);
        gGetRefinedBackgroundHandle = Module.cwrap('getRefinedBackground', null, ['number', 'number']);
        gGetBlendHandle = Module.cwrap('getBlend', null, ['number', 'number']);
        gGetRefinedBlendHandle = Module.cwrap('getRefinedBlend', null, ['number', 'number']);
        gUpdateContoursHandle = Module.cwrap('updateContours', 'number', ['number']);
        gGetContourFlagHandle = Module.cwrap('getContourFlag', 'number', ['number']);
        gGetContourSizeHandle = Module.cwrap('getContourSize', 'number', ['number']);
        gGetContourHandle = Module.cwrap('getContour', null, ['number', 'number']);
        const imageData = gContourContext.getImageData(0, 0, gContourCanvas.width, gContourCanvas.height);
        var dataLen = imageData.data.length * imageData.data.BYTES_PER_ELEMENT;
        var dataPtr;
        try {
            dataPtr = Module._malloc(dataLen);
        }
        catch(err) {
            return false;
        }
        var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, dataLen);
        dataHeap.set(new Uint8Array(imageData.data.buffer));
        gSetImageHandle(gContourCanvas.width, gContourCanvas.height, dataHeap.byteOffset, gUndoSteps, gImageSize);
        Module._free(dataHeap.byteOffset);
        gInited = true;
        updateContour();
        return true;
    }

    // reset core to get rid of all previous interaction
    // display will be clear in this function
    function resetDrag() {
        if (gInited) {
            gRestartSelectionHandle();
            updateContour();
        }
    }

    // start dragging with left/right mouse button
    // called after mouse down event detected
    function startDrag(e) {
        if (!gLeftDrag && !gRightDrag) {
            gLeftDrag = e.button == 0;
            gRightDrag = e.button == 2;
            if (gLeftDrag || gRightDrag) {
                if (!gInited) {
                    initDrag();
                }
                gLastPos = [e.layerX, e.layerY];
                gUpdateSelectionHandle(gLastPos[0], gLastPos[1], e.layerX, e.layerY, gLeftDrag ? 255 : 0, gPaintMode > 0 ? 255 : 0, gStrokeRadius);
                gUpdated = true;
                updateContour();
            }
        }
    }

    // during dragging with mouse button pressed
    // called after mouse position updated with button pressed
    function doDrag(e) {
        if ((gLeftDrag || gRightDrag) && e.buttons) {
            gUpdateSelectionHandle(gLastPos[0], gLastPos[1], e.layerX, e.layerY, gLeftDrag ? 255 : 0, gPaintMode > 0 ? 255 : 0, gStrokeRadius);
            gUpdated = true;
            updateContour();
            gLastPos = [e.layerX, e.layerY];
        }
    }

    // end dragging
    // called after mouse up event detected
    function endDrag() {
        if (gLeftDrag || gRightDrag) {
            gFinishStrokeHandle();
            gLeftDrag = gRightDrag = false;
            gRefine = true;
            gUpdated = true;
            updateContour();
        }
    }

    // reset segmentation when space button is pressed
    // or switch between paint modes when 'p' is pressed
    // or undo/redo when 'u' or 'r' is pressed
    // called after keyboard press event detected
    function handleKey(e) {
        if (e.keyCode == 32) {
            gRestartSelectionHandle();
        }
        if (e.keyCode == 80) {
            gPaintMode = 1 - gPaintMode;
        }
        if (e.keyCode == 85) {
            gUndoStrokeHandle();
        }
        if (e.keyCode == 82) {
            gRedoStrokeHandle();
        }
        gRefine = true;
        gUpdated = true;
        updateContour();
    }

    // update contours for display
    // called after result updated, will also update the display
    function updateContour() {
        if (gInited) {
            gContoursNum = gUpdateContoursHandle(gContourDistance);
            updateDisplay();
        }
    }

    // update rendering with current contours
    // called by the animation timer or when contours are updated
    function updateDisplay() {
        if (!gInited && !initDrag()) {
            return;
        }
        // draw the left canvas
        gContourContext.putImageData(gContourImageData, 0, 0);
        for (i = 0; i < gContoursNum; i++) {
            var contourSize = gGetContourSizeHandle(i);
            if (contourSize < 20) {
                continue;
            }
            var contourFlag = gGetContourFlagHandle(i);
            var data = new Float32Array(contourSize * 2);
            var dataLen = data.length * data.BYTES_PER_ELEMENT;
            var dataPtr = Module._malloc(dataLen);
            var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, dataLen);
            dataHeap.set(new Uint8Array(data.buffer));
            gGetContourHandle(i, dataHeap.byteOffset);
            var result = new Float32Array(dataHeap.buffer, dataHeap.byteOffset, data.length);
            gContourContext.beginPath();
            for (j = 0; j < contourSize / gContourDash / 2; j += 2) {
                gContourContext.moveTo(result[((j * 2 + 0) * gContourDash + gDisplayTimer) % contourSize * 2 + 0], result[((j * 2 + 0) * gContourDash + gDisplayTimer) % contourSize * 2 + 1]);
                gContourContext.quadraticCurveTo(result[((j * 2 + 1) * gContourDash + gDisplayTimer) % contourSize * 2 + 0], result[((j * 2 + 1) * gContourDash + gDisplayTimer) % contourSize * 2 + 1], result[((j * 2 + 2) * gContourDash + gDisplayTimer) % contourSize * 2 + 0], result[((j * 2 + 2) * gContourDash + gDisplayTimer) % contourSize * 2 + 1]);
            }
            gContourContext.lineWidth = 6;
            gContourContext.strokeStyle = contourFlag < 0 ? 'rgba(0,255,0,0.5)' : 'rgba(0,0,255,0.5)';
            gContourContext.stroke();
            Module._free(dataHeap.byteOffset);
        }
        // Disable animation during dragging
        if (!gLeftDrag && !gRightDrag) {
            gDisplayTimer += gContourAnimation;
        }
        // draw other canvases
        if (gUpdated) {
            var data = new Uint8Array(gContourCanvas.width * gContourCanvas.height * 4);
            var dataLen = data.length * data.BYTES_PER_ELEMENT;
            var dataPtr = Module._malloc(dataLen);
            var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, dataLen);
            dataHeap.set(new Uint8Array(data.buffer));
            var result = new Uint8Array(dataHeap.buffer, dataHeap.byteOffset, data.length);
            gRefine ? gGetRefinedBackgroundHandle(dataHeap.byteOffset, gRefineRadius) : gGetBackgroundHandle(dataHeap.byteOffset, gFeatherRadius);
            for(var i = 0; i < gBackImageData.data.length; i++){
                gBackImageData.data[i] = result[i];
            }
            gBackContext.putImageData(gBackImageData, 0, 0);
            
            
            
            gRefine ? gGetRefinedForegroundHandle(dataHeap.byteOffset, gRefineRadius) : gGetForegroundHandle(dataHeap.byteOffset, gFeatherRadius);
            for(var i = 0; i < gForeImageData.data.length; i++){
                gForeImageData.data[i] = result[i];
            }
            gForeContext.putImageData(gForeImageData, 0, 0);
            
            gRefine ? gGetRefinedBlendHandle(dataHeap.byteOffset, gRefineRadius) : gGetBlendHandle(dataHeap.byteOffset, gFeatherRadius);
            for(var i = 0; i < gOverlayImageData.data.length; i++){
                gOverlayImageData.data[i] = result[i];
            }
            gOverlayContext.putImageData(gOverlayImageData, 0, 0);
            Module._free(dataHeap.byteOffset);
            gRefine = false;
            gUpdated = false;
        }
    }

    // Initialize the system
    function setup() {
        // get frequently used elements from DOM
        gContourCanvas = document.getElementById("contourCanvas");
        gOverlayCanvas = document.getElementById("overlayCanvas");
        gForeCanvas = document.getElementById("foreCanvas");
        gBackCanvas = document.getElementById("backCanvas");
        gContourContext = gContourCanvas.getContext("2d");
        gOverlayContext = gOverlayCanvas.getContext("2d");
        gForeContext = gForeCanvas.getContext("2d");
        gBackContext = gBackCanvas.getContext("2d");

        // load the default image into canvas
        gImage = new Image();
        gImage.src = "test.jpg";
        gImage.addEventListener("load", () => {
            resizeRate = Math.sqrt(500000. / (gImage.width * gImage.height));
            gContourCanvas.width = gOverlayCanvas.width = gForeCanvas.width = gBackCanvas.width = gImage.width * resizeRate;
            gContourCanvas.height = gOverlayCanvas.height = gForeCanvas.height = gBackCanvas.height = gImage.height * resizeRate;
            gImage.style.display = "none";
            gContourContext.drawImage(gImage, 0, 0, gContourCanvas.width, gContourCanvas.height);
            gContourImageData = gContourContext.getImageData(0, 0, gContourCanvas.width, gContourCanvas.height);
            gOverlayImageData = gOverlayContext.createImageData(gOverlayCanvas.width, gOverlayCanvas.height);
            gForeImageData = gForeContext.createImageData(gForeCanvas.width, gForeCanvas.height);
            gBackImageData = gBackContext.createImageData(gBackCanvas.width, gBackCanvas.height);
            gInited = false;
            gUpdated = true;
        });

        // add file input image loading
        document.getElementById('fileInput').addEventListener('change', function() {
            var file = this.files[0];
            var reader = new FileReader();
            reader.onload = (function(aImg) { return function(e) { aImg.src = e.target.result; }; })(gImage);
            reader.readAsDataURL(file);
        }, false);
        
        // add file output image writing
        document.getElementById('foreSave').addEventListener('click', function() {
            var a = document.createElement('a');
            a.href = gForeCanvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
            a.download = "foreground.png";
            a.click();
        }, false);
        // add file output image writing
        document.getElementById('backSave').addEventListener('click', function() {
            var a = document.createElement('a');
            a.href = gBackCanvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
            a.download = "background.png";
            a.click();
        }, false);

        // register mouse handlers on canvas
        gContourCanvas.addEventListener("mousemove", doDrag);
        gContourCanvas.addEventListener("mousedown", startDrag);
        gContourCanvas.addEventListener("mouseup", endDrag);
        gContourCanvas.addEventListener("mouseout", endDrag);
        window.addEventListener("blur", endDrag);
        document.addEventListener("keydown", handleKey);

        // disable right mouse menu
        gContourCanvas.oncontextmenu = function(e) {e.preventDefault();};

        // start animation timer
        setInterval(updateDisplay, 1000 / gAnimationFPS);
    }

    // call setup function when DOM is finished loading
    document.addEventListener("DOMContentLoaded", setup, false);
})();
