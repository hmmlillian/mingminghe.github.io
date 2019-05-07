#!/bin/bash
# Script to compile SnapCutJS c++ source files into core.js
emsdk/emsdk list
emsdk/emsdk install latest
emsdk/emsdk activate latest
source emsdk/emsdk_env.sh
# In case there's out of memory error, increase the TOTAL_MEMORY value
emcc -O2 src/Filters.cpp src/MaxflowGraph.cpp src/QuickSelection.cpp src/wrapper.cpp -o core.js -s EXPORTED_FUNCTIONS='["_setImage", "_updateSelection", "_restartSelection", "_finishStroke", "_undoStroke", "_redoStroke", "_updateContours", "_getMask", "_getRefinedMask", "_getForeground", "_getRefinedForeground", "_getBackground", "_getRefinedBackground", "_getBlend", "_getRefinedBlend", "_getContourFlag", "_getContourSize", "_getContour"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["cwrap"]' -s TOTAL_MEMORY=134217728
